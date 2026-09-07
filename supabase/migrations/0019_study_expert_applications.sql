-- ============================================================================
-- 교내 AI활용 전문가 모집 — 신청 접수
--
-- 근거: [글로컬대학사업] 2026학년도 AI활용 연구모임 교내 AI활용 전문가 모집 안내
--   · 역할: 연구모임별 맞춤형 교육 및 코칭 3회(기획, 제작, 환류)
--   · 모집대상: 생성형 AI 활용 교수법 또는 연구 경험이 있는 본교 교원(비전임교원 포함)
--   · 모집인원: 5명 내외 / 신청기간: ´26. 9. 9.(수) ~ 9. 18.(금)
--
-- 연구모임(팀) 신청과는 대상·기간·심사가 모두 달라 study_groups에 섞지 않고 별도 테이블로
-- 둔다. 공개 쓰기는 기존 관행대로 study-submit(Edge Function, service role) 한 경로뿐이며,
-- 익명 INSERT 정책은 두지 않는다. 신청 구간의 최종 강제는 DB 트리거가 서버 시각으로 한다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- study_rounds — 전문가 모집 구간. 값이 없으면 그 회차는 전문가 모집을 하지 않는다.
-- ----------------------------------------------------------------------------
alter table public.study_rounds
  add column if not exists expert_apply_open_at timestamptz,
  add column if not exists expert_apply_close_at timestamptz;

comment on column public.study_rounds.expert_apply_open_at is
  '교내 AI활용 전문가 신청 시작. null이면 이 회차는 전문가 모집 없음.';
comment on column public.study_rounds.expert_apply_close_at is
  '교내 AI활용 전문가 신청 마감.';

alter table public.study_rounds
  drop constraint if exists study_rounds_expert_window_check;
alter table public.study_rounds
  add constraint study_rounds_expert_window_check
  check (
    (expert_apply_open_at is null and expert_apply_close_at is null)
    or (expert_apply_open_at is not null and expert_apply_close_at is not null
        and expert_apply_open_at < expert_apply_close_at)
  );

-- 2026학년도 2학기 회차: 공문의 신청기간 ´26. 9. 9.(수) ~ 9. 18.(금)
update public.study_rounds
set expert_apply_open_at = '2026-09-09T09:00:00+09:00',
    expert_apply_close_at = '2026-09-18T18:00:00+09:00'
where year = 2026 and semester = '2학기'
  and expert_apply_open_at is null;

-- ----------------------------------------------------------------------------
-- study_expert_applications — 전문가 신청 1인 = 1행
-- ----------------------------------------------------------------------------
create table if not exists public.study_expert_applications (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.study_rounds(id) on delete restrict,
  code text not null unique,

  -- 공문 기재 항목
  name text not null,
  affiliation text not null,
  position text not null,
  id_number text not null,
  phone text not null,
  email text not null,
  is_nontenured boolean not null default false,
  -- 모집대상 요건(생성형 AI 활용 교수법 또는 연구 경험)의 서술
  experience text not null,

  -- 배정용 항목: 지도 가능한 수준별 카테고리(복수), 주요 활용 AI 도구
  categories text[] not null default '{}'::text[],
  ai_tools text not null default '',

  -- 운영기간(9. 28. ~ 11. 11.) 중 3회 코칭 가능 확인
  availability_confirmed boolean not null check (availability_confirmed = true),
  consent boolean not null check (consent = true),

  status text not null default 'submitted' check (status in (
    'submitted', 'selected', 'rejected', 'cancelled'
  )),
  -- 관리자 메모(배정 팀, 연락 결과 등)
  note text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 같은 회차에 같은 직번은 1건. 재제출은 Edge Function이 본인(연락처) 확인 후 갱신한다.
  constraint study_expert_applications_round_id_number_key unique (round_id, id_number),
  constraint study_expert_applications_categories_check check (
    categories <@ array['초급', '중급', '고급1', '고급2']::text[]
  )
);

