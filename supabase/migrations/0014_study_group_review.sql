-- ============================================================================
-- AI 활용 연구모임 — 심사 기반 (전략 §Ⅴ 2단계)
--
-- 심사위원 3인 서면심사를 시스템에 내장한다. 핵심 설계 두 가지:
--
-- 1) 권한 분리. 심사위원을 admin_users에 role='reviewer'로 넣되, is_admin()이
--    reviewer를 포함하면 심사위원이 기존 특강 신청자(applications)의 개인정보까지
--    보게 된다. 그래서 is_admin()을 admin/superadmin으로 좁히고, 연구모임 심사
--    화면 전용으로 is_reviewer()를 새로 둔다. 기존 관리자 행은 role이
--    admin/superadmin이므로 이 변경으로 잃는 권한이 없다.
--
-- 2) 심사기준 1번(프로그램 참여·이수 이력 20점)의 자동 채점 보조.
--    기존 applications 테이블을 읽어 근거를 제시한다 — "기존 DB에 추가 탭" 방식의
--    가장 큰 실익이며, 별도 DB로 갈랐다면 불가능한 연동이다. 최종 점수 입력은
--    심사위원이 한다(자동 채점이 아니라 자동 "보조").
-- ============================================================================

-- ----------------------------------------------------------------------------
-- admin_users.role 확장: reviewer 추가 (기존 행 영향 없음)
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.admin_users'::regclass
      and conname = 'admin_users_role_check'
  ) then
    alter table public.admin_users drop constraint admin_users_role_check;
  end if;

  alter table public.admin_users
    add constraint admin_users_role_check
    check (role in ('admin', 'superadmin', 'reviewer'));
end;
$$;

-- ----------------------------------------------------------------------------
-- 권한 헬퍼 재정의 / 신설
-- ----------------------------------------------------------------------------

-- is_admin(): reviewer를 제외하도록 좁힌다. 시그니처가 같으므로 기존 정책은 그대로 동작한다.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admin_users au
    where au.email = (auth.jwt() ->> 'email')
      and au.role in ('admin', 'superadmin')
  );
$$;

comment on function public.is_admin() is
  '운영 관리자(admin/superadmin) 여부. 심사위원(reviewer)은 포함하지 않는다 — 심사위원에게 특강 신청자 개인정보를 열지 않기 위함.';

create or replace function public.is_superadmin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admin_users au
    where au.email = (auth.jwt() ->> 'email')
      and au.role = 'superadmin'
  );
$$;

comment on function public.is_superadmin() is
  '총괄 관리자 여부. 심사위원별 점수 전체 집계를 볼 수 있는 유일한 권한.';

-- is_reviewer(): 연구모임 심사 화면 접근 권한. 관리자도 포함한다(운영자가 심사 현황을 봐야 함).
create or replace function public.is_reviewer()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admin_users au
    where au.email = (auth.jwt() ->> 'email')
      and au.role in ('admin', 'superadmin', 'reviewer')
  );
$$;

comment on function public.is_reviewer() is
  '연구모임 계획서 심사 권한(reviewer + admin + superadmin).';

grant execute on function public.is_superadmin() to anon, authenticated;
grant execute on function public.is_reviewer() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- study_reviews — 심사 (팀 × 심사위원)
-- ----------------------------------------------------------------------------
create table if not exists public.study_reviews (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups(id) on delete cascade,
  reviewer_email text not null,

  -- {"c1_1": 10, "c2_1": 8, ...} — 키는 study_rounds.criteria의 code
  scores jsonb not null default '{}'::jsonb,
  total numeric(6, 2) not null default 0,
  comment text not null default '',

  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 1인 1회 채점
  constraint study_reviews_unique_reviewer unique (group_id, reviewer_email)
);

comment on table public.study_reviews is
  '계획서 서면심사. 심사위원은 자기 행만 접근할 수 있고(RLS), 전체 집계는 superadmin만 조회한다.';

