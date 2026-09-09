-- ============================================================================
-- 2026학년도 2학기 연구모임 — 테스트 신청건 전체 삭제 (일회성 운영 스크립트)
--
-- 사용처: Supabase 대시보드 → SQL Editor. 마이그레이션이 아니므로 supabase/migrations에
--         두지 않는다(재실행되면 실제 신청건까지 지운다).
--
-- ⚠ 되돌릴 수 없다. 실행 전 반드시:
--    1) 아래 「1. 삭제 대상 확인」만 먼저 돌려 건수를 눈으로 확인할 것
--    2) 정식 접수가 시작된 뒤에는 절대 실행하지 말 것
--
-- study_groups를 지우면 FK on delete cascade로 아래가 함께 지워진다.
--   study_group_members, study_group_plans, study_reviews,
--   study_meetings, study_reports, study_outputs, study_notifications
-- study_prior_participations(과거 참여 이력 대조용 기준 데이터)와 study_rounds는
-- 건드리지 않는다.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. 삭제 대상 확인 (먼저 이 블록만 실행)
-- ---------------------------------------------------------------------------
select 'study_groups' as table_name, count(*) as rows
from public.study_groups g
join public.study_rounds r on r.id = g.round_id
where r.year = 2026 and r.semester = '2학기'
union all
select 'study_expert_applications', count(*)
from public.study_expert_applications a
join public.study_rounds r on r.id = a.round_id
where r.year = 2026 and r.semester = '2학기';

-- ---------------------------------------------------------------------------
-- 2. 삭제 실행 (1번 결과를 확인한 뒤 실행)
-- ---------------------------------------------------------------------------
begin;

delete from public.study_expert_applications a
using public.study_rounds r
where a.round_id = r.id and r.year = 2026 and r.semester = '2학기';

delete from public.study_groups g
using public.study_rounds r
where g.round_id = r.id and r.year = 2026 and r.semester = '2학기';

commit;

-- ---------------------------------------------------------------------------
-- 3. 남은 파일 정리 (SQL 밖)
--    첨부파일은 Storage 버킷 `study-attachments`에 남는다. 대시보드 → Storage에서
--    해당 버킷의 테스트 업로드분을 함께 삭제할 것.
-- ---------------------------------------------------------------------------
