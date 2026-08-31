-- ============================================================================
-- 심사기준 1번 — 프로그램 참여·이수 이력의 수기 등록
--
-- 0014의 match_prior_participation()은 기존 특강 신청 데이터(applications)만 읽었다.
-- 그래서 두 가지 상황에서 근거가 비어 버린다.
--   ① 특강 데이터를 정리·삭제하는 경우
--   ② 이 포털을 거치지 않은 프로그램(과거 연도 행사, 오프라인 교육, 타 부서 공동 운영 등)에
--      참여한 신청자 — 실제로는 참여했는데 시스템에는 흔적이 없다
--
-- 심사기준 1번이 20점(전체의 1/5)이라 근거가 비면 그만큼 배점이 형해화된다.
-- 그래서 관리자가 이력을 직접 등록하는 대장을 두고, 조회 함수가 자동·수기 두 출처를
-- 합쳐서 반환하도록 바꾼다. 이제 특강 데이터가 없어도 심사기준 1번이 성립한다.
-- ============================================================================

create table if not exists public.study_prior_participations (
  id uuid primary key default gen_random_uuid(),

  -- 매칭 키. 성명 + (직번 또는 연락처) 중 하나 이상이 맞아야 조회된다
  -- — 0014의 자동 조회와 동일한 규칙이라 두 출처의 결과가 어긋나지 않는다.
  name text not null,
  id_number text not null default '',
  phone text not null default '',

  program_name text not null,
  program_year int,
  /** 이수 여부. 행의 존재 자체가 '참여'이고, 이 값이 true면 '이수'까지 인정된다. */
  completed boolean not null default false,
  note text not null default '',

  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 직번도 연락처도 없으면 어떤 신청자와도 이어지지 않아 등록해도 소용이 없다.
  constraint study_prior_participations_key_required
    check (nullif(id_number, '') is not null or nullif(phone, '') is not null),

  -- 같은 사람의 같은 프로그램을 중복 등록하지 않는다.
  constraint study_prior_participations_unique
    unique (name, id_number, phone, program_name)
);

comment on table public.study_prior_participations is
  '심사기준 1번(AI융합원 프로그램 참여·이수)의 수기 등록 대장. 특강 DB에 없는 이력을 관리자가 직접 넣는다.';
comment on column public.study_prior_participations.completed is
  '행의 존재 = 참여. 이 값이 true면 이수까지 인정.';

create index if not exists study_prior_participations_name_idx
  on public.study_prior_participations (name);

create or replace trigger trg_study_prior_participations_updated_at
before update on public.study_prior_participations
for each row execute function public.set_updated_at();

-- 등록자를 클라이언트가 보내는 값이 아니라 세션에서 채운다(위조 방지 + 입력 부담 제거).
create or replace function public.set_study_prior_participation_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by := coalesce(auth.jwt() ->> 'email', '');
  return new;
end;
$$;

create or replace trigger trg_study_prior_participations_author
before insert on public.study_prior_participations
for each row execute function public.set_study_prior_participation_author();

alter table public.study_prior_participations enable row level security;

-- 운영 관리자만 대장을 편집한다. 심사위원은 RPC(security definer)로만 조회하므로
-- 이 테이블에 직접 접근할 권한이 필요 없다.
drop policy if exists "study_prior_participations_admin_all" on public.study_prior_participations;
create policy "study_prior_participations_admin_all" on public.study_prior_participations
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- match_prior_participation() 재정의 — 자동(특강 DB) + 수기 등록을 합산
--
-- 반환 시그니처는 0014와 동일하게 유지한다(프론트 타입을 건드리지 않기 위함).
-- 다만 programs 배열에서 수기 등록 건은 '[수기]' 표시를 붙여, 심사위원이 근거의 출처를
-- 구분할 수 있게 한다 — 자동 조회분과 사람이 넣은 값은 신뢰 수준이 다르기 때문.
--
-- 주의: RETURNS TABLE의 출력 컬럼명(applied_count/completed_count/programs)은 함수 본문에서
-- 변수로도 잡힌다. 내부 별칭은 pp_ 접두어로 두어 ambiguous 오류를 피한다.
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
  with matched as (
    -- ① 자동: 이 포털을 거친 특강 신청 이력
    select
      w.round_label || ' ' || w.topic as pp_label,
      (a.status = '이수') as pp_completed
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
      )

    union all

    -- ② 수기: 관리자가 등록한 이력
    select
      '[수기] '
        || coalesce(pp.program_year::text || ' ', '')
        || pp.program_name as pp_label,
      pp.completed as pp_completed
    from public.study_prior_participations pp
    where public.is_reviewer()
      and pp.name = p_name
      and (
        (nullif(p_id_number, '') is not null and nullif(pp.id_number, '') = p_id_number)
        or (
          nullif(p_phone, '') is not null
          and nullif(pp.phone, '') is not null
          and regexp_replace(pp.phone, '[^0-9]', '', 'g') = regexp_replace(p_phone, '[^0-9]', '', 'g')
        )
      )
  )
  select
    count(*) as applied_count,
    count(*) filter (where m.pp_completed) as completed_count,
    coalesce(array_agg(distinct m.pp_label order by m.pp_label), '{}'::text[]) as programs
  from matched m;
$$;

comment on function public.match_prior_participation(text, text, text) is
  '심사기준 1번 근거: 특강 신청 이력(자동) + 관리자 수기 등록 대장을 합산. 수기 건은 programs에 [수기]로 표시된다.';

grant execute on function public.match_prior_participation(text, text, text) to authenticated;
