-- ============================================================================
-- 2026학년도 2학기 팀별 최종 일정 · 전문가 배정 결과 시드
-- 근거: AI융합원 「팀별 일정 및 내용」 확정표(엑셀, 2026. 9.) — 문구는 원문 그대로다. 임의로 다듬지 말 것.
--
-- 팀 식별: 엑셀에는 접수번호가 없어 "회차 + 대표자 성명"으로 study_groups를 찾는다.
--   · 같은 성명의 대표자가 회차 안에 2팀 이상이면 오적재를 피해 넣지 않는다(having count(*) = 1).
--   · 선발 이후 상태(selected/in_progress/report_submitted/completed)인 팀만 대상이다.
--   · 이미 행이 있으면 건드리지 않는다(on conflict do nothing) — 관리자가 화면에서 고친 값을 덮어쓰지 않는다.
--   · 못 찾은 팀은 관리자가 「연구모임 관리」 상세 팝업에서 직접 입력한다.
-- ============================================================================

create or replace function pg_temp.seed_final_schedule(
  p_leader text, p_team_no int, p_composition text, p_expert text,
  p_w1 text, p_d1 text, p_w2 text, p_d2 text, p_w3 text, p_d3 text
) returns void language plpgsql as $$
declare
  v_group_id uuid;
begin
  select min(g.id::text)::uuid into v_group_id
  from public.study_groups g
  join public.study_rounds r on r.id = g.round_id
  where r.title = '2026학년도 2학기 AI 활용 연구모임'
    and g.leader_name = p_leader
    and g.status in ('selected', 'in_progress', 'report_submitted', 'completed')
  having count(*) = 1;

  if v_group_id is null then
    raise notice '[0028] 대표자 %(%팀) 연구모임을 찾지 못해 건너뜁니다.', p_leader, p_team_no;
    return;
  end if;

  insert into public.study_final_schedules (
    group_id, team_no, composition, expert_label,
    step1_when, step1_detail, step2_when, step2_detail, step3_when, step3_detail,
    updated_by
  ) values (
    v_group_id, p_team_no, p_composition, p_expert,
    p_w1, p_d1, p_w2, p_d2, p_w3, p_d3,
    'migration:0028'
  )
  on conflict (group_id) do nothing;
end;
$$;

-- 1팀 · 바이브 코딩을 이용한 단백질 구조 모델링 및 분석 자동화
select pg_temp.seed_final_schedule(
  '권은주', 1,
  '팀장 권은주 등 5명' || chr(10) || '(고급 1, 실시간 비대면)',
  '박용규' || chr(10) || '(Vessl 이사)',
  '9.29(화) 15:00', 'AlphaFold, GPT·Gemini 활용 구조 예측 워크플로우 설계',
  '미정', 'PDB/mmCIF 전처리·RMSD·상호작용 분석 바이브코딩 도구 제작',
  '10.6(화) 15:00', 'FoldX·PyMOL·ChimeraX 연계 스크립트 오류 해결, 결과 시각화 및 배포'
);

-- 2팀 · 수의학 논문 RAG 구축
select pg_temp.seed_final_schedule(
  '심재호', 2,
  '팀장 심재호 등 3명' || chr(10) || '(고급 2, 실시간 비대면)',
  '황준식' || chr(10) || '(기계공학과 교수)',
  '9.29(화)', 'NotebookLM·GPTs 기반 수의학 논문 RAG 지식베이스 설계 및 Task 에이전트 정의',
  '10.14(수) 오전', '논문 수집·요약·주간 문헌리포트 자동화 에이전트 제작',
  '10.27(화)', '강의·문헌조사 적용 결과 오류 보완 및 에이전트 배포'
);

-- 3팀 · 패션브랜딩
select pg_temp.seed_final_schedule(
  '성희원', 3,
  '팀장 성희원 등 5명' || chr(10) || '(초급, 실시간 대면)',
  '조선영' || chr(10) || '(숭실대 영화예술학과 교수)',
  '(사전미팅) 9.30.(수) 19:00' || chr(10) || '10.2(금) 09:00~12:00', '브랜드·VMD 데이터 구축, 시각화 일관성 제어 규칙 및 프롬프트 모듈 구조화',
  '10.14(수) 16:00~19:00', '시즌 콘셉트별 무드보드·매장 레이아웃·마네킹 착장 이미지 생성 스킬 제작',
  '11.4(수) 16:00~19:00', '무료·유료 모델 간 프롬프트 해석 차이 보정, 포트폴리오 톤&매너 일관성 검증'
);

