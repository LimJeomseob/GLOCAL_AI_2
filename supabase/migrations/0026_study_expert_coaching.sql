-- ============================================================================
-- 팀별 전문가 매칭 + 코칭 일정(일시·장소) 조율
--
-- 전문가 배정은 지금까지 study_expert_applications.note 자유 텍스트에만 적혀 있어
-- 팀·전문가를 잇는 데이터가 없었고, 일정 조율은 전화·메일로 이뤄져 기록이 남지 않았다.
-- 공문상 코칭은 팀당 3회(기획·제작·환류), 운영기간 9.28~11.13이다.
--
-- 설계:
--   · 배정은 관리자만 한다(study_groups.expert_id). 팀당 전문가 1명 — 전문가 5명 내외 대 팀 10개.
--   · 일정은 팀이 제안하고 전문가가 가능/불가로 응답한 뒤 어느 한쪽이 확정한다.
--     회차(1~3)마다 제안이 여러 건 쌓일 수 있고, 확정은 회차당 1건만 허용한다.
--   · 조율 대화는 study_coaching_memos에 남긴다(팀·전문가·관리자 공용 스레드).
--   · 공개 경로(팀·전문가)의 쓰기는 기존 규약대로 Edge Function(study-submit, service role)만 거친다.
--     따라서 이 테이블들에도 익명 정책을 두지 않고 관리자 정책만 건다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. 배정 — study_groups.expert_id
-- ----------------------------------------------------------------------------
alter table public.study_groups
  add column if not exists expert_id uuid references public.study_expert_applications(id) on delete set null,
  add column if not exists expert_assigned_at timestamptz;

comment on column public.study_groups.expert_id is
  '배정된 교내 AI활용 전문가(study_expert_applications). 관리자만 배정한다. 전문가 신청이 지워지면 배정만 풀린다.';
comment on column public.study_groups.expert_assigned_at is
  '전문가 배정 시각. 배정 해제 시 null로 되돌린다.';

create index if not exists study_groups_expert_id_idx on public.study_groups (expert_id);

-- 전문가 본인확인 조회(성명 + 연락처) 전용 — study_groups_lookup_idx와 같은 설계
create index if not exists study_expert_applications_lookup_idx
  on public.study_expert_applications (name, phone);

-- ----------------------------------------------------------------------------
-- 2. 코칭 일정 — 제안 / 응답 / 확정
--
-- status 전이: 제안 → 가능|불가 → 확정. '불가'가 된 제안은 이력으로 남긴다.
-- 회차당 확정 1건은 부분 유니크 인덱스로 강제한다(제안은 여러 건 허용해야 하므로 제약을 걸 수 없다).
-- ----------------------------------------------------------------------------
create table if not exists public.study_coaching_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups(id) on delete cascade,

  -- 1 기획 / 2 제작 / 3 환류 — 공문의 코칭 3회
  session_no int not null check (session_no between 1 and 3),

  met_at date not null,
  start_time time,
  end_time time,
  location text not null default '',

  status text not null default '제안' check (status in ('제안', '가능', '불가', '확정')),
  proposed_by text not null check (proposed_by in ('팀', '전문가', '관리자')),

  -- 전문가가 가능/불가와 함께 남기는 한 줄 사유(예: "오전만 가능")
  expert_note text not null default '',

  confirmed_by text not null default '',
  confirmed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.study_coaching_sessions is
  '코칭 일정 제안·응답·확정. 회차(session_no 1~3)마다 제안이 여러 건 쌓이고 확정은 1건만 남는다.';
comment on column public.study_coaching_sessions.proposed_by is
  '이 제안을 올린 주체. 팀·전문가 어느 쪽도 먼저 제안할 수 있다.';

create index if not exists study_coaching_sessions_group_idx
  on public.study_coaching_sessions (group_id, session_no, created_at);

-- 회차당 확정 1건. 제안·가능·불가 행은 제한하지 않는다.
create unique index if not exists study_coaching_sessions_confirmed_unique
  on public.study_coaching_sessions (group_id, session_no)
  where status = '확정';

create or replace trigger trg_study_coaching_sessions_updated_at
before update on public.study_coaching_sessions
for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. 조율 메모 — 팀·전문가·관리자 공용 스레드
-- ----------------------------------------------------------------------------
create table if not exists public.study_coaching_memos (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups(id) on delete cascade,
  author_role text not null check (author_role in ('팀', '전문가', '관리자')),
  author_name text not null default '',
  body text not null check (btrim(body) <> ''),
  created_at timestamptz not null default now()
);

comment on table public.study_coaching_memos is
  '코칭 일정 조율 메모. 팀 대표자·배정 전문가·관리자가 같은 스레드에 남긴다. 수정은 없고 추가만 한다.';

create index if not exists study_coaching_memos_group_idx
  on public.study_coaching_memos (group_id, created_at);

-- ----------------------------------------------------------------------------
-- 4. RLS — 관리자만 직접 접근. 공개 경로는 Edge Function(service role)이 대행한다.
-- ----------------------------------------------------------------------------
alter table public.study_coaching_sessions enable row level security;
alter table public.study_coaching_memos enable row level security;

drop policy if exists "study_coaching_sessions_admin_all" on public.study_coaching_sessions;
create policy "study_coaching_sessions_admin_all" on public.study_coaching_sessions
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "study_coaching_memos_admin_all" on public.study_coaching_memos;
create policy "study_coaching_memos_admin_all" on public.study_coaching_memos
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- 5. 안내 메일 연동
--
-- 0024의 큐를 그대로 쓰되 단계 '코칭일정'을 더한다. 0024의 상태 전이 큐와 달리 코칭은
-- 같은 단계가 여러 번(회차 3회 × 제안·응답·확정) 반복되므로 중복 방지·뒤집힘 규칙을
-- 적용하지 않는 별도 적재 함수를 둔다 — enqueue_study_notification을 고치면
-- 심사 결과 안내의 중복 방지가 깨진다.
-- ============================================================================

