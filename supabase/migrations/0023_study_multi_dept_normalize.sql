-- ============================================================================
-- 복수 학과 판정 정규화 + 관리자 수동 보정
--
-- 0013의 sync_study_group_members()는 참여자 소속 문자열의 distinct 개수로
-- is_multi_dept를 판정했다. 신청 폼에서 대표자 소속은 "경상국립대학교 OO학과",
-- 참여자 소속은 "OO학과"처럼 표기가 갈려 같은 학과인데 복수 학과로 잡히는 오판정이
-- 생겼다(예: 대표 "경상국립대학교 의류학과" + 참여자 "의류학과" ×3 → 복수).
-- 복수 학과는 finalize_study_review()의 동점 우선 규칙이라 선발 순위에 영향을 준다.
--
-- 1) normalize_study_affiliation(): 대학명·단과대학·대학원 계층과 공백을 걷어낸 뒤 비교
-- 2) study_groups.multi_dept_override: 정규화가 못 잡는 표기 차이(의류학과/의류학전공 등)를
--    관리자가 직접 확정. null=자동, true/false=수동
-- 3) 기존 접수분 전체 재계산(백필)
--
-- 화면의 isMultiDepartment()(src/lib/studyValidation.ts)가 같은 규칙을 미러링한다.
-- 두 구현이 어긋나면 신청 폼의 "가산점 대상" 안내와 저장값이 달라지므로 함께 바꿔야 한다.
-- ============================================================================

alter table public.study_groups
  add column if not exists multi_dept_override boolean;

comment on column public.study_groups.multi_dept_override is
  '복수 학과 판정 관리자 수동 보정. null=자동(정규화된 소속 distinct ≥ 2), true/false=관리자 확정값. is_multi_dept는 이 값을 우선한다.';

comment on column public.study_groups.is_multi_dept is
  '복수 학과 구성 여부(심사 가산점·동점 우선). multi_dept_override가 있으면 그 값, 없으면 normalize_study_affiliation() 기준 distinct 소속 ≥ 2. 직접 쓰지 않는다.';

-- ----------------------------------------------------------------------------
-- 소속 정규화. 규칙 순서는 TS 미러(normalizeAffiliation)와 같아야 한다.
--   1. 소문자화·앞뒤 공백 제거
--   2. 대학명 문자열 제거(부분 문자열, 긴 것부터)
--   3. 공백 토큰 중 대학교/대학원/대학으로 끝나는 토큰 제거(단과대학·대학원 계층)
--   4. 남은 공백 전부 제거
-- ----------------------------------------------------------------------------
create or replace function public.normalize_study_affiliation(p_affiliation text)
returns text
language sql
immutable
strict
as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(
               lower(btrim(p_affiliation)),
               '(국립경상대학교|경상국립대학교|경상국립대|국립경상대|경상대학교|경상대|gnu)', '', 'g'
             ),
             '\S*(대학교|대학원|대학)(\s+|$)', '', 'g'
           ),
           '\s+', '', 'g'
         );
$$;

comment on function public.normalize_study_affiliation(text) is
  '복수 학과 판정용 소속 정규화. 대학명·단과대학·대학원 계층과 공백을 제거해 같은 학과의 표기 차이를 흡수한다.';

-- 참여자 소속(정규화) distinct ≥ 2. 빈 문자열은 제외.
create or replace function public.compute_study_multi_dept(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct public.normalize_study_affiliation(m.affiliation))
           filter (where public.normalize_study_affiliation(m.affiliation) <> '') >= 2
  from public.study_group_members m
  where m.group_id = p_group_id;
$$;

comment on function public.compute_study_multi_dept(uuid) is
  '정규화된 참여자 소속 distinct 개수 ≥ 2 여부. 관리자 수동 보정(multi_dept_override)은 반영하지 않는 순수 자동 판정.';

-- ----------------------------------------------------------------------------
-- 참여자 변경 시 member_count / is_multi_dept 동기화 (0013 재정의)
-- ----------------------------------------------------------------------------
create or replace function public.sync_study_group_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  v_group_id := coalesce(new.group_id, old.group_id);

  update public.study_groups g
  set member_count = sub.cnt,
      is_multi_dept = coalesce(g.multi_dept_override, sub.dept_cnt >= 2)
  from (
    select count(*) as cnt,
           count(distinct public.normalize_study_affiliation(affiliation))
             filter (where public.normalize_study_affiliation(affiliation) <> '') as dept_cnt
    from public.study_group_members
    where group_id = v_group_id
  ) sub
  where g.id = v_group_id;

  return null;
end;
$$;

comment on function public.sync_study_group_members() is
  'study_groups.member_count / is_multi_dept 파생 컬럼 동기화. 소속은 normalize_study_affiliation()으로 비교하고 multi_dept_override가 있으면 그 값을 우선한다.';

-- ----------------------------------------------------------------------------
-- 관리자가 multi_dept_override를 바꾸면 is_multi_dept를 즉시 재계산.
-- `update of multi_dept_override`로 한정해 위 참여자 트리거의 update와 서로 재귀하지 않는다.
-- ----------------------------------------------------------------------------
create or replace function public.apply_study_multi_dept_override()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.is_multi_dept := coalesce(new.multi_dept_override, public.compute_study_multi_dept(new.id));
  return new;
end;
$$;

drop trigger if exists trg_study_groups_multi_dept_override on public.study_groups;
create trigger trg_study_groups_multi_dept_override
before update of multi_dept_override on public.study_groups
for each row execute function public.apply_study_multi_dept_override();

-- ----------------------------------------------------------------------------
-- 백필 — 기존 접수분 전체를 새 규칙으로 재계산
-- ----------------------------------------------------------------------------
update public.study_groups g
set is_multi_dept = coalesce(g.multi_dept_override, public.compute_study_multi_dept(g.id));