create index if not exists study_reviews_group_id_idx on public.study_reviews (group_id);
create index if not exists study_reviews_reviewer_idx on public.study_reviews (reviewer_email);

create or replace trigger trg_study_reviews_updated_at
before update on public.study_reviews
for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 채점 검증 + 총점 자동 계산
-- 배점 상한을 화면에서만 막으면 우회할 수 있으므로 DB에서 강제한다.
-- ----------------------------------------------------------------------------
create or replace function public.compute_study_review_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_criteria jsonb;
  v_key text;
  v_value numeric;
  v_max numeric;
  v_total numeric := 0;
begin
  select r.criteria into v_criteria
  from public.study_groups g
  join public.study_rounds r on r.id = g.round_id
  where g.id = new.group_id;

  if v_criteria is null then
    raise exception '존재하지 않는 연구모임입니다.' using errcode = 'P0001';
  end if;

  for v_key, v_value in
    select key, value::numeric from jsonb_each_text(new.scores)
  loop
    select (c ->> 'max')::numeric into v_max
    from jsonb_array_elements(v_criteria) c
    where c ->> 'code' = v_key;

    if v_max is null then
      raise exception '알 수 없는 심사 지표입니다: %', v_key using errcode = 'P0006';
    end if;

    if v_value < 0 or v_value > v_max then
      raise exception '심사 지표 %의 배점 범위를 벗어났습니다. (0 ~ %)', v_key, v_max
        using errcode = 'P0006';
    end if;

    v_total := v_total + v_value;
  end loop;

  new.total := v_total;
  return new;
end;
$$;

comment on function public.compute_study_review_total() is
  '채점값을 회차의 criteria 정의와 대조해 지표 존재·배점 상한을 검증하고 총점을 계산한다.';

create or replace trigger trg_compute_study_review_total
before insert or update on public.study_reviews
for each row execute function public.compute_study_review_total();

