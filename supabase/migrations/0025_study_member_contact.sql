-- ============================================================================
-- 참여자(팀원) 연락처·이메일
--
-- [서식 1] 신청서는 대표자에게만 연락처·이메일을 받았고 참여자 행은 직번·성명·소속·직급뿐이었다.
-- 신청 시 팀원 각자의 핸드폰번호와 이메일도 받도록 study_group_members에 두 컬럼을 더한다.
--
-- · 대표자 연락처(study_groups.leader_phone)는 본인확인 키라 그대로 둔다. 참여자 연락처는
--   본인확인과 무관한 단순 저장 항목이다.
-- · 도입 전 접수분은 빈 문자열로 남는다. 대표자가 '내 연구모임'에서 신청서를 수정할 때
--   채워야 저장되며(화면·Edge Function 필수 검증), 관리자 화면은 빈 값을 허용해 복구할 수 있게 둔다.
-- · 저장 형식은 대표자와 같은 010-####-#### (phoneSchema가 정규화).
-- ============================================================================

alter table public.study_group_members
  add column if not exists phone text not null default '',
  add column if not exists email text not null default '';

comment on column public.study_group_members.phone is
  '참여자 휴대폰 번호(010-####-####). 도입(0025) 전 접수분은 빈 문자열.';
comment on column public.study_group_members.email is
  '참여자 이메일. 도입(0025) 전 접수분은 빈 문자열.';