comment on table public.study_expert_applications is
  '교내 AI활용 전문가 신청. 연구모임별 맞춤형 교육·코칭 3회(기획·제작·환류)를 맡을 본교 교원(비전임 포함) 5명 내외 모집.';
comment on column public.study_expert_applications.categories is
  '지도 가능한 수준별 카테고리(초급/중급/고급1/고급2, 복수). 연구모임 배정 시 참고.';
comment on column public.study_expert_applications.status is
  'submitted 접수 → selected 선정 / rejected 미선정 / cancelled 취소';

create index if not exists study_expert_applications_round_id_idx
  on public.study_expert_applications (round_id);
create index if not exists study_expert_applications_status_idx
  on public.study_expert_applications (status);

create or replace trigger trg_study_expert_applications_updated_at
before update on public.study_expert_applications
for each row execute function public.set_updated_at();

-- ============================================================================
-- 접수번호 채번 + 신청 구간 검증 트리거 (check_study_group_submit()의 구조를 승계)
--   P0001 전문가 모집이 없는 회차 / P0002 접수 마감 / P0004 접수 시작 전
-- ============================================================================
create or replace function public.check_study_expert_apply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open_at timestamptz;
  v_close_at timestamptz;
  v_year int;
  v_semester text;
  v_serial int;
  v_prefix text;
  v_exists boolean;
begin
  perform pg_advisory_xact_lock(hashtext('study_expert_' || new.round_id::text));

  select true, expert_apply_open_at, expert_apply_close_at, year, semester
    into v_exists, v_open_at, v_close_at, v_year, v_semester
  from public.study_rounds where id = new.round_id;

  if v_exists is null then
    raise exception '존재하지 않는 모집회차입니다.' using errcode = 'P0001';
  end if;

  -- 접수번호 채번: EX-{year}-{semester 숫자}-{연번 3자리} (SG 코드와 같은 max+1 방식)
  if tg_op = 'INSERT' and (new.code is null or new.code = '') then
    v_prefix := 'EX-' || v_year::text || '-' || regexp_replace(v_semester, '[^0-9]', '', 'g') || '-';
    select coalesce(max((regexp_match(code, '^' || v_prefix || '(\d+)$'))[1]::int), 0) + 1
      into v_serial
    from public.study_expert_applications
    where round_id = new.round_id and code like v_prefix || '%';

    new.code := v_prefix || lpad(v_serial::text, 3, '0');
  end if;

  -- 관리자(오프라인 접수 소급 등록·상태 변경)는 구간 검사를 건너뛴다.
  if public.is_admin() then
    return new;
  end if;

  -- 공개 경로는 신규 접수(INSERT)와 본인 재제출(UPDATE) 모두 신청 구간 안에서만 허용한다.
  if v_open_at is null then
    raise exception '이 회차는 전문가를 모집하지 않습니다.' using errcode = 'P0001';
  end if;
  if now() < v_open_at then
    raise exception '아직 전문가 신청 기간이 아닙니다.' using errcode = 'P0004';
  end if;
  if now() > v_close_at then
    raise exception '전문가 신청이 마감되었습니다.' using errcode = 'P0002';
  end if;

  return new;
end;
$$;

comment on function public.check_study_expert_apply() is
  '전문가 신청 접수번호 채번 + 신청 구간 검증. 관리자(is_admin)는 구간 검사 예외.';

create or replace trigger trg_check_study_expert_apply
before insert or update on public.study_expert_applications
for each row execute function public.check_study_expert_apply();

-- ============================================================================
-- Row Level Security — 관리자만 직접 접근. 신청자 경로는 Edge Function(service role)이 대행.
-- ============================================================================
alter table public.study_expert_applications enable row level security;

drop policy if exists "study_expert_applications_admin_all" on public.study_expert_applications;
create policy "study_expert_applications_admin_all" on public.study_expert_applications
  for all using (public.is_admin()) with check (public.is_admin());
