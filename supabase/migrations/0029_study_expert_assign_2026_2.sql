-- ============================================================================
-- 2026학년도 2학기 팀별 AI 전문가 배정 (확정표 「팀별 일정 및 내용」 기준)
--
-- 팀 화면의 'AI 전문가' 표기(study_final_schedules.expert_label)는 0028에서 이미 들어갔다.
-- 이 파일은 관리자 화면의 배정 규칙(assignStudyGroupExpertWithLabel, src/lib/studyAdmin.ts)과 같이
-- 두 값을 함께 맞춘다.
--   · 확정표 전문가 이름이 이 회차 「전문가 신청자」 중 '선정(selected)'된 사람과 정확히 1명 일치하면
--     교내 연결(study_groups.expert_id)까지 설정한다 → 그 전문가의 「배정 팀 확인」에 팀이 나타난다.
--   · 일치하는 선정 전문가가 없으면(외부 전문가·'개별 학습') 표기만 두고 expert_id는 해제한다.
--   · 같은 이름이 '선정' 외 상태로만 있으면 NOTICE로 알린다 — 「전문가 신청자」에서 선정한 뒤 다시 실행하면 연결된다.
--   · 최종 일정 행이 없으면 공개 행으로 만든다(0028이 건너뛴 팀 대비). 일정 항목은 건드리지 않는다.
-- 여러 번 실행해도 결과가 같다(idempotent). 팀은 "회차 + 대표자 성명"으로 찾는다(0028과 같은 규칙).
-- 파일 전체를 한 번에 실행할 것(임시 함수 사용).
-- ============================================================================

create or replace function pg_temp.assign_expert(p_leader text, p_team_no int, p_label text)
returns void language plpgsql as $$
declare
  v_round_id uuid;
  v_group_id uuid;
  v_expert_name text := btrim(split_part(p_label, chr(10), 1));
  v_expert_id uuid;
  v_other_status text;
begin
  select id into v_round_id from public.study_rounds
  where title = '2026학년도 2학기 AI 활용 연구모임';

  select min(g.id::text)::uuid into v_group_id
  from public.study_groups g
  where g.round_id = v_round_id
    and g.leader_name = p_leader
    and g.status in ('selected', 'in_progress', 'report_submitted', 'completed')
  having count(*) = 1;

  if v_group_id is null then
    raise notice '[%팀] 대표자 % 연구모임을 찾지 못해 건너뜁니다.', p_team_no, p_leader;
    return;
  end if;

  -- 교내 선정 전문가와 이름이 정확히 1명 일치할 때만 연결한다.
  select min(e.id::text)::uuid into v_expert_id
  from public.study_expert_applications e
  where e.round_id = v_round_id and e.status = 'selected' and btrim(e.name) = v_expert_name
  having count(*) = 1;

  update public.study_groups
  set expert_id = v_expert_id,
      expert_assigned_at = case
        when v_expert_id is null then null
        when expert_id is distinct from v_expert_id then now()
        else expert_assigned_at
      end
  where id = v_group_id;

  insert into public.study_final_schedules (group_id, team_no, expert_label, published, updated_by)
  values (v_group_id, p_team_no, p_label, true, 'sql:팀별 전문가 배정')
  on conflict (group_id) do update
    set expert_label = excluded.expert_label,
        updated_by = excluded.updated_by;

  if v_expert_id is not null then
    raise notice '[%팀] % → 교내 전문가 연결 완료(배정 팀 확인에 표시)', p_team_no, v_expert_name;
  else
    select string_agg(distinct e.status, ',') into v_other_status
    from public.study_expert_applications e
    where e.round_id = v_round_id and btrim(e.name) = v_expert_name;

    if v_other_status is not null then
      raise notice '[%팀] % → 신청자에 있으나 상태가 %여서 표기만 반영. 「전문가 신청자」에서 선정 후 다시 실행하세요.',
        p_team_no, v_expert_name, v_other_status;
    else
      raise notice '[%팀] % → 외부 전문가(또는 개별 학습), 팀 화면 표기만 반영', p_team_no, v_expert_name;
    end if;
  end if;
end;
$$;

-- 1팀 · 바이브 코딩을 이용한 단백질 구조 모델링 및 분석 자동화
select pg_temp.assign_expert('권은주', 1, '박용규' || chr(10) || '(Vessl 이사)');

-- 2팀 · 수의학 논문 RAG 구축
select pg_temp.assign_expert('심재호', 2, '황준식' || chr(10) || '(기계공학과 교수)');

-- 3팀 · 패션브랜딩
select pg_temp.assign_expert('성희원', 3, '조선영' || chr(10) || '(숭실대 영화예술학과 교수)');

-- 4팀 · AI Food & Pharma Formulator
select pg_temp.assign_expert('김현욱', 4, '개별 학습');

-- 5팀 · Think2Code: Think First, Code with AI
select pg_temp.assign_expert('박은경', 5, '이성원' || chr(10) || '(Google Certified Trainer)');

-- 6팀 · EDU PRACTICE
select pg_temp.assign_expert('김용진', 6, '이성원' || chr(10) || '(Google Certified Trainer)');

-- 7팀 · AI 활용 영어 교수법 연구회
select pg_temp.assign_expert('이희정', 7, '박성재' || chr(10) || '(모모에듀 대표)');

-- 8팀 · AI 기반 창업 의사결정 교수법 연구회
select pg_temp.assign_expert('김기욱', 8, '최영복' || chr(10) || '(Npulse 대표)');

-- 9팀 · AI 데이터 연구회
select pg_temp.assign_expert('홍재원', 9, '김고원' || chr(10) || '(건축학과 교수)');

-- 10팀 · AI 기반 이공계 실험보고서 글쓰기 피드백 도구 개발 연구모임
select pg_temp.assign_expert('조은정', 10, '박용규' || chr(10) || '(vessl 이사)');

drop function pg_temp.assign_expert(text, int, text);