-- 4팀 · AI Food & Pharma Formulator
select pg_temp.seed_final_schedule(
  '김현욱', 4,
  '김현욱 등 4명' || chr(10) || '(중급, 실시간 비대면)',
  '개별 학습',
  '10.2(금)', '식품·제약 전문자료 기반 RAG 데이터베이스 구축 및 활용 실습, 프롬프트 설계 학습',
  '10.23(금)', '제품개발 조건별 프롬프트 최적화 및 Formulator MVP 제작·테스트',
  '11.6(금)', '생성 결과의 정확성·근거성 검토, 데이터베이스·프롬프트 개선 및 MVP 고도화'
);

-- 5팀 · Think2Code: Think First, Code with AI
select pg_temp.seed_final_schedule(
  '박은경', 5,
  '박은경 등 4명' || chr(10) || '(고급 2, 실시간 대면)',
  '이성원' || chr(10) || '(Google Certified Trainer)',
  '10.6(화) 15:30', 'Agent Architecture·Workflow·Context 관리 및 System Prompt 설계 실습, 플랫폼 선정',
  '10.27(화) 15:30', '학습자 응답 기반 단계별 분기·동적 피드백 Agent MVP 및 웹 UI 연동 구현',
  '11.10(화) 15:30', '학습 시나리오 테스트, 오류 개선 및 웹 환경 배포'
);

-- 6팀 · EDU PRACTICE
select pg_temp.seed_final_schedule(
  '김용진', 6,
  '김용진 등 4명' || chr(10) || '(고급 1, 실시간 대면)',
  '이성원' || chr(10) || '(Google Certified Trainer)',
  '10.12(월) 16:00', 'GPTs·NotebookLM 기반 중등·대학 RAG 교재 구성 및 교수법 적용 설계',
  '10.26(월) 16:00', '바이브코딩으로 개념 학습·가상실험 시뮬레이션(HTML) 제작',
  '11.9(월) 16:00', '시뮬레이션 오류 수정·고도화 및 수업 적용 자료 배포'
);

-- 7팀 · AI 활용 영어 교수법 연구회
select pg_temp.seed_final_schedule(
  '이희정', 7,
  '이희정 등 3명' || chr(10) || '(고급 1, 실시간 대면)',
  '박성재' || chr(10) || '(모모에듀 대표)',
  '10.2(금) 11:00', '대학 영어수업 요구 분석 기반 통합 웹앱 구조 및 MVP 3개 모듈 설계',
  '10.16(금) 11:00', 'AI 바이브코딩 기반 웹앱 프로토타입 제작 및 기능 연동',
  '10.30(금)', '수업 적용 결과 반영 오류 개선, 웹앱 최종 배포 및 유지보수 안내'
);

-- 8팀 · AI 기반 창업 의사결정 교수법 연구회
select pg_temp.seed_final_schedule(
  '김기욱', 8,
  '김기욱 등 3명' || chr(10) || '(중급, 실시간 대면)',
  '최영복' || chr(10) || '(Npulse 대표)',
  '9.29(화) 14:00', '창업 시장·특허·규제 문서 기반 NotebookLM RAG 지식베이스 설계',
  '10.13(화) 14:00', '아이디어 검증·의사결정 지원 GPTs 도구 제작 및 프롬프트 설계',
  '10.27(화) 14:00', '도구 오류 개선, 추천도구 목록 및 배포 매뉴얼 작성'
);

-- 9팀 · AI 데이터 연구회
select pg_temp.seed_final_schedule(
  '홍재원', 9,
  '홍재원 등 3명' || chr(10) || '(중급, 실시간 대면)',
  '김고원' || chr(10) || '(건축학과 교수)',
  '(사전미팅) 10.6(화) 10:00', '질적·양적 데이터 분석을 위한 AI 도구 선정 및 연구 가이드라인 수립',
  '10.20(화) / 2안 10.21(수)', 'NotebookLM·Custom GPTs 기반 데이터 분석 파이프라인 및 연구 보조 GPT 제작',
  '미정 / 2안 미정', '분석 결과 검증·편향 보정, 학술지 투고용 결과 기술 워크플로 정착'
);

-- 10팀 · AI 기반 이공계 실험보고서 글쓰기 피드백 도구 개발 연구모임
select pg_temp.seed_final_schedule(
  '조은정', 10,
  '조은정 등 3명' || chr(10) || '(고급 1, 실시간 대면)',
  '박용규' || chr(10) || '(vessl 이사)',
  '10.19(월) 18:30', '피드백 도구 전체 구조 설계, 기술 스택·배포 방식 선정 및 개발 순서 정리',
  '10.26(화) 18:30', '단락 구분·논증 구조 표시 프로토타입 제작, API 연동 및 데이터 저장 구현',
  '11.2(월) 18:30', '화학과 수업 시범 적용, 오류 해결 최종 배포 및 유지보수 방법 안내'
);

drop function pg_temp.seed_final_schedule(text, int, text, text, text, text, text, text, text, text);
