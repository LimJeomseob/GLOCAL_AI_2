-- ============================================================================
-- [검수용] 시스템 점검 회차 — 가상자료 입력 (일회성 운영 스크립트)
--
-- 목적: 신청 → 심사 → 선발 → 운영(전문가 배정·코칭·회의록) → 결과보고 → 이수확정의
--       전 과정을 실제 화면에서 한 번에 시연·검수할 수 있도록, 단계별 상태의 가상 팀
--       9개와 가상 전문가 3명을 별도 회차에 넣는다. 설명서는
--       docs/시스템점검회차_운영안내_가상자료.md.
--
-- 사용처: Supabase 대시보드 → SQL Editor. 마이그레이션이 아니므로 supabase/migrations에
--         두지 않는다(운영 DB에 자동 적용되면 안 된다).
-- 삭제:   scripts/reset_system_check_round.sql
--
-- 실운영(2026학년도 2학기)과의 격리
--   · 별도 회차: year=2026, semester='0학기(시스템점검)'. 접수번호는 SG-2026-0-###,
--     전문가는 EX-2026-0-### 로 채번되어 실제 SG-2026-2-### 와 겹치지 않는다.
--   · is_active=false → 공개 화면(사업안내·신청)은 계속 2학기 회차만 본다.
--   · 관리자 화면의 회차 선택 목록은 year·semester 내림차순이라 '2학기'가 계속 기본값이고,
--     점검 회차는 그 아래에 뜬다.
--   · 가상 인물은 성이 달라도 이름이 모두 '점검'이고, 연락처 010-0000-####,
--     이메일 @example.com(RFC 2606 예약 도메인 — 실제 수신자가 없다)을 쓴다.
--   · 안내 메일 큐의 가상 행은 제목 앞에 '[점검·가상]'을 붙인다.
--
-- 트리거 우회에 대하여
--   SQL Editor는 관리자 JWT가 없어 is_admin()이 false다. 그래서 접수 구간·팀 규모 검사
--   (check_study_group_submit, check_study_expert_apply)가 공개 경로와 똑같이 걸린다.
--   입력하는 동안만 회차의 신청 구간을 "지금"을 포함하도록 열어 두고, 끝에서 표시용
--   가상 일정(2026. 7.~8.)으로 되돌린다. 트리거를 끄지 않으므로 채번·참여자 수 동기화·
--   복수 학과 판정·심사 총점 계산·안내 메일 큐 적재는 실제와 같은 경로로 만들어진다.
--
-- 재실행 안전: 점검 회차가 이미 있으면 아무것도 하지 않는다(notice만 출력).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 보조 함수 (pg_temp — 세션이 끝나면 사라진다)
-- ---------------------------------------------------------------------------

-- 연구모임 1팀을 draft로 만든다: 모임 + 참여자(첫 원소가 대표자) + 계획서
create or replace function pg_temp.demo_group(
  p_round uuid,
  p_created_at timestamptz,
  p_name text, p_topic text, p_category text,
  p_method text, p_mode text, p_nontenured boolean,
  p_members jsonb,   -- [{id,name,aff,pos,phone,email}], 0번이 대표자
  p_plan jsonb       -- {s1..s5, pref}
) returns uuid language plpgsql as $$
declare
  v_id uuid;
  v_leader jsonb := p_members -> 0;
  v_m jsonb;
  v_i int := 0;
  v_chars int;
begin
  insert into public.study_groups (
    round_id, name, topic, category,
    leader_name, leader_affiliation, leader_position, leader_id_number, leader_phone, leader_email,
    period_start, period_end, has_nontenured, progress_method, education_mode,
    status, consent, ethics_pledges, created_at
  ) values (
    p_round, p_name, p_topic, p_category,
    v_leader ->> 'name', v_leader ->> 'aff', v_leader ->> 'pos', v_leader ->> 'id',
    v_leader ->> 'phone', v_leader ->> 'email',
    '2026-07-20', '2026-08-28', p_nontenured, p_method, p_mode,
    'draft', true,
    '[
      {"no":1,"title":"데이터 프라이버시 및 보안 중점","pledge":"[가상] 학생 개인정보가 담긴 자료는 AI 도구에 올리지 않고 비식별 처리 후에만 활용하겠습니다."},
      {"no":2,"title":"콘텐츠 정확성 및 책임","pledge":"[가상] AI가 만든 수업자료는 원문·교재와 대조해 교수자가 최종 검토하겠습니다."},
      {"no":5,"title":"생성형 AI 사용 투명성","pledge":"[가상] 수업·연구 산출물에 AI 활용 범위를 명시하겠습니다."}
    ]'::jsonb,
    p_created_at
  ) returning id into v_id;

  for v_m in select * from jsonb_array_elements(p_members) loop
    insert into public.study_group_members (
      group_id, id_number, name, affiliation, position, phone, email, is_leader, sort_order
    ) values (
      v_id, v_m ->> 'id', v_m ->> 'name', v_m ->> 'aff', v_m ->> 'pos',
      coalesce(v_m ->> 'phone', ''), coalesce(v_m ->> 'email', ''), v_i = 0, v_i
    );
    v_i := v_i + 1;
  end loop;

  v_chars := char_length(coalesce(p_plan ->> 's1', '') || coalesce(p_plan ->> 's2', '') ||
                         coalesce(p_plan ->> 's3', '') || coalesce(p_plan ->> 's4', '') ||
                         coalesce(p_plan ->> 's5', ''));

  insert into public.study_group_plans (
    group_id, section1_topic, section2_purpose, section3_platform, section4_effect, section5_etc,
    workshop_pref, char_count, created_at
  ) values (
    v_id,
    coalesce(p_plan ->> 's1', ''), coalesce(p_plan ->> 's2', ''), coalesce(p_plan ->> 's3', ''),
    coalesce(p_plan ->> 's4', ''), coalesce(p_plan ->> 's5', ''),
    coalesce(p_plan -> 'pref', '{}'::jsonb), v_chars, p_created_at
  );

  return v_id;
