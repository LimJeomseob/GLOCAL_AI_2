-- ============================================================================
-- 심사위원 관리 탭 — 총괄관리자가 화면에서 심사위원(구글 계정)을 등록·삭제한다
--
-- 심사위원(role='reviewer')의 권한 체계는 0014·0017에 이미 있다.
--   · is_reviewer(): study_groups / study_group_members / study_group_plans 읽기
--   · study_reviews_own: 자기 채점 행 읽기·쓰기
-- 빠진 것은 심사위원을 등록하는 경로였다. admin_users의 RLS가 "자기 행 읽기"뿐이라
-- 브라우저에서는 목록 조회·등록·삭제가 전부 막혀 SQL로 직접 넣어야 했다.
--
-- 여기서는 총괄관리자(superadmin)에 한해 admin_users를 읽고, role='reviewer' 행만
-- 넣고 지울 수 있게 연다. admin/superadmin 행은 화면에서 절대 만들거나 지울 수 없다
-- — 관리자 권한 부여는 여전히 DB에서 직접 한다.
-- ============================================================================

-- 누가 등록했는지. 기존 행은 빈 문자열로 남는다.
alter table public.admin_users
  add column if not exists created_by text not null default '';

comment on column public.admin_users.created_by is
  '심사위원 관리 탭에서 등록한 총괄관리자 이메일. SQL로 넣은 행은 빈 문자열.';

-- ----------------------------------------------------------------------------
-- 이메일 정규화. is_admin()/is_reviewer()는 admin_users.email과 JWT 이메일을
-- 문자열로 비교하므로, 대소문자·공백이 섞여 들어오면 로그인해도 권한이 안 잡힌다.
-- ----------------------------------------------------------------------------
create or replace function public.admin_users_normalize_email()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists admin_users_normalize_email on public.admin_users;
create trigger admin_users_normalize_email
  before insert or update of email on public.admin_users
  for each row execute function public.admin_users_normalize_email();

-- ----------------------------------------------------------------------------
-- Row Level Security. 기존 admin_users_select_self(자기 행 읽기)는 그대로 둔다
-- — useAdminSession이 로그인 직후 자기 role을 확인하는 데 쓴다.
-- ----------------------------------------------------------------------------
drop policy if exists "admin_users_select_superadmin" on public.admin_users;
create policy "admin_users_select_superadmin" on public.admin_users
  for select using (public.is_superadmin());

drop policy if exists "admin_users_reviewer_insert" on public.admin_users;
create policy "admin_users_reviewer_insert" on public.admin_users
  for insert with check (public.is_superadmin() and role = 'reviewer');

drop policy if exists "admin_users_reviewer_delete" on public.admin_users;
create policy "admin_users_reviewer_delete" on public.admin_users
  for delete using (public.is_superadmin() and role = 'reviewer');

-- update 정책은 두지 않는다. 받는 값이 이메일뿐이라 수정 = 삭제 후 재등록이고,
-- 정책을 열어 두면 role을 바꿔 권한을 올리는 경로가 생긴다.