-- 0015의 인라인 CHECK는 자동 명명(study_notifications_stage_check)이다. 이름으로 지우고 다시 건다.
alter table public.study_notifications
  drop constraint if exists study_notifications_stage_check;
alter table public.study_notifications
  add constraint study_notifications_stage_check
  check (stage in ('접수확인', '심사결과', '운영안내', '제출독려', '이수확정', '코칭일정'));

insert into public.study_notification_templates (stage, subject, body) values
  (
    '코칭_제안',
    '[AI 활용 연구모임] {모임명} 코칭 일정 제안 ({회차})',
    '{성명}님, 안녕하세요. 경상국립대학교 AI융합원입니다.' || chr(10) || chr(10) ||
    '연구모임 「{모임명}」(접수번호 {접수번호})의 {회차} 코칭 일정이 제안되었습니다.' || chr(10) ||
    '· 일시: {일시}' || chr(10) ||
    '· 장소: {장소}' || chr(10) || chr(10) ||
    '가능 여부를 확인해 주세요. 조율은 아래 화면의 메모로 하실 수 있습니다.' || chr(10) ||
    '일정 확인: {조회주소}' || chr(10) || chr(10) ||
    '문의: 경상국립대학교 AI융합원 (055-772-4452)'
  ),
  (
    '코칭_응답',
    '[AI 활용 연구모임] {모임명} 코칭 일정 회신 ({회차})',
    '{성명}님, 안녕하세요. 경상국립대학교 AI융합원입니다.' || chr(10) || chr(10) ||
    '연구모임 「{모임명}」(접수번호 {접수번호})의 {회차} 코칭 일정 제안에 회신이 도착했습니다.' || chr(10) ||
    '· 일시: {일시}' || chr(10) ||
    '· 장소: {장소}' || chr(10) ||
    '· 회신: {회신}' || chr(10) || chr(10) ||
    '일정 확인: {조회주소}' || chr(10) || chr(10) ||
    '문의: 경상국립대학교 AI융합원 (055-772-4452)'
  ),
  (
    '코칭_확정',
    '[AI 활용 연구모임] {모임명} 코칭 일정이 확정되었습니다 ({회차})',
    '{성명}님, 안녕하세요. 경상국립대학교 AI융합원입니다.' || chr(10) || chr(10) ||
    '연구모임 「{모임명}」(접수번호 {접수번호})의 {회차} 코칭 일정이 확정되었습니다.' || chr(10) ||
    '· 일시: {일시}' || chr(10) ||
    '· 장소: {장소}' || chr(10) || chr(10) ||
    '일정 확인: {조회주소}' || chr(10) || chr(10) ||
    '문의: 경상국립대학교 AI융합원 (055-772-4452)'
  )
on conflict (stage) do nothing;

-- ----------------------------------------------------------------------------
-- 코칭 안내 적재. 0024의 enqueue_study_notification과 달리 중복 방지·뒤집힘 처리가 없다
-- (같은 회차에 제안이 여러 번 오가는 것이 정상이므로 모두 큐에 남겨야 한다).
-- 수신자 공백은 같은 방식으로 '실패' 행을 남겨 관리자 화면에 드러낸다.
-- ----------------------------------------------------------------------------
create or replace function public.enqueue_study_coaching_notification(
  p_group_id uuid,
  p_template_stage text,
  p_recipient text,
  p_vars jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template public.study_notification_templates%rowtype;
begin
  select * into v_template
  from public.study_notification_templates
  where stage = p_template_stage;

  if not found or not v_template.enabled then
    return;
  end if;

  insert into public.study_notifications (
    group_id, stage, channel, recipient, status, subject, body, trigger_status, error_message
  ) values (
    p_group_id,
    '코칭일정',
    'email',
    coalesce(p_recipient, ''),
    case when coalesce(btrim(p_recipient), '') = '' then '실패' else '대기' end,
    public.render_study_notification_template(v_template.subject, p_vars),
    public.render_study_notification_template(v_template.body, p_vars),
    p_template_stage,
    case when coalesce(btrim(p_recipient), '') = '' then '수신자 이메일이 비어 있어 보낼 수 없습니다.' else '' end
  );
end;
$$;

comment on function public.enqueue_study_coaching_notification(uuid, text, text, jsonb) is
  '코칭 일정 제안·응답·확정 1건을 안내 메일 큐에 넣는다. 같은 회차에 여러 건이 쌓이므로 중복 방지를 걸지 않는다.';

-- ----------------------------------------------------------------------------
-- 6. 적재 함수 실행 권한 — service role(Edge Function)과 트리거만 쓴다.
--
-- Supabase는 public 스키마 함수에 anon·authenticated 실행 권한을 기본으로 준다.
-- security definer인 적재 함수를 익명이 RPC로 직접 부르면 수신자·본문 변수를 임의로 채운
-- 행을 안내 큐에 넣을 수 있으므로 회수한다. 0024의 상태 전이 적재 함수도 함께 막는다
-- (트리거 안에서는 소유자 권한으로 실행되므로 영향이 없다).
-- ----------------------------------------------------------------------------
revoke execute on function public.enqueue_study_coaching_notification(uuid, text, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.enqueue_study_notification(uuid, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.enqueue_study_coaching_notification(uuid, text, text, jsonb)
  to service_role;
