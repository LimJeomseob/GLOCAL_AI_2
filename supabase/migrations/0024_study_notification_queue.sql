-- ============================================================================
-- 연구모임 대표자 상태 안내 메일 — 자동 큐 + 관리자 승인 발송
--
-- 화면은 "심사 결과는 대표자 이메일로 안내"를 약속하지만 발송 인프라가 없었다.
-- study_notifications(0015)는 로그 테이블로 설계된 채 비어 있었고, 메일 API·pg_net·pg_cron
-- 어느 것도 없다. 정적 배포라 서버가 없으므로 다음 분업으로 구현한다.
--   · 큐 적재: DB 트리거. 상태 전이 경로가 셋(study-submit의 draft→submitted,
--     finalize_study_review()의 일괄 selected/rejected, 관리자 <select>의 직접 UPDATE)이라
--     트리거만이 세 경로를 모두 잡는다.
--   · 발송: Edge Function study-notify(service role)가 관리자 승인 시 Resend API로 보낸다.
--
-- 발송 대상은 연구모임 대표자(leader_email)뿐이다. 전문가 신청자에게는 보내지 않는다(운영 결정).
-- 발송 단계는 접수확인·심사결과(선발/미선발)·이수확정 세 가지. 운영안내·제출독려는 이번 범위 밖.
--
-- 제목·본문은 큐에 넣는 시점에 템플릿을 치환해 저장한다 — 관리자가 보낼 내용을 그대로 보고
-- 고친 뒤 승인하기 위함. 템플릿은 관리자가 편집한다(kakao_templates와 같은 방식).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- study_notification_templates — 단계별 제목·본문 (관리자 편집)
-- 선발/미선발은 문구가 전혀 달라 행을 둘로 나눈다. 트리거가 전이 상태로 행을 고른다.
-- ----------------------------------------------------------------------------
create table if not exists public.study_notification_templates (
  stage text primary key,
  subject text not null default '',
  body text not null default '',
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.study_notification_templates is
  '연구모임 대표자 안내 메일 템플릿. 치환 변수: {성명} {접수번호} {모임명} {회차명} {접수일} {조회주소}. enabled=false면 그 단계는 큐에 넣지 않는다.';

create or replace trigger trg_study_notification_templates_updated_at
before update on public.study_notification_templates
for each row execute function public.set_updated_at();

insert into public.study_notification_templates (stage, subject, body) values
  (
    '접수확인',
    '[AI 활용 연구모임] {모임명} 신청이 접수되었습니다 ({접수번호})',
    '{성명} 대표자님, 안녕하세요. 경상국립대학교 AI융합원입니다.' || chr(10) || chr(10) ||
    '{회차명}에 신청하신 연구모임 「{모임명}」의 신청서와 연구계획서가 접수되었습니다.' || chr(10) ||
    '· 접수번호: {접수번호}' || chr(10) ||
    '· 접수일: {접수일}' || chr(10) || chr(10) ||
    '심사 결과는 이 메일 주소와 「내 연구모임」 화면으로 안내드립니다.' || chr(10) ||
    '진행 상태 확인: {조회주소}' || chr(10) || chr(10) ||
    '문의: 경상국립대학교 AI융합원 (055-772-4452)'
  ),
  (
    '심사결과_선발',
    '[AI 활용 연구모임] {모임명} 선발 결과 안내 ({접수번호})',
    '{성명} 대표자님, 안녕하세요. 경상국립대학교 AI융합원입니다.' || chr(10) || chr(10) ||
    '{회차명} 계획서 심사 결과, 연구모임 「{모임명}」(접수번호 {접수번호})이 선발되었습니다. 축하드립니다.' || chr(10) || chr(10) ||
    '운영 일정과 단계별 워크숍 안내는 추후 별도로 드리며, 「내 연구모임」 화면에서 진행 상태를 확인하실 수 있습니다.' || chr(10) ||
    '진행 상태 확인: {조회주소}' || chr(10) || chr(10) ||
    '문의: 경상국립대학교 AI융합원 (055-772-4452)'
  ),
  (
    '심사결과_미선발',
    '[AI 활용 연구모임] {모임명} 심사 결과 안내 ({접수번호})',
    '{성명} 대표자님, 안녕하세요. 경상국립대학교 AI융합원입니다.' || chr(10) || chr(10) ||
    '{회차명} 계획서 심사 결과, 연구모임 「{모임명}」(접수번호 {접수번호})은 아쉽게도 이번 회차에 선발되지 못했습니다.' || chr(10) ||
    '지원해 주셔서 감사드리며, 다음 회차에 다시 신청해 주시기를 바랍니다.' || chr(10) || chr(10) ||
    '문의: 경상국립대학교 AI융합원 (055-772-4452)'
  ),
  (
    '이수확정',
    '[AI 활용 연구모임] {모임명} 이수가 확정되었습니다 ({접수번호})',
    '{성명} 대표자님, 안녕하세요. 경상국립대학교 AI융합원입니다.' || chr(10) || chr(10) ||
    '{회차명} 연구모임 「{모임명}」(접수번호 {접수번호})의 결과보고서 검토가 끝나 이수가 확정되었습니다.' || chr(10) ||
    '한 학기 동안 수고 많으셨습니다. 이수 혜택 지급 등 후속 안내는 별도로 드리겠습니다.' || chr(10) || chr(10) ||
    '문의: 경상국립대학교 AI융합원 (055-772-4452)'
  )
on conflict (stage) do nothing;

alter table public.study_notification_templates enable row level security;

drop policy if exists "study_notification_templates_admin_all" on public.study_notification_templates;
create policy "study_notification_templates_admin_all" on public.study_notification_templates
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- study_notifications 확장 — 렌더링된 제목·본문, 전이 상태, 승인자, 발송 서비스 메시지 id
-- ----------------------------------------------------------------------------
alter table public.study_notifications
  add column if not exists subject text not null default '',
  add column if not exists body text not null default '',
  add column if not exists trigger_status text not null default '',
  add column if not exists approved_by text not null default '',
  add column if not exists provider_message_id text not null default '',
  add column if not exists updated_at timestamptz not null default now();

comment on column public.study_notifications.trigger_status is
  '큐에 넣은 상태 전이의 새 값(submitted/selected/rejected/completed). 같은 단계의 재적재·뒤집힘 판정에 쓴다.';
comment on column public.study_notifications.approved_by is
  '발송을 승인한 관리자 이메일. Edge Function이 JWT에서 채운다.';
comment on column public.study_notifications.provider_message_id is
  '발송 서비스(Resend)가 돌려준 메시지 id. 배달 추적용.';

-- 0015의 인라인 CHECK는 자동 명명(study_notifications_status_check)이므로 이름으로 지우고 다시 건다.
-- '취소'는 관리자가 보내지 않기로 한 건(뒤집힌 선발 결과 등)을 큐에서 걷어내되 이력은 남기기 위한 상태.
alter table public.study_notifications
  drop constraint if exists study_notifications_status_check;
alter table public.study_notifications
  add constraint study_notifications_status_check
  check (status in ('대기', '성공', '실패', '취소'));

create or replace trigger trg_study_notifications_updated_at
before update on public.study_notifications
for each row execute function public.set_updated_at();

create index if not exists study_notifications_status_idx
  on public.study_notifications (status, created_at desc);

-- ----------------------------------------------------------------------------
-- 템플릿 치환. format()은 본문의 %와 충돌하므로 replace()로 돈다.
-- replace()는 인자가 NULL이면 결과 전체가 NULL이 되므로 값을 coalesce로 막는다.
-- ----------------------------------------------------------------------------
create or replace function public.render_study_notification_template(p_template text, p_vars jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_out text := coalesce(p_template, '');
  v_key text;
  v_val text;
begin
  for v_key, v_val in
    select key, value from jsonb_each_text(coalesce(p_vars, '{}'::jsonb))
  loop
    v_out := replace(v_out, '{' || v_key || '}', coalesce(v_val, ''));
  end loop;
  return v_out;
end;
$$;

comment on function public.render_study_notification_template(text, jsonb) is
  '안내 메일 템플릿의 {변수}를 jsonb 값으로 치환한다.';

-- ----------------------------------------------------------------------------
-- 큐 적재. 트리거와 분리해 두어 규칙을 한곳에서 읽을 수 있게 한다.
--
-- 중복 방지: 같은 모임·단계·전이 상태로 대기/성공 행이 있으면 넣지 않는다
--   (finalize_study_review 재실행, 관리자 select 재선택에 안전).
-- 뒤집힘: 같은 모임·단계에 대기 행이 있는데 전이 상태가 다르면(선발↔미선발) 기존 대기 행을
--   '취소'로 바꾸고 새로 넣는다. 이미 보낸(성공) 행은 이력이므로 손대지 않는다.
-- 수신자 공백: 보낼 수 없음을 '실패' 행으로 남겨 관리자 화면에 드러낸다.
-- ----------------------------------------------------------------------------
create or replace function public.enqueue_study_notification(
  p_group_id uuid,
  p_stage text,
  p_template_stage text,
  p_trigger_status text,
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
  v_exists boolean;
begin
  select * into v_template
  from public.study_notification_templates
  where stage = p_template_stage;

  if not found or not v_template.enabled then
    return;
  end if;

  select exists (
    select 1 from public.study_notifications
    where group_id = p_group_id
      and stage = p_stage
      and trigger_status = p_trigger_status
      and status in ('대기', '성공')
  ) into v_exists;

  if v_exists then
    return;
  end if;

  update public.study_notifications
  set status = '취소',
      error_message = '상태가 ' || p_trigger_status || '(으)로 바뀌어 자동 취소됨'
  where group_id = p_group_id
    and stage = p_stage
    and status = '대기'
    and trigger_status <> p_trigger_status;

  insert into public.study_notifications (
    group_id, stage, channel, recipient, status, subject, body, trigger_status, error_message
  ) values (
    p_group_id,
    p_stage,
    'email',
    coalesce(p_recipient, ''),
    case when coalesce(btrim(p_recipient), '') = '' then '실패' else '대기' end,
    public.render_study_notification_template(v_template.subject, p_vars),
    public.render_study_notification_template(v_template.body, p_vars),
    p_trigger_status,
    case when coalesce(btrim(p_recipient), '') = '' then '대표자 이메일이 비어 있어 보낼 수 없습니다.' else '' end
  );
end;
$$;

comment on function public.enqueue_study_notification(uuid, text, text, text, text, jsonb) is
  '상태 전이 1건을 안내 메일 큐(study_notifications)에 넣는다. 중복·뒤집힘·수신자 공백을 처리한다.';

-- ----------------------------------------------------------------------------
-- study_groups 상태 전이 → 큐. AFTER 트리거로 건다: BEFORE 트리거(check_study_group_submit)는
-- 관리자에게 조기 return하고 접수번호·submitted_at을 채우므로, 그 뒤에 읽어야 값이 온전하다.
--
-- Postgres는 UPDATE OF status를 값이 같아도 SET에 status가 있으면 발화시키므로
-- (관리자 select 재선택, finalize_study_review 재실행, markInProgress) 함수 안에서 거른다.
-- 큐 적재가 실패해도 상태 전이(신청자의 계획서 제출, 선발 확정)를 막아서는 안 되므로
-- 본문 전체를 예외 흡수로 감싼다.
-- ----------------------------------------------------------------------------
create or replace function public.enqueue_study_group_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage text;
  v_template_stage text;
  v_round_title text;
  v_vars jsonb;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return null;
  end if;

  case new.status
    when 'submitted' then
      v_stage := '접수확인';
      v_template_stage := '접수확인';
    when 'selected' then
      v_stage := '심사결과';
      v_template_stage := '심사결과_선발';
    when 'rejected' then
      v_stage := '심사결과';
      v_template_stage := '심사결과_미선발';
    when 'completed' then
      v_stage := '이수확정';
      v_template_stage := '이수확정';
    else
      return null;
  end case;

  begin
    select title into v_round_title from public.study_rounds where id = new.round_id;

    v_vars := jsonb_build_object(
      '성명', new.leader_name,
      '접수번호', new.code,
      '모임명', new.name,
      '회차명', coalesce(v_round_title, ''),
      '접수일', to_char(coalesce(new.submitted_at, now()) at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'),
      '조회주소', 'https://limjeomseob.github.io/GLOCAL_AI_2/lookup/'
    );

    perform public.enqueue_study_notification(
      new.id, v_stage, v_template_stage, new.status, new.leader_email, v_vars
    );
  exception when others then
    raise warning 'study_notifications enqueue failed for group %: %', new.id, sqlerrm;
  end;

  return null;
end;
$$;

comment on function public.enqueue_study_group_notification() is
  'study_groups 상태 전이(submitted/selected/rejected/completed)를 안내 메일 큐에 넣는다. 실패해도 전이를 막지 않는다.';

drop trigger if exists trg_enqueue_study_group_notification on public.study_groups;
create trigger trg_enqueue_study_group_notification
after insert or update of status on public.study_groups
for each row execute function public.enqueue_study_group_notification();
