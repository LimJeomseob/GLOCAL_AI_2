-- ============================================================================
-- [검수용] 시스템 점검 회차 — 가상자료 전체 삭제 (일회성 운영 스크립트)
--
-- scripts/seed_system_check_round.sql로 넣은 것만 지운다. 대상은
-- year=2026, semester='0학기(시스템점검)' 회차와 '[점검 가상자료]' 표식의 참여이력뿐이며,
-- 실제 2026학년도 2학기 회차는 건드리지 않는다.
--
-- study_groups를 지우면 FK on delete cascade로 참여자·계획서·심사·회의록·결과보고서·
-- 산출물·안내 메일 큐·코칭 일정·조율 메모·최종 일정이 함께 지워진다.
-- ============================================================================

-- 1. 삭제 대상 확인 (먼저 이 블록만 실행)
select 'study_groups' as table_name, count(*) as rows
from public.study_groups g
join public.study_rounds r on r.id = g.round_id
where r.year = 2026 and r.semester = '0학기(시스템점검)'
union all
select 'study_expert_applications', count(*)
from public.study_expert_applications a
join public.study_rounds r on r.id = a.round_id
where r.year = 2026 and r.semester = '0학기(시스템점검)'
union all
select 'study_prior_participations', count(*)
from public.study_prior_participations
where note = '[점검 가상자료]';

-- 2. 삭제 실행
begin;

delete from public.study_groups g
using public.study_rounds r
where g.round_id = r.id and r.year = 2026 and r.semester = '0학기(시스템점검)';

delete from public.study_expert_applications a
using public.study_rounds r
where a.round_id = r.id and r.year = 2026 and r.semester = '0학기(시스템점검)';

delete from public.study_prior_participations
where note = '[점검 가상자료]';

delete from public.study_rounds
where year = 2026 and semester = '0학기(시스템점검)';

commit;
