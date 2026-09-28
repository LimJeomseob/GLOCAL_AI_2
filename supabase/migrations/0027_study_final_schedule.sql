-- ============================================================================
-- 팀별 최종 일정 · 전문가 배정 결과 (공지용)
--
-- 선발 확정 후 AI융합원이 팀별로 확정한 "기획·제작·환류 3단계 일정 + 배정 AI 전문가"를
-- 대표자가 '내 연구모임'에서 자기 팀 것만 확인할 수 있게 한다.
--
-- 왜 0026의 코칭 일정(study_coaching_sessions)에 넣지 않는가:
--   · 확정 일정이 자유 서식이다 — "미정", "10.20(화) / 2안 10.21(수)", "10.14(수) 오전",
--     "(사전미팅) 9.30.(수) 19:00 / 10.2(금) 09:00~12:00". 코칭 테이블은 met_at date not null에
--     회차당 확정 1건이라 이런 값을 담을 수 없다.
--   · 배정 전문가가 대부분 외부 인사(기업 이사·타 대학 교수·인증 트레이너)이고 '개별 학습' 팀도 있다.
--     study_groups.expert_id는 교내 전문가 신청(study_expert_applications)만 가리킨다.
--
-- 설계:
--   · 팀당 1행(group_id PK). 원문 서식을 보존하는 텍스트 컬럼으로 저장한다.
--   · 관리자만 쓴다(RLS is_admin()). 팀 화면은 study-lookup Edge Function(service role)이 읽어 준다.
--   · published=false면 팀 화면에 내려보내지 않는다(관리자가 입력 중인 상태).
--   · 기존 코칭 조율 흐름(제안→회신→확정)은 그대로 둔다 — 이 표는 공지, 코칭 테이블은 조율 기록이다.
-- ============================================================================

create table if not exists public.study_final_schedules (
  group_id uuid primary key references public.study_groups(id) on delete cascade,

  -- 공지 표의 팀 번호(1~10). 접수번호와 별개다.
  team_no int check (team_no is null or team_no between 1 and 99),

  -- 예: '팀장 권은주 등 5명' + 줄바꿈 + '(고급 1, 실시간 비대면)'
  composition text not null default '',
  -- 예: '박용규' + 줄바꿈 + '(Vessl 이사)' / '개별 학습'
  expert_label text not null default '',

  -- 1 기획 / 2 제작 / 3 환류 — 공문의 교육과정 3단계
  step1_when text not null default '',
  step1_detail text not null default '',
  step2_when text not null default '',
  step2_detail text not null default '',
  step3_when text not null default '',
  step3_detail text not null default '',

  note text not null default '',
  published boolean not null default true,

  updated_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.study_final_schedules is
  '팀별 최종 일정(기획·제작·환류)·배정 AI 전문가 공지. 팀당 1행, 자유 서식 텍스트. 관리자만 쓰고 팀은 study-lookup으로 읽는다.';
comment on column public.study_final_schedules.expert_label is
  '배정 AI 전문가 표기(외부 인사 포함, 자유 텍스트). 교내 전문가 배정(study_groups.expert_id)과 별개.';
comment on column public.study_final_schedules.published is
  'false면 팀 화면(study-lookup 응답)에서 제외한다. 관리자가 입력 중일 때 쓴다.';

create or replace trigger trg_study_final_schedules_updated_at
before update on public.study_final_schedules
for each row execute function public.set_updated_at();

-- RLS — 관리자만 직접 접근. 공개 읽기는 Edge Function(service role)이 대행한다.
alter table public.study_final_schedules enable row level security;

drop policy if exists "study_final_schedules_admin_all" on public.study_final_schedules;
create policy "study_final_schedules_admin_all" on public.study_final_schedules
  for all using (public.is_admin()) with check (public.is_admin());
