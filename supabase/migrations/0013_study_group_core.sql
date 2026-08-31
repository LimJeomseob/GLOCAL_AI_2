-- ============================================================================
-- AI 활용 연구모임 — 접수 기반 (docs/연구모임_신청시스템_재구성_전략.md §Ⅴ 1단계)
--
-- 설계 원칙: 기존 10개 테이블(workshops/applications/LAWdata/certificates/
-- admin_users/kakao_*/certificate_templates)의 스키마는 변경하지 않는다.
-- 신규 테이블은 study_ 접두어로 네임스페이스를 분리하고, 기존 관행을 그대로 승계한다.
--   · enum 타입 대신 text + CHECK
--   · uuid PK + gen_random_uuid()
--   · set_updated_at() 트리거 재사용(0001에서 정의)
--   · is_admin() 기반 RLS(0001에서 정의)
--
-- 쓰기 경로에 대하여: 특강 신청(applications)은 단일 행이라 익명 INSERT를 열어 두었지만,
-- 연구모임은 "모임 1건 + 참여자 3~5행 + 계획서 1행"을 한 번에 만들어야 하고 접수번호를
-- 되돌려줘야 하므로, 공개 쓰기는 전부 Edge Function(study-submit, service role)을 거친다.
-- 따라서 study_* 테이블에는 익명 INSERT 정책을 두지 않는다 — 열어 둘 이유가 없고,
-- 닫아 두는 편이 컬럼 위조·열거 공격 표면이 작다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- study_rounds — 모집회차 메타 (현행 workshops에 대응)
-- ----------------------------------------------------------------------------
create table if not exists public.study_rounds (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  semester text not null,
  title text not null,
  research_topic text not null default '',

  -- 신청·심사·운영 구간
  apply_open_at timestamptz not null,
  apply_close_at timestamptz not null,
  review_close_at timestamptz not null,
  period_start date not null,
  period_end date not null,
  report_due_at timestamptz not null,

  -- 선발 규모 / 팀 구성 규칙
  max_teams int not null check (max_teams > 0),
  max_members_total int not null check (max_members_total > 0),
  min_team_size int not null default 3 check (min_team_size > 0),
  max_team_size int not null default 5 check (max_team_size > 0),

  -- 수준별 카테고리 4종: [{key,label,guide}]
  categories jsonb not null default '[]'::jsonb,
  -- 심사기준 9개 지표: [{code,no,group,label,max,sort}] — 배점 합 100
  criteria jsonb not null default '[]'::jsonb,

  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint study_rounds_year_semester_key unique (year, semester),
  constraint study_rounds_team_size_check check (min_team_size <= max_team_size),
  constraint study_rounds_apply_window_check check (apply_open_at < apply_close_at)
);

comment on table public.study_rounds is
  'AI 활용 연구모임 모집회차. 심사기준(criteria)을 코드가 아닌 jsonb로 보관해 차년도 배점 변경을 마이그레이션 한 줄로 흡수한다.';

create or replace trigger trg_study_rounds_updated_at
before update on public.study_rounds
for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- study_groups — 연구모임 (트랙 B의 applications)
-- ----------------------------------------------------------------------------
create table if not exists public.study_groups (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.study_rounds(id) on delete restrict,
  code text not null unique,

  -- [서식 1] 신청서 상단
  name text not null,
  topic text not null,
  category text not null check (category in ('초급', '중급', '고급1', '고급2')),

  leader_name text not null,
  leader_affiliation text not null,
  leader_position text not null,
  leader_id_number text not null,
  leader_phone text not null,
  leader_email text not null,

  period_start date not null,
  period_end date not null,

  -- 참여자 자식 행에서 트리거로 동기화(수기 입력 불가)
  member_count int not null default 0,
  is_multi_dept boolean not null default false,
  has_nontenured boolean not null default false,

  -- 진행방법 택1 / 블렌디드 러닝 형태 — 계획서 5번에서 확정되므로 nullable
  progress_method text check (progress_method in ('전문가코칭', '개별학습')),
  education_mode text check (education_mode in ('대면', '비대면')),

  status text not null default 'draft' check (status in (
    'draft', 'submitted', 'under_review', 'selected', 'rejected',
    'in_progress', 'report_submitted', 'completed', 'cancelled'
  )),
  consent boolean not null check (consent = true),

  -- 심사 집계 결과(finalize_study_review()가 채운다)
  total_score numeric(6, 2),
  rank int,

  created_by_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz
);

comment on table public.study_groups is
  'AI 활용 연구모임 1팀 = 1행([서식 1] 신청서). 상태 전이: draft→submitted→under_review→selected/rejected→in_progress→report_submitted→completed';
comment on column public.study_groups.member_count is
  'study_group_members 행 수와 트리거로 동기화되는 파생 컬럼. 직접 쓰지 않는다.';
comment on column public.study_groups.is_multi_dept is
  '참여자 소속의 distinct 개수 ≥ 2 이면 true. 심사 가산점(복수 학과 구성) 판정용 파생 컬럼.';