end;
$$;

-- 계획서 제출 → 모임 submitted (트리거가 팀 규모 3~5명을 검사하고 접수확인 메일을 큐에 넣는다)
create or replace function pg_temp.demo_submit(p_group uuid, p_at timestamptz)
returns void language plpgsql as $$
begin
  update public.study_group_plans set submitted_at = p_at where group_id = p_group;
  update public.study_groups set status = 'submitted', submitted_at = p_at where id = p_group;
end;
$$;

-- 심사 1건. 총점 p_total이 되도록 100점 만점에서 감점분을 지표에 돌아가며 1점씩 뺀다.
-- 총점은 compute_study_review_total 트리거가 criteria 배점과 대조해 다시 계산한다.
create or replace function pg_temp.demo_review(
  p_group uuid, p_email text, p_total int, p_comment text, p_submitted boolean
) returns void language plpgsql as $$
declare
  v_codes text[] := array['c4_1','c2_1','c2_2','c4_2','c4_3','c5_1','c5_2','c1_2','c1_1'];
  v_max int[] := array[20,10,10,10,10,10,10,10,10];
  v_i int;
  v_scores jsonb := '{}'::jsonb;
begin
  for v_i in 1..9 loop
    v_scores := v_scores || jsonb_build_object(v_codes[v_i], v_max[v_i]);
  end loop;
  for v_i in 0..(100 - p_total - 1) loop
    v_scores := jsonb_set(
      v_scores, array[v_codes[(v_i % 9) + 1]],
      to_jsonb((v_scores ->> v_codes[(v_i % 9) + 1])::int - 1)
    );
  end loop;

  insert into public.study_reviews (group_id, reviewer_email, scores, comment, submitted_at)
  values (p_group, p_email, v_scores, p_comment,
          case when p_submitted then '2026-07-15T17:00:00+09:00'::timestamptz end);
end;
$$;

-- ---------------------------------------------------------------------------
-- 본 입력
-- ---------------------------------------------------------------------------
do $$
declare
  v_base public.study_rounds%rowtype;
  v_round uuid;
  g1 uuid; g2 uuid; g3 uuid; g4 uuid; g5 uuid; g6 uuid; g7 uuid; g8 uuid; g9 uuid;
  ex1 uuid; ex2 uuid; ex3 uuid;
  r1 text := 'reviewer1.demo@example.com';
  r2 text := 'reviewer2.demo@example.com';
  r3 text := 'reviewer3.demo@example.com';
  v_plan jsonb;
