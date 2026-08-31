-- ============================================================================
-- AI 활용 연구모임 — 운영·결과보고 기반 (전략 §Ⅴ 3·4단계)
--
-- 회의록([서식 3])·결과보고서([서식 2])·산출물을 담는다. 이 세 테이블이 사업 종료 후
-- "자료집·동영상 제작"과 "공동교육센터 협업, 도내 13개 대학 콘텐츠 제공"의 원장(原帳)이 된다.
-- 산출물을 자유 텍스트가 아니라 링크 레코드로 받는 이유가 여기에 있다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- study_meetings — 회의록 ([서식 3], 팀당 반복 제출)
-- ----------------------------------------------------------------------------
create table if not exists public.study_meetings (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups(id) on delete cascade,

  met_at date not null,
  start_time time,
  end_time time,
  location text not null default '',
  subject text not null,
  content text not null default '',
  author_name text not null default '',

  -- [{path, name, size, type}] — study-attachments 버킷의 객체 키
  attachments jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.study_meetings is
  '[서식 3] 회의록. 결과보고서의 첨부서류(별첨4)로 자동 연결되며, 다과비 산출근거(팀당 평균 3회)의 진척 지표로도 쓰인다.';

create index if not exists study_meetings_group_id_idx on public.study_meetings (group_id, met_at desc);

create or replace trigger trg_study_meetings_updated_at
before update on public.study_meetings
for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- study_reports — 결과보고서 ([서식 2], 1:1)
-- ----------------------------------------------------------------------------
create table if not exists public.study_reports (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null unique references public.study_groups(id) on delete cascade,

  -- 표지: 신청서에서 승계하되 실제 수행기간으로 수정 가능
  actual_period_start date,
  actual_period_end date,

  section1_background text not null default '',        -- 1. 연구모임의 구성 배경
  section2_topic_purpose text not null default '',     -- 2. 연구 주제 및 목적
  section3_operation text not null default '',         -- 3. 운영 및 연구 내용
  section4_result_use text not null default '',        -- 4. 결과 및 활용 방안
  section5_effect_suggestion text not null default '', -- 5. 효과 및 제언
  -- 6. 산출물 제작 결과 → study_outputs 로 구조화 분리

  char_count int not null default 0,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.study_reports is
  '[서식 2] 결과보고서 1~5번 항목. 6번(산출물 제작 결과)은 study_outputs로 구조화해 분리했다.';

create or replace trigger trg_study_reports_updated_at
before update on public.study_reports
for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- study_outputs — 산출물 링크 ([서식 2] 6번)
--
-- 근거문서 주석: "결과물의 링크를 결과보고서와 구글 드라이브에 각각 업로드해주시기 바랍니다."
-- → drive_uploaded 체크박스로 "각각 업로드" 요구를 이중 확인한다.
-- ----------------------------------------------------------------------------
create table if not exists public.study_outputs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups(id) on delete cascade,

  title text not null,
  output_type text not null check (output_type in (
    'GPTs', 'RAG 챗봇', '웹도구', 'AI 에이전트', '강의자료', '영상', '기타'
  )),
  url text not null,
  drive_uploaded boolean not null default false,
  description text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.study_outputs is
  '산출물 링크. 유형·팀별로 필터링해 CSV로 내보내면 성과 자료집의 목차가 그대로 나온다.';

create index if not exists study_outputs_group_id_idx on public.study_outputs (group_id, sort_order);

-- ----------------------------------------------------------------------------
-- study_notifications — 안내 발송 로그
--
-- 기존 kakao_notice1~3_sent가 "발송 플래그"에서 "관리자 수동 확인 체크박스"로 전용되며
-- 컬럼 의미가 뒤틀린 전례가 있다. 연구모임은 처음부터 로그 테이블로 분리해 그 혼선을 막는다.
-- ----------------------------------------------------------------------------
create table if not exists public.study_notifications (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups(id) on delete cascade,

  stage text not null check (stage in ('접수확인', '심사결과', '운영안내', '제출독려', '이수확정')),
  channel text not null default 'email',
  recipient text not null default '',
  status text not null default '대기' check (status in ('대기', '성공', '실패')),
  sent_at timestamptz,
  error_message text not null default '',
  created_at timestamptz not null default now()
);

comment on table public.study_notifications is
  '단계별 안내 발송 이력. 상태 플래그가 아니라 로그이므로 재발송·실패 사유가 그대로 남는다.';

create index if not exists study_notifications_group_id_idx on public.study_notifications (group_id, created_at desc);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.study_meetings enable row level security;
alter table public.study_reports enable row level security;
alter table public.study_outputs enable row level security;
alter table public.study_notifications enable row level security;

-- 신청자 본인의 제출은 Edge Function(study-submit, service role)이 본인확인 후 대행한다.
drop policy if exists "study_meetings_admin_all" on public.study_meetings;
create policy "study_meetings_admin_all" on public.study_meetings
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "study_reports_admin_all" on public.study_reports;
create policy "study_reports_admin_all" on public.study_reports
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "study_outputs_admin_all" on public.study_outputs;
create policy "study_outputs_admin_all" on public.study_outputs
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "study_notifications_admin_all" on public.study_notifications;
create policy "study_notifications_admin_all" on public.study_notifications
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- Storage: 회의록 첨부·산출물 캡처 저장 버킷(비공개, 서명 URL로만 접근)
-- 현행 certificates 버킷과 동일한 정책 구조.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('study-attachments', 'study-attachments', false)
on conflict (id) do nothing;

drop policy if exists "study_attachments_storage_admin_all" on storage.objects;
create policy "study_attachments_storage_admin_all" on storage.objects
  for all using (bucket_id = 'study-attachments' and public.is_admin())
  with check (bucket_id = 'study-attachments' and public.is_admin());