create index if not exists study_groups_round_id_idx on public.study_groups (round_id);
-- 본인확인 조회(대표자 성명+연락처) 전용 — 현행 applications_lookup_idx와 동일 설계
create index if not exists study_groups_lookup_idx on public.study_groups (leader_name, leader_phone);
create index if not exists study_groups_status_idx on public.study_groups (status);

create or replace trigger trg_study_groups_updated_at
before update on public.study_groups
for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- study_group_members — 참여자 (3~5명)
-- ----------------------------------------------------------------------------
create table if not exists public.study_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups(id) on delete cascade,
  id_number text not null,
  name text not null,
  affiliation text not null,
  position text not null,
  is_leader boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),

  -- 같은 팀에 같은 직(학)번이 두 번 오를 수 없다
  constraint study_group_members_unique_id_number unique (group_id, id_number)
);

comment on table public.study_group_members is
  '[서식 1] 참여자 명단. 서식 1은 "직번", 서식 2는 "교번"으로 표기가 다르나 컬럼은 id_number 하나로 통일하고 화면 라벨만 서식별로 바꾼다.';

create index if not exists study_group_members_group_id_idx on public.study_group_members (group_id);

-- ----------------------------------------------------------------------------
-- study_group_plans — 연구계획서 ([서식 1] 하단, 1:1)
-- ----------------------------------------------------------------------------
create table if not exists public.study_group_plans (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null unique references public.study_groups(id) on delete cascade,

  section1_topic text not null default '',        -- 1. 연구모임의 주제(연구의 배경 포함)
  section2_purpose text not null default '',      -- 2. 목적 및 필요성
  section3_platform text not null default '',     -- 3. AI 플랫폼 활용 계획
  section4_effect text not null default '',       -- 4. 기대효과 및 결과 활용방안
  section5_etc text not null default '',          -- 5. 기타(단계별 워크숍 요청 시기 등)

  -- 5번의 구조화 부분: {"option1":{"step1":"YYYY-MM-DD",...},"option2":{...}}
  -- 자유 서술로 두면 10개 팀 희망일을 담당자가 손으로 취합해야 하므로 날짜로 구조화한다.
  workshop_pref jsonb not null default '{}'::jsonb,

  char_count int not null default 0,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.study_group_plans is
  '[서식 1] 계획서 5개 항목. 심사 100점 중 80점이 이 내용에서 결정된다.';

create or replace trigger trg_study_group_plans_updated_at
before update on public.study_group_plans
for each row execute function public.set_updated_at();

-- ============================================================================
-- 접수번호 채번 + 신청 구간·팀 규모 검증 트리거
-- 현행 check_application_capacity()(0011)의 구조를 그대로 본떴다.
-- 에러코드 규약도 승계한다 — 프론트의 에러 분기를 재사용하기 위함.
--   P0001 존재하지 않는 회차 / P0002 접수 마감 / P0004 접수 시작 전 / P0005 팀 규모 위반
-- ============================================================================
create or replace function public.check_study_group_submit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open_at timestamptz;
  v_close_at timestamptz;
  v_min int;
  v_max int;
  v_year int;
  v_semester text;
  v_serial int;
  v_prefix text;
  v_members int;
  v_is_admin boolean;
  v_was_submitted boolean := false;
begin
  -- OLD는 UPDATE에서만 할당된다. INSERT에서 참조하면 런타임 오류가 나므로 먼저 갈라 둔다.
  if tg_op = 'UPDATE' then
    v_was_submitted := (old.status = 'submitted');
  end if;

  perform pg_advisory_xact_lock(hashtext('study_round_' || new.round_id::text));

  select apply_open_at, apply_close_at, min_team_size, max_team_size, year, semester
    into v_open_at, v_close_at, v_min, v_max, v_year, v_semester
  from public.study_rounds where id = new.round_id;

  -- 존재하지 않는 회차는 관리자도 등록할 수 없다.
  if v_open_at is null then
    raise exception '존재하지 않는 모집회차입니다.' using errcode = 'P0001';
  end if;

  v_is_admin := public.is_admin();

  -- 접수번호 채번: SG-{year}-{semester 숫자}-{연번 3자리}
  -- 중간 행이 삭제돼도 번호가 충돌하지 않도록 max+1 방식을 쓴다(issue_certificate와 동일 기법).
  if tg_op = 'INSERT' and (new.code is null or new.code = '') then
    v_prefix := 'SG-' || v_year::text || '-' || regexp_replace(v_semester, '[^0-9]', '', 'g') || '-';
    select coalesce(max((regexp_match(code, '^' || v_prefix || '(\d+)$'))[1]::int), 0) + 1
      into v_serial
    from public.study_groups
    where round_id = new.round_id and code like v_prefix || '%';

    new.code := v_prefix || lpad(v_serial::text, 3, '0');
  end if;

  -- 관리자 등록(오프라인 접수 소급 등록): 접수 구간·팀 규모 검사를 건너뛴다.
  if v_is_admin then
    return new;
  end if;

  -- 공개 경로: 관리자 등록 표기를 위조할 수 없도록 강제한다(applications와 동일한 방어).
  -- UPDATE에서는 기존 값을 그대로 되돌린다 — 관리자가 등록한 팀이 이후 공개 경로의
  -- 갱신(계획서 제출 등)을 거치면서 표기를 잃지 않게 하기 위함.
  if tg_op = 'INSERT' then
    new.created_by_admin := false;

    if now() < v_open_at then
      raise exception '아직 신청 기간이 아닙니다.' using errcode = 'P0004';
    end if;
    if now() > v_close_at then
      raise exception '신청이 마감되었습니다.' using errcode = 'P0002';
    end if;
  else
    new.created_by_admin := old.created_by_admin;
  end if;

  -- 제출 확정 시점에만 팀 규모를 강제한다.
  -- (참여자 행은 모임 생성 뒤에 들어오므로 INSERT 시점에는 셀 수 없다.)
  if new.status = 'submitted' and not v_was_submitted then
    if now() > v_close_at then
      raise exception '신청이 마감되었습니다.' using errcode = 'P0002';
    end if;

    select count(*) into v_members
    from public.study_group_members where group_id = new.id;

    if v_members < v_min or v_members > v_max then
      raise exception '참여자는 %명 이상 %명 이하여야 합니다. (현재 %명)', v_min, v_max, v_members
        using errcode = 'P0005';
    end if;

    if new.submitted_at is null then
      new.submitted_at := now();
    end if;
  end if;

  return new;
end;
$$;

comment on function public.check_study_group_submit() is
  '연구모임 접수번호 채번 + 신청 구간/팀 규모 검증. 관리자(is_admin)는 소급 등록을 위해 구간·규모 검사 예외.';

create or replace trigger trg_check_study_group_submit
before insert or update on public.study_groups
for each row execute function public.check_study_group_submit();

-- ============================================================================
-- 참여자 수 · 복수 학과 여부 동기화
-- ============================================================================
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
      is_multi_dept = sub.dept_cnt >= 2
  from (
    select count(*) as cnt, count(distinct affiliation) as dept_cnt
    from public.study_group_members
    where group_id = v_group_id
  ) sub
  where g.id = v_group_id;

  return null;
end;
$$;

comment on function public.sync_study_group_members() is
  'study_groups.member_count / is_multi_dept 파생 컬럼 동기화. 복수 학과 구성은 심사 가산점 대상.';

create or replace trigger trg_sync_study_group_members
after insert or update or delete on public.study_group_members
for each row execute function public.sync_study_group_members();

-- ============================================================================
-- 공개 집계 함수 — study_groups 원본은 RLS로 막혀 있으므로
-- 사업안내 탭의 "현재 N개 팀 접수" 표기를 위해 집계값만 익명에 노출한다.
-- (현행 get_workshop_availability()와 동일한 설계)
-- ============================================================================
create or replace function public.get_study_round_stats(p_round_id uuid)
returns table (submitted_count bigint, selected_count bigint, remaining_slots int)
language sql
security definer
set search_path = public
stable
as $$
  select
    count(*) filter (where g.status not in ('draft', 'cancelled')) as submitted_count,
    count(*) filter (where g.status in ('selected', 'in_progress', 'report_submitted', 'completed')) as selected_count,
    greatest(
      r.max_teams - (count(*) filter (where g.status in ('selected', 'in_progress', 'report_submitted', 'completed')))::int,
      0
    ) as remaining_slots
  from public.study_rounds r
  left join public.study_groups g on g.round_id = r.id
  where r.id = p_round_id
  group by r.max_teams;
$$;

grant execute on function public.get_study_round_stats(uuid) to anon, authenticated;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.study_rounds enable row level security;
alter table public.study_groups enable row level security;
alter table public.study_group_members enable row level security;
alter table public.study_group_plans enable row level security;

-- study_rounds: 신청기간·카테고리·심사기준을 공개 안내 화면에서 읽어야 한다(개인정보 없음).
drop policy if exists "study_rounds_select_public" on public.study_rounds;
create policy "study_rounds_select_public" on public.study_rounds
  for select using (true);

drop policy if exists "study_rounds_admin_write" on public.study_rounds;
create policy "study_rounds_admin_write" on public.study_rounds
  for all using (public.is_admin()) with check (public.is_admin());

-- study_groups / members / plans: 관리자만 직접 접근.
-- 신청자 본인의 조회·제출은 RLS를 열지 않고 Edge Function(service role)이 본인확인 후 대행한다.
drop policy if exists "study_groups_admin_all" on public.study_groups;
create policy "study_groups_admin_all" on public.study_groups
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "study_group_members_admin_all" on public.study_group_members;
create policy "study_group_members_admin_all" on public.study_group_members
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "study_group_plans_admin_all" on public.study_group_plans;
create policy "study_group_plans_admin_all" on public.study_group_plans
  for all using (public.is_admin()) with check (public.is_admin());