begin
  if exists (select 1 from public.study_rounds where year = 2026 and semester = '0학기(시스템점검)') then
    raise notice '[점검] 시스템 점검 회차가 이미 있어 건너뜁니다. 다시 넣으려면 reset_system_check_round.sql을 먼저 실행하세요.';
    return;
  end if;

  -- 카테고리·심사기준은 실제 2학기 회차를 그대로 복사한다(심사 화면이 같은 기준으로 보이도록).
  select * into v_base from public.study_rounds where year = 2026 and semester = '2학기';
  if v_base.id is null then
    raise exception '[점검] 기준 회차(2026학년도 2학기)가 없습니다. 0016 시드를 먼저 적용하세요.';
  end if;

  -- 1) 회차 — 입력하는 동안만 신청 구간을 지금 기준으로 열어 둔다(끝에서 표시용 일정으로 되돌림)
  insert into public.study_rounds (
    year, semester, title, research_topic,
    apply_open_at, apply_close_at, review_close_at,
    period_start, period_end, report_due_at,
    expert_apply_open_at, expert_apply_close_at,
    max_teams, max_members_total, min_team_size, max_team_size,
    categories, criteria, notes, is_active
  ) values (
    2026, '0학기(시스템점검)',
    '[시스템 점검] AI 활용 연구모임 운영 검수 회차 (가상자료)',
    v_base.research_topic,
    now() - interval '1 day', now() + interval '1 day', now() + interval '2 days',
    '2026-07-20', '2026-08-28', '2026-08-28T18:00:00+09:00',
    now() - interval '1 day', now() + interval '1 day',
    4, 20, 3, 5,
    v_base.categories, v_base.criteria,
    '[점검용 가상자료] 실제 신청이 아닙니다. 검수가 끝나면 scripts/reset_system_check_round.sql로 삭제합니다. 선발 규모 4팀.',
    false
  ) returning id into v_round;

  -- 2) 교내 AI활용 전문가 3명 (선정 2 · 미선정 1)
  insert into public.study_expert_applications (
    round_id, name, affiliation, position, id_number, phone, email, is_nontenured,
    experience, categories, ai_tools, availability_confirmed, consent, created_at
  ) values (
    v_round, '한점검', '공과대학 컴퓨터공학과', '교수', 'T91001', '010-0000-1001', 'expert1.demo@example.com', false,
    '[가상] 2025년 RAG 기반 강의 보조 챗봇 개발·운영, 교내 바이브코딩 워크숍 2회 강의',
    array['중급','고급1','고급2'], 'ChatGPT(GPTs), Claude, Cursor, n8n', true, true,
    '2026-07-03T10:00:00+09:00'
  ) returning id into ex1;

  insert into public.study_expert_applications (
    round_id, name, affiliation, position, id_number, phone, email, is_nontenured,
    experience, categories, ai_tools, availability_confirmed, consent, created_at
  ) values (
    v_round, '서점검', '사범대학 교육학과', '부교수', 'T91002', '010-0000-1002', 'expert2.demo@example.com', false,
    '[가상] 생성형 AI 활용 수업설계 연구 3편, 교수학습센터 AI 교수법 컨설팅 위원',
    array['초급','중급'], 'NotebookLM, Gemini, Canva AI', true, true,
    '2026-07-04T14:00:00+09:00'
  ) returning id into ex2;

  insert into public.study_expert_applications (
    round_id, name, affiliation, position, id_number, phone, email, is_nontenured,
    experience, categories, ai_tools, availability_confirmed, consent, created_at
  ) values (
    v_round, '문점검', '경영대학 경영학과', '시간강사', 'T91003', '010-0000-1003', 'expert3.demo@example.com', true,
    '[가상] 교양 강좌에서 ChatGPT 활용 과제 운영 1학기',
    array['초급'], 'ChatGPT', true, true,
    '2026-07-08T09:30:00+09:00'
  ) returning id into ex3;

  update public.study_expert_applications set status = 'selected', note = '[점검] 1·4팀 배정' where id = ex1;
  update public.study_expert_applications set status = 'selected', note = '[점검] 2·3팀 배정' where id = ex2;
  update public.study_expert_applications set status = 'rejected', note = '[점검] 코칭 경험 요건 미충족' where id = ex3;

  -- 3) 연구모임 9팀 — 상태별 1팀씩(선발 이후 단계는 여러 팀)
  v_plan := jsonb_build_object(
    's1', '[가상] 연구 배경: 실험 수업에서 사전 안전교육과 결과 해석 피드백이 조교 1인에게 몰려 학생 질문이 누적된다. AI 조교 에이전트로 반복 질의를 흡수하는 모델을 연구한다.',
    's2', '[가상] 목적: 교수자·조교의 반복 업무를 줄이고 학생별 즉시 피드백을 제공한다. 필요성: 대형 실험 과목(수강생 120명)의 피드백 지연 해소.',
    's3', '[가상] 1단계 GPTs로 실험 매뉴얼 RAG 구성 → 2단계 에이전트(n8n)로 실험 보고서 1차 피드백 자동화 → 3단계 LMS 연동 배포. 요청사항: 에이전트 배포 환경 설정 코칭.',
    's4', '[가상] 기대효과: 조교 응답 시간 50% 단축. 활용: 차년도 실험 과목 3개로 확산, 공동교육센터 공유 콘텐츠로 제공.',
    's5', '[가상] 단계별 워크숍 희망 시기: 기획 7월 넷째 주, 제작 8월 둘째 주, 환류 8월 넷째 주.',
    'pref', '{"option1":{"step1":"2026-07-22","step2":"2026-08-12","step3":"2026-08-26"},"option2":{"step1":"2026-07-24","step2":"2026-08-14","step3":"2026-08-27"}}'::jsonb
  );

  -- 1팀: 이수완료(completed) — 전 과정을 마친 모범 사례
  g1 := pg_temp.demo_group(v_round, '2026-07-02T10:00:00+09:00',
    'AI 조교 에이전트 연구회', 'AI 조교 에이전트로 실험 수업 피드백 자동화', '고급2',
    '전문가코칭', '대면', false,
    '[{"id":"T90101","name":"김점검","aff":"자연과학대학 화학과","pos":"교수","phone":"010-0000-0101","email":"leader1.demo@example.com"},
      {"id":"T90102","name":"김점검둘","aff":"자연과학대학 생명과학부","pos":"부교수","phone":"010-0000-0102","email":"member102.demo@example.com"},
      {"id":"T90103","name":"김점검셋","aff":"자연과학대학 물리학과","pos":"조교수","phone":"010-0000-0103","email":"member103.demo@example.com"},
      {"id":"T90104","name":"김점검넷","aff":"자연과학대학 화학과","pos":"강의전담교수","phone":"010-0000-0104","email":"member104.demo@example.com"}]'::jsonb,
    v_plan);

  -- 2팀: 결과보고서 제출(report_submitted) — 관리자 검토·이수확정 대기
  g2 := pg_temp.demo_group(v_round, '2026-07-03T11:00:00+09:00',
    '간호 용어 RAG 챗봇 연구회', 'RAG 기반 전공 용어 학습 챗봇 제작', '중급',
    '전문가코칭', '비대면', true,
    '[{"id":"T90201","name":"이점검","aff":"간호대학 간호학과","pos":"부교수","phone":"010-0000-0201","email":"leader2.demo@example.com"},
      {"id":"T90202","name":"이점검둘","aff":"간호대학 간호학과","pos":"시간강사","phone":"010-0000-0202","email":"member202.demo@example.com"},
      {"id":"T90203","name":"이점검셋","aff":"의과대학 의학과","pos":"조교수","phone":"010-0000-0203","email":"member203.demo@example.com"}]'::jsonb,
    v_plan || jsonb_build_object('s1', '[가상] 연구 배경: 간호학과 1학년이 해부·약리 용어에서 가장 많이 이탈한다. 교재 기반 RAG 챗봇으로 자기주도 복습을 돕는다.'));

  -- 3팀: 운영중(in_progress) — 회의록 2/3, 코칭 조율 진행 중
  g3 := pg_temp.demo_group(v_round, '2026-07-04T15:00:00+09:00',
    '교양 글쓰기 AI 피드백 연구회', '생성형 AI로 만드는 교양 글쓰기 피드백 루브릭', '초급',
    '전문가코칭', '대면', false,
    '[{"id":"T90301","name":"박점검","aff":"인문대학 국어국문학과","pos":"조교수","phone":"010-0000-0301","email":"leader3.demo@example.com"},
      {"id":"T90302","name":"박점검둘","aff":"인문대학 영어영문학과","pos":"교수","phone":"010-0000-0302","email":"member302.demo@example.com"},
      {"id":"T90303","name":"박점검셋","aff":"사회과학대학 심리학과","pos":"부교수","phone":"010-0000-0303","email":"member303.demo@example.com"},
      {"id":"T90304","name":"박점검넷","aff":"인문대학 사학과","pos":"조교수","phone":"010-0000-0304","email":"member304.demo@example.com"},
      {"id":"T90305","name":"박점검다섯","aff":"교양교육원","pos":"강의전담교수","phone":"010-0000-0305","email":"member305.demo@example.com"}]'::jsonb,
    v_plan || jsonb_build_object('s1', '[가상] 연구 배경: 교양 글쓰기 과목의 첨삭 부담이 커서 피드백이 1회에 그친다. 루브릭 기반 AI 1차 피드백을 설계한다.'));

  -- 4팀: 선발(selected) — 운영 개시 전. 같은 학과 3명(복수 학과 아님), 개별학습
  g4 := pg_temp.demo_group(v_round, '2026-07-06T09:00:00+09:00',
    '공학 시뮬레이션 교구 연구회', '바이브코딩으로 만드는 공학 시뮬레이션 교구', '고급1',
    '개별학습', '비대면', false,
    '[{"id":"T90401","name":"최점검","aff":"공과대학 기계공학과","pos":"교수","phone":"010-0000-0401","email":"leader4.demo@example.com"},
      {"id":"T90402","name":"최점검둘","aff":"기계공학과","pos":"부교수","phone":"010-0000-0402","email":"member402.demo@example.com"},
      {"id":"T90403","name":"최점검셋","aff":"경상국립대학교 기계공학과","pos":"조교수","phone":"010-0000-0403","email":"member403.demo@example.com"}]'::jsonb,
    v_plan || jsonb_build_object('s1', '[가상] 연구 배경: 열역학·동역학 개념을 정적 그림으로만 설명해 학생 이해도가 낮다. 브라우저에서 도는 시뮬레이션 교구를 바이브코딩으로 만든다.'));

  -- 5팀: 미선발(rejected) — 5위, 선발 규모(4팀) 밖
  g5 := pg_temp.demo_group(v_round, '2026-07-07T13:00:00+09:00',
    '판례 요약 수업 연구회', 'AI 활용 법학 판례 요약 수업', '초급',
    '전문가코칭', '대면', false,
    '[{"id":"T90501","name":"정점검","aff":"법과대학 법학과","pos":"교수","phone":"010-0000-0501","email":"leader5.demo@example.com"},
      {"id":"T90502","name":"정점검둘","aff":"법과대학 법학과","pos":"부교수","phone":"010-0000-0502","email":"member502.demo@example.com"},
      {"id":"T90503","name":"정점검셋","aff":"행정학과","pos":"조교수","phone":"010-0000-0503","email":"member503.demo@example.com"}]'::jsonb,
    v_plan || jsonb_build_object('s3', '[가상] ChatGPT로 판례 요약. (구체적 단계·요청사항 미기재)'));

  -- 6팀: 심사중(under_review) — 심사위원 3인 중 2인 제출
  g6 := pg_temp.demo_group(v_round, '2026-07-08T16:00:00+09:00',
    '농업 데이터 RAG 연구회', '스마트팜 데이터 해설 RAG 도우미', '중급',
    '전문가코칭', '비대면', false,
    '[{"id":"T90601","name":"강점검","aff":"농업생명과학대학 원예과학부","pos":"부교수","phone":"010-0000-0601","email":"leader6.demo@example.com"},
      {"id":"T90602","name":"강점검둘","aff":"농업생명과학대학 스마트농산업학과","pos":"조교수","phone":"010-0000-0602","email":"member602.demo@example.com"},
      {"id":"T90603","name":"강점검셋","aff":"농업생명과학대학 원예과학부","pos":"교수","phone":"010-0000-0603","email":"member603.demo@example.com"}]'::jsonb,
    v_plan);

  -- 7팀: 제출완료(submitted) — 심사 전
  g7 := pg_temp.demo_group(v_round, '2026-07-09T10:00:00+09:00',
    '디자인 프로토타입 연구회', '바이브코딩 기반 인터랙션 디자인 실습 도구', '고급1',
    '전문가코칭', '대면', false,
    '[{"id":"T90701","name":"조점검","aff":"예술대학 디자인학과","pos":"조교수","phone":"010-0000-0701","email":"leader7.demo@example.com"},
      {"id":"T90702","name":"조점검둘","aff":"예술대학 디자인학과","pos":"교수","phone":"010-0000-0702","email":"member702.demo@example.com"},
      {"id":"T90703","name":"조점검셋","aff":"공과대학 컴퓨터공학과","pos":"부교수","phone":"010-0000-0703","email":"member703.demo@example.com"}]'::jsonb,
    v_plan);

  -- 8팀: 임시저장(draft) — 신청서만 저장, 계획서 미제출(작성 중)
  g8 := pg_temp.demo_group(v_round, '2026-07-09T17:00:00+09:00',
    '체육 동작분석 연구회', 'AI 영상분석으로 동작 피드백 수업 설계', '초급',
    null, null, false,
    '[{"id":"T90801","name":"윤점검","aff":"사범대학 체육교육과","pos":"부교수","phone":"010-0000-0801","email":"leader8.demo@example.com"},
      {"id":"T90802","name":"윤점검둘","aff":"사범대학 체육교육과","pos":"조교수","phone":"010-0000-0802","email":"member802.demo@example.com"},
      {"id":"T90803","name":"윤점검셋","aff":"스포츠과학과","pos":"교수","phone":"010-0000-0803","email":"member803.demo@example.com"}]'::jsonb,
    jsonb_build_object('s1', '[가상] 작성 중 — 동작 분석 수업의 피드백 지연 문제.'));

  -- 9팀: 취소(cancelled) — 제출 후 대표자 요청으로 취소
  g9 := pg_temp.demo_group(v_round, '2026-07-05T11:00:00+09:00',
    '회계 자동화 연구회', 'AI 에이전트 기반 회계원리 실습 자동 채점', '중급',
    '전문가코칭', '비대면', false,
    '[{"id":"T90901","name":"장점검","aff":"경영대학 회계학과","pos":"교수","phone":"010-0000-0901","email":"leader9.demo@example.com"},
      {"id":"T90902","name":"장점검둘","aff":"경영대학 경영학과","pos":"부교수","phone":"010-0000-0902","email":"member902.demo@example.com"},
      {"id":"T90903","name":"장점검셋","aff":"경영대학 회계학과","pos":"조교수","phone":"010-0000-0903","email":"member903.demo@example.com"}]'::jsonb,
    v_plan);

  -- 4) 계획서 제출 → submitted (접수확인 메일 큐 적재)
  perform pg_temp.demo_submit(g1, '2026-07-02T18:00:00+09:00');
  perform pg_temp.demo_submit(g2, '2026-07-03T18:00:00+09:00');
  perform pg_temp.demo_submit(g3, '2026-07-04T18:00:00+09:00');
  perform pg_temp.demo_submit(g4, '2026-07-06T18:00:00+09:00');
  perform pg_temp.demo_submit(g5, '2026-07-07T18:00:00+09:00');
  perform pg_temp.demo_submit(g6, '2026-07-08T18:00:00+09:00');
  perform pg_temp.demo_submit(g7, '2026-07-09T18:00:00+09:00');
  perform pg_temp.demo_submit(g9, '2026-07-05T18:00:00+09:00');
  update public.study_groups set status = 'cancelled' where id = g9;

  -- 5) 서면심사 — 심사위원 3인(1~5팀 완료, 6팀은 2인만 제출·1인 작성 중)
  perform pg_temp.demo_review(g1, r1, 90, '[가상] 단계별 계획과 확산 방안이 구체적임.', true);
  perform pg_temp.demo_review(g1, r2, 88, '[가상] 에이전트 배포 요청사항이 명확함.', true);
  perform pg_temp.demo_review(g1, r3, 86, '[가상] 복수 학과 구성 우수.', true);
  perform pg_temp.demo_review(g2, r1, 85, '[가상] 비전임 교원 포함, 활용 대상 명확.', true);
  perform pg_temp.demo_review(g2, r2, 84, '[가상] RAG 데이터 범위 구체화 필요.', true);
  perform pg_temp.demo_review(g2, r3, 83, '', true);
  perform pg_temp.demo_review(g3, r1, 81, '[가상] 초급 수준에 적합.', true);
  perform pg_temp.demo_review(g3, r2, 80, '', true);
  perform pg_temp.demo_review(g3, r3, 79, '[가상] 루브릭 검증 계획 보완 권장.', true);
  perform pg_temp.demo_review(g4, r1, 79, '[가상] 개별학습 계획이 구체적.', true);
  perform pg_temp.demo_review(g4, r2, 78, '', true);
  perform pg_temp.demo_review(g4, r3, 77, '[가상] 단일 학과 구성.', true);
  perform pg_temp.demo_review(g5, r1, 66, '[가상] AI 플랫폼 활용 계획이 추상적임.', true);
  perform pg_temp.demo_review(g5, r2, 64, '[가상] 요청사항 미기재.', true);
  perform pg_temp.demo_review(g5, r3, 65, '', true);
  perform pg_temp.demo_review(g6, r1, 82, '[가상] 데이터 출처 명시 우수.', true);
  perform pg_temp.demo_review(g6, r2, 80, '', true);
  perform pg_temp.demo_review(g6, r3, 75, '[가상] 작성 중(미제출)', false);

  -- 6) 심사 확정 — finalize_study_review()와 같은 규칙(3인 평균 → 순위 → 상위 4팀 선발)
  --    을 SQL로 재현한다. 그 함수는 is_admin()을 요구해 SQL Editor에서 부를 수 없다.
  update public.study_groups g
  set total_score = s.avg_total, rank = s.rk
  from (
    select rv.group_id, round(avg(rv.total), 2) as avg_total,
           rank() over (order by round(avg(rv.total), 2) desc)::int as rk
    from public.study_reviews rv
    where rv.group_id in (g1, g2, g3, g4, g5) and rv.submitted_at is not null
    group by rv.group_id
  ) s
  where g.id = s.group_id;

  update public.study_groups set status = 'under_review' where id = g6;
  update public.study_groups set status = 'selected' where id in (g1, g2, g3, g4);  -- 심사결과(선발) 큐
  update public.study_groups set status = 'rejected' where id = g5;                -- 심사결과(미선발) 큐

  -- 7) 전문가 배정 (관리자 「연구모임 운영현황」에서 하는 작업)
  update public.study_groups set expert_id = ex1, expert_assigned_at = '2026-07-18T10:00:00+09:00' where id in (g1, g4);
  update public.study_groups set expert_id = ex2, expert_assigned_at = '2026-07-18T10:00:00+09:00' where id in (g2, g3);

  -- 8) 운영 개시 → in_progress, 이후 단계
  update public.study_groups set status = 'in_progress' where id in (g1, g2, g3);

  -- 9) 팀별 최종 일정 공지 (4팀은 관리자가 입력 중 → 비공개)
  insert into public.study_final_schedules (
    group_id, team_no, composition, expert_label,
    step1_when, step1_detail, step2_when, step2_detail, step3_when, step3_detail, note, published, updated_by
  ) values
  (g1, 1, '팀장 김점검 등 4명' || chr(10) || '(고급 2, 실시간 대면)', '한점검' || chr(10) || '(컴퓨터공학과 교수)',
   '7.22(수) 15:00', '[가상] 실험 매뉴얼 RAG 설계, 에이전트 역할 정의',
   '8.12(수) 15:00', '[가상] 보고서 1차 피드백 에이전트 제작',
   '8.26(수) 15:00', '[가상] 오류 보완 및 LMS 연동 배포', '', true, '[점검] 가상자료'),
  (g2, 2, '팀장 이점검 등 3명' || chr(10) || '(중급, 실시간 비대면)', '서점검' || chr(10) || '(교육학과 부교수)',
   '7.23(목) 10:00', '[가상] 용어 코퍼스 수집·정제 기준 수립',
   '8.6(목) 10:00', '[가상] RAG 챗봇 제작 및 프롬프트 튜닝',
   '8.20(목) 10:00', '[가상] 학생 파일럿 결과 반영', '', true, '[점검] 가상자료'),
  (g3, 3, '팀장 박점검 등 5명' || chr(10) || '(초급, 실시간 대면)', '서점검' || chr(10) || '(교육학과 부교수)',
   '7.24(금) 14:00', '[가상] 글쓰기 루브릭 설계',
   '8.14(금) 14:00' || chr(10) || '/ 2안 8.13(목)', '[가상] 루브릭 기반 피드백 프롬프트 제작',
   '미정', '[가상] 수업 적용 결과 환류', '', true, '팀 대표자 박점검'),
  (g4, 4, '최점검 등 3명' || chr(10) || '(고급 1, 실시간 비대면)', '개별 학습',
   '미정', '', '미정', '', '미정', '', '[점검] 관리자 입력 중 — 팀 화면 비공개', false, '[점검] 가상자료');

  -- 10) 코칭 일정 조율 (1팀: 3회 모두 확정 / 3팀: 1차 확정, 2차 조율 중)
  insert into public.study_coaching_sessions (
    group_id, session_no, met_at, start_time, end_time, location, status, proposed_by,
    expert_note, confirmed_by, confirmed_at, created_at
  ) values
  (g1, 1, '2026-07-22', '15:00', '17:00', '자연과학대학 352호', '확정', '팀', '', '전문가 한점검', '2026-07-19T09:00:00+09:00', '2026-07-18T14:00:00+09:00'),
  (g1, 2, '2026-08-12', '15:00', '17:00', '자연과학대학 352호', '확정', '팀', '', '전문가 한점검', '2026-08-03T09:00:00+09:00', '2026-08-01T14:00:00+09:00'),
  (g1, 3, '2026-08-26', '15:00', '17:00', 'Zoom', '확정', '전문가', '', '대표자 김점검', '2026-08-18T09:00:00+09:00', '2026-08-17T14:00:00+09:00'),
  (g3, 1, '2026-07-24', '14:00', '16:00', '인문대학 201호', '확정', '팀', '', '전문가 서점검', '2026-07-20T10:00:00+09:00', '2026-07-19T10:00:00+09:00'),
  (g3, 2, '2026-08-13', '14:00', '16:00', '인문대학 201호', '불가', '팀', '학회 일정으로 불가', '', null, '2026-08-05T10:00:00+09:00'),
  (g3, 2, '2026-08-14', '14:00', '16:00', '인문대학 201호', '가능', '팀', '오후 2시 이후 가능', '', null, '2026-08-06T10:00:00+09:00');

  insert into public.study_coaching_memos (group_id, author_role, author_name, body, created_at) values
  (g3, '팀', '박점검', '[가상] 2차 코칭 13일(목)이 어려우시면 14일(금) 오후는 어떠신지요?', '2026-08-06T10:05:00+09:00'),
  (g3, '전문가', '서점검', '[가상] 14일 오후 2시 가능합니다. 대표자님께서 확정해 주세요.', '2026-08-06T16:20:00+09:00'),
  (g3, '관리자', 'AI융합원', '[가상] 3차 일정은 8월 넷째 주 안에서 정해 주세요.', '2026-08-07T09:00:00+09:00');

  -- 11) 회의록 ([서식 3]) — 1·2팀 3회, 3팀 2회
  insert into public.study_meetings (group_id, met_at, start_time, end_time, location, subject, content, author_name) values
  (g1, '2026-07-22', '15:00', '17:00', '자연과학대학 352호', '1차 코칭(기획) — 에이전트 역할 정의', '[가상] 실험 매뉴얼 5종 수집, RAG 청크 기준 합의. 참석 4명.', '김점검'),
  (g1, '2026-08-12', '15:00', '17:00', '자연과학대학 352호', '2차 코칭(제작) — 피드백 에이전트 제작', '[가상] n8n 워크플로우 초안 완성, 채점 루브릭 연동.', '김점검'),
  (g1, '2026-08-26', '15:00', '17:00', 'Zoom', '3차 코칭(환류) — 배포·결과 정리', '[가상] 파일럿 30명 결과 공유, 오류 12건 수정 완료.', '김점검'),
  (g2, '2026-07-23', '10:00', '11:30', 'Zoom', '1차 회의 — 용어 코퍼스 범위', '[가상] 해부·약리 용어 400개 선정.', '이점검'),
  (g2, '2026-08-06', '10:00', '11:30', 'Zoom', '2차 회의 — 챗봇 프로토타입 점검', '[가상] 오답 응답 사례 정리.', '이점검'),
  (g2, '2026-08-20', '10:00', '11:30', 'Zoom', '3차 회의 — 파일럿 결과', '[가상] 1학년 20명 사용, 만족도 4.3/5.', '이점검'),
  (g3, '2026-07-24', '14:00', '16:00', '인문대학 201호', '1차 코칭(기획) — 루브릭 설계', '[가상] 평가 항목 5개 확정.', '박점검'),
  (g3, '2026-07-31', '14:00', '15:00', '인문대학 201호', '팀 회의 — 프롬프트 초안', '[가상] 항목별 피드백 프롬프트 초안 작성.', '박점검');

  -- 12) 결과보고서([서식 2]) + 산출물 — 1·2팀 제출, 1팀은 관리자 검토 완료
  insert into public.study_reports (
    group_id, actual_period_start, actual_period_end,
    section1_background, section2_topic_purpose, section3_operation, section4_result_use, section5_effect_suggestion,
    char_count, submitted_at, reviewed_at
  ) values
  (g1, '2026-07-20', '2026-08-28',
   '[가상] 대형 실험 과목의 피드백 지연 문제에서 출발.', '[가상] AI 조교 에이전트로 실험 보고서 1차 피드백 자동화.',
   '[가상] 전문가 코칭 3회, 팀 회의 3회. RAG→에이전트→배포 순으로 진행.', '[가상] 2학기 실험 과목 2개에 적용 예정.',
   '[가상] 조교 응답 시간 52% 단축. 제언: 배포 환경 지원 필요.', 180,
   '2026-08-27T17:00:00+09:00', '2026-08-31T10:00:00+09:00'),
  (g2, '2026-07-20', '2026-08-28',
   '[가상] 1학년 전공 용어 학습 이탈 문제.', '[가상] 교재 기반 용어 RAG 챗봇 제작.',
   '[가상] 회의 3회, 파일럿 20명.', '[가상] 2학기 기초간호학 수업에 적용.',
   '[가상] 만족도 4.3/5. 제언: 의학 용어 데이터 공동 구축.', 150,
   '2026-08-28T15:00:00+09:00', null);

  insert into public.study_outputs (group_id, title, output_type, url, drive_uploaded, description, sort_order) values
  (g1, '[가상] 실험 보고서 피드백 에이전트', 'AI 에이전트', 'https://example.com/demo/agent', true, '[가상] n8n 워크플로우 + GPTs', 0),
  (g1, '[가상] 에이전트 활용 수업 가이드', '강의자료', 'https://example.com/demo/guide', true, '', 1),
  (g2, '[가상] 간호 용어 RAG 챗봇', 'RAG 챗봇', 'https://example.com/demo/rag', false, '[가상] 드라이브 미업로드 — 검토 시 보완 요청 대상', 0);

  update public.study_groups set status = 'report_submitted' where id in (g1, g2);
  update public.study_groups set status = 'completed' where id = g1;              -- 이수확정 큐

  -- 13) 심사기준 1번 근거 — 참여·이수 이력 수기 대장
  insert into public.study_prior_participations (name, id_number, phone, program_name, program_year, completed, note, created_by) values
  ('김점검', 'T90101', '', '[가상] 생성형 AI 실무과정 특강', 2026, true, '[점검 가상자료]', '[점검]'),
  ('이점검', 'T90201', '', '[가상] 생성형 AI 실무과정 특강', 2026, false, '[점검 가상자료]', '[점검]'),
  ('박점검', '', '010-0000-0301', '[가상] AI 교수법 워크숍', 2025, true, '[점검 가상자료]', '[점검]');

  -- 14) 안내 메일 큐 정리 — 트리거가 만든 가상 행에 표식을 붙이고,
  --     지난 단계는 '발송 완료'로, 최신 단계 일부만 '대기'로 남겨 승인 흐름을 시연한다.
  update public.study_notifications n
  set subject = '[점검·가상] ' || n.subject
  from public.study_groups g
  where g.id = n.group_id and g.round_id = v_round;

  update public.study_notifications n
  set status = '성공',
      sent_at = case n.stage when '접수확인' then g.submitted_at + interval '5 minutes'
                             else '2026-07-17T19:00:00+09:00'::timestamptz end,
      approved_by = '[점검] 가상자료',
      created_at = case n.stage when '접수확인' then g.submitted_at
                                else '2026-07-17T18:30:00+09:00'::timestamptz end
  from public.study_groups g
  where g.id = n.group_id and g.round_id = v_round
    and n.status = '대기'
    and not (n.stage = '이수확정')                          -- 1팀 이수확정: 대기(승인 시연)
    and not (n.stage = '접수확인' and g.id = g7);          -- 7팀 접수확인: 대기(승인 시연)

  -- 15) 입력 완료 — 회차를 표시용 가상 일정으로 되돌린다
  update public.study_rounds
  set apply_open_at = '2026-07-01T09:00:00+09:00',
      apply_close_at = '2026-07-10T18:00:00+09:00',
      review_close_at = '2026-07-17T18:00:00+09:00',
      expert_apply_open_at = '2026-07-01T09:00:00+09:00',
      expert_apply_close_at = '2026-07-10T18:00:00+09:00'
  where id = v_round;

  raise notice '[점검] 시스템 점검 회차 입력 완료 — 연구모임 9팀, 전문가 3명.';
end;
$$;

-- ---------------------------------------------------------------------------
-- 입력 결과 확인
-- ---------------------------------------------------------------------------
select g.code, g.status, g.name, g.leader_name, g.leader_phone,
       g.member_count, g.is_multi_dept, g.total_score, g.rank,
       e.name as expert
from public.study_groups g
join public.study_rounds r on r.id = g.round_id
left join public.study_expert_applications e on e.id = g.expert_id
where r.semester = '0학기(시스템점검)'
order by g.code;