-- ============================================================================
-- 심사 집계 및 선발 확정
-- 3인 평균 총점 → 순위 → 상위 max_teams 팀을 selected로 전환.
-- 동점 시 복수 학과 구성(is_multi_dept)을 우선한다 — 신청 안내에 명시한 가산점 규칙.
-- ============================================================================
create or replace function public.finalize_study_review(p_round_id uuid)
returns table (group_id uuid, code text, avg_total numeric, final_rank int, final_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_teams int;
begin
  if not public.is_admin() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;

  -- 같은 회차에 대한 동시 실행을 막는다(순위·상태가 뒤섞이는 것을 방지).
  perform pg_advisory_xact_lock(hashtext('study_finalize_' || p_round_id::text));

  select max_teams into v_max_teams from public.study_rounds where id = p_round_id;
  if v_max_teams is null then
    raise exception '존재하지 않는 모집회차입니다.' using errcode = 'P0001';
  end if;

  -- 주의: RETURNS TABLE의 출력 컬럼명(group_id/code/avg_total/final_rank/final_status)은
  -- 함수 본문에서 변수로도 잡힌다. 쿼리 안에서 같은 이름을 쓰면 "column reference is
  -- ambiguous"로 실패하므로, 내부 별칭은 전부 sg_ 접두어로 충돌을 피한다.
  return query
  with scored as (
    select
      g.id as sg_id,
      g.code as sg_code,
      g.is_multi_dept as sg_multi,
      round(avg(rv.total), 2) as sg_avg
    from public.study_groups g
    left join public.study_reviews rv
      on rv.group_id = g.id and rv.submitted_at is not null
    where g.round_id = p_round_id
      and g.status in ('submitted', 'under_review', 'selected', 'rejected')
    group by g.id, g.code, g.is_multi_dept
  ),
  ranked as (
    select
      s.sg_id,
      s.sg_code,
      coalesce(s.sg_avg, 0) as sg_avg,
      rank() over (
        order by coalesce(s.sg_avg, 0) desc, s.sg_multi desc, s.sg_code asc
      )::int as sg_rank
    from scored s
  ),
  updated as (
    update public.study_groups g
    set total_score = r.sg_avg,
        rank = r.sg_rank,
        status = case when r.sg_rank <= v_max_teams then 'selected' else 'rejected' end
    from ranked r
    where g.id = r.sg_id
    returning
      g.id as u_id,
      g.code as u_code,
      g.total_score as u_total,
      g.rank as u_rank,
      g.status as u_status
  )
  select u.u_id, u.u_code, u.u_total, u.u_rank, u.u_status
  from updated u
  order by u.u_rank;
end;
$$;

comment on function public.finalize_study_review(uuid) is
  '심사위원 평균 총점으로 순위를 매기고 상위 max_teams 팀을 selected로 확정. 동점 시 복수 학과 구성 우선.';

grant execute on function public.finalize_study_review(uuid) to authenticated;

-- ============================================================================
-- 심사기준 1번 자동 채점 보조 — 기존 applications 테이블 조회
--
-- 특강 신청 이력을 성명 + (직번 또는 연락처)로 매칭한다. 연락처는 저장 형식이
-- 정규화되어 있지만(0012) 과거 데이터를 고려해 숫자만 남겨 비교한다.
-- 반환값은 "근거"이지 점수가 아니다 — 심사위원이 보고 판단해 직접 입력한다.
-- ============================================================================
create or replace function public.match_prior_participation(
  p_name text,
  p_id_number text,
  p_phone text
)
returns table (applied_count bigint, completed_count bigint, programs text[])
language sql
security definer
set search_path = public
stable
as $$
  select
    count(*) as applied_count,
    count(*) filter (where a.status = '이수') as completed_count,
    coalesce(
      array_agg(distinct w.round_label || ' ' || w.topic order by w.round_label || ' ' || w.topic),
      '{}'::text[]
    ) as programs
  from public.applications a
  join public.workshops w on w.id = a.workshop_id
  where public.is_reviewer()
    and a.name = p_name
    and a.status <> '취소'
    and (
      (nullif(p_id_number, '') is not null and a.id_number = p_id_number)
      or (
        nullif(p_phone, '') is not null
        and regexp_replace(a.phone, '[^0-9]', '', 'g') = regexp_replace(p_phone, '[^0-9]', '', 'g')
      )
    );
$$;

comment on function public.match_prior_participation(text, text, text) is
  '심사기준 1번용: 기존 특강 신청 이력(applications)에서 참여·이수 건수를 찾아 심사위원에게 근거로 제시한다. is_reviewer()가 아니면 빈 집계를 반환한다.';

grant execute on function public.match_prior_participation(text, text, text) to authenticated;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.study_reviews enable row level security;

-- 심사위원은 자기 채점 행만 읽고 쓴다.
drop policy if exists "study_reviews_own" on public.study_reviews;
create policy "study_reviews_own" on public.study_reviews
  for all
  using (reviewer_email = (auth.jwt() ->> 'email'))
  with check (reviewer_email = (auth.jwt() ->> 'email'));

-- 전체 집계는 총괄 관리자만.
drop policy if exists "study_reviews_select_superadmin" on public.study_reviews;
create policy "study_reviews_select_superadmin" on public.study_reviews
  for select using (public.is_superadmin());

-- 심사위원이 계획서를 읽을 수 있어야 채점이 가능하다(쓰기는 여전히 관리자만).
drop policy if exists "study_groups_select_reviewer" on public.study_groups;
create policy "study_groups_select_reviewer" on public.study_groups
  for select using (public.is_reviewer());

drop policy if exists "study_group_members_select_reviewer" on public.study_group_members;
create policy "study_group_members_select_reviewer" on public.study_group_members
  for select using (public.is_reviewer());

drop policy if exists "study_group_plans_select_reviewer" on public.study_group_plans;
create policy "study_group_plans_select_reviewer" on public.study_group_plans
  for select using (public.is_reviewer());
