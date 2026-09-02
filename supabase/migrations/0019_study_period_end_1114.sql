-- ============================================================================
-- 2026학년도 2학기 AI 활용 연구모임 운영기간 종료일 변경
-- 2026-11-11 → 2026-11-14 (결과보고서 제출 마감 동일 조정)
--
-- 0016 시드는 on conflict do nothing 이므로 이미 적용된 DB는 갱신되지 않는다.
-- 라운드와, 신청 시점에 종료일을 복사해 둔 모임 행을 함께 옮긴다.
-- ============================================================================

update public.study_rounds
set period_end = '2026-11-14',
    report_due_at = '2026-11-14T18:00:00+09:00'
where year = 2026
  and semester = '2학기'
  and period_end = '2026-11-11';

update public.study_groups g
set period_end = '2026-11-14'
from public.study_rounds r
where g.round_id = r.id
  and r.year = 2026
  and r.semester = '2학기'
  and g.period_end = '2026-11-11';
