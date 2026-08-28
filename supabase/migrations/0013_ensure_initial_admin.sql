-- 초기 관리자(eros4424@gmail.com) allowlist 행이 항상 존재하도록 보장한다(PRD §6.1 / §7.4).
-- 0002_seed.sql에 동일한 insert가 있으나, 시드가 적용되지 않았거나 이후 행이 삭제된 프로젝트에서는
-- 구글 로그인이 "관리자로 등록되지 않은 계정입니다"로 차단된다(useAdminSession + RLS is_admin()).
-- 권한 판정이 au.email = auth.jwt() ->> 'email' 정확 일치이므로 구글 계정과 동일한 소문자로 넣는다.
insert into public.admin_users (email, role)
values ('eros4424@gmail.com', 'superadmin')
on conflict (email) do nothing;
