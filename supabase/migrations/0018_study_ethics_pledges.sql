-- ============================================================================
-- AI 윤리교육 게이트 — 신청 전 필수 이수 기록
--
-- 신청 화면(/apply)에 윤리교육 단계가 추가된다: GNU 생성형 AI 윤리 가이드라인
-- 영상(https://www.youtube.com/watch?v=XzMC4jGM_P0)을 시청하고 8대 핵심원칙 중
-- 3개 이상을 골라 실천 다짐을 작성해야 [서식 1] 신청서로 진입할 수 있다.
--
-- 작성값은 신청서와 한 요청으로 study-submit(Edge Function)에 전달되므로 별도
-- 테이블 없이 study_groups에 jsonb 한 컬럼으로 붙인다. 최소 3개 강제는 Edge
-- Function의 zod 스키마(min 3)가 한다 — 공개 쓰기가 그 경로 하나뿐이라 DB CHECK를
-- 겹쳐 두지 않는다(기존 행·관리자 수기 등록 건은 빈 배열이어야 하기 때문이기도 하다).
-- ============================================================================

alter table public.study_groups
  add column if not exists ethics_pledges jsonb not null default '[]'::jsonb;

comment on column public.study_groups.ethics_pledges is
  'AI 윤리교육(GNU 생성형 AI 윤리 가이드라인 8대 핵심원칙) 실천 다짐 [{no,title,pledge}]. 신청 게이트에서 3개 이상 작성. 도입 전 신청 건과 관리자 등록 건은 빈 배열.';
