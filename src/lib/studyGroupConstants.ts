/**
 * AI 활용 연구모임(트랙 B) 상수 단일 출처.
 *
 * 근거문서: [글로컬대학사업] 2026학년도 AI활용 연구모임 운영 계획(안) (´26. 8. 28. / AI융합원)
 * 기존 constants.ts는 464행으로 이미 비대하므로 트랙 B는 처음부터 파일을 분리한다.
 *
 * 여기 담긴 문구는 대부분 근거문서 원문이다. 임의로 다듬지 말 것 — 신청자가 배포된
 * 한글 서식과 화면을 나란히 놓고 대조한다.
 */

import type { StudyCategoryDef, StudyCriterion } from "./studyTypes";

export const STUDY_PROGRAM_NAME = "2026학년도 2학기 AI 활용 연구모임";
export const STUDY_HOST = "경상국립대학교 AI융합원";
export const STUDY_RESEARCH_TOPIC = "기획부터 제작까지 함께 하는 AX실전 활용법";

/** 사업 목적 (운영계획(안) Ⅰ) */
export const STUDY_PURPOSES = [
  {
    target: "교원",
    text: "생성형 AI·AX 도구를 수준별(초급~고급)로 학습하는 교수 연구모임 운영으로 AI 활용 교수법 및 연구 확산",
  },
  {
    target: "학생",
    text: "학과·전공을 넘어선 자율 연구공동체를 조성하고 우수 산출물을 공유·확산하여 대학의 디지털 전환(DX)과 글로컬 경쟁력 제고",
  },
] as const;

/** 운영개요 5단계 (운영계획(안) Ⅲ「운영개요」). href가 있으면 해당 탭으로 이동한다. */
export const STUDY_FLOW_STEPS = [
  {
    no: "01",
    title: "연구모임 신청",
    channel: "시스템 접수",
    detail: "3~5명 이내 자유롭게 모임 구성",
    href: "/apply",
  },
  {
    no: "02",
    title: "연구모임 계획서 심사",
    channel: "심사위원에 의한 심사",
    detail: "10개 팀 선발",
    href: null,
  },
  {
    no: "03",
    title: "운영 안내",
    channel: "시스템 안내",
    detail: "승인된 연구모임 활동 안내",
    href: "/lookup",
  },
  {
    no: "04",
    title: "연구모임 운영",
    channel: "시스템을 통한 관리",
    detail: "승인된 계획서에 따라 각 팀별 퍼실리테이터와 함께 연구모임 운영",
    href: "/meetings",
  },
  {
    no: "05",
    title: "결과보고서 제출",
    channel: "시스템 제출",
    detail: "회의록, 산출물, 결과보고서 제출",
    href: "/report",
  },
] as const;

export const STUDY_REVIEW_NOTE =
  "연구계획서 심사: 연구모임 과다 신청시 AI 전문가로 구성된 심사위원 3인에 의한 서면심사";

/** 신청 안내 (운영계획(안) Ⅲ「연구모임 신청」) */
export const STUDY_APPLY_NOTES = [
  "(교원, 학생) 3~5명 이내 자유롭게 모임 구성, 복수 학과 구성시 가산점 부여",
  "비전임 교원 포함 모임 구성 가능",
  "AI 활용 교수법(연구) 및 디지털 전환(DX) 관련 연구 주제 필수 선정",
  "[시스템]을 이용해 구체적 연구 운영 계획 수립",
] as const;

/**
 * 수준별 카테고리 4종. DB(study_rounds.categories)가 정본이며, 이 상수는
 * 라운드를 아직 불러오지 못했을 때의 폴백이다.
 */
export const STUDY_CATEGORY_FALLBACK: StudyCategoryDef[] = [
  {
    key: "초급",
    label: "생성형 AI 활용법 탐색과 수업 적용",
    guide: "생성형 AI를 교수법에 적용하는 다양한 활용 사례 실습",
  },
  {
    key: "중급",
    label: "RAG기반 AI활용 도구 기획·제작",
    guide: "RAG를 이용한 강의 보조도구 제작",
  },
  {
    key: "고급1",
    label: "바이브코딩 기반 실전 활용 도구 개발",
    guide: "바이브코딩을 이용한 강의자료 제작",
  },
  {
    key: "고급2",
    label: "task 수행 효율화를 위한 AI 에이전트 설계부터 배포까지",
    guide: "AI Agent를 이용해 다양한 강의 보조도구 제작",
  },
];

/** 심사기준 9개 지표 100점. DB(study_rounds.criteria)가 정본, 이 상수는 폴백. */
export const STUDY_CRITERIA_FALLBACK: StudyCriterion[] = [
  { code: "c1_1", no: 1, group: "AI융합원 프로그램 참여 및 이수", label: "AI융합원 프로그램에 참여한 적이 있는가?", max: 10, sort: 1 },
  { code: "c1_2", no: 1, group: "AI융합원 프로그램 참여 및 이수", label: "AI융합원 프로그램을 이수한 적이 있는가?", max: 10, sort: 2 },
  { code: "c2_1", no: 2, group: "연구회의 주제", label: "연구회의 주제와 내용이 AI기반 연구모임의 목적에 부합하는가?", max: 10, sort: 3 },
  { code: "c2_2", no: 2, group: "연구회의 주제", label: "연구회의 주제와 내용이 AX 역량 향상에 기여할 수 있는가?", max: 10, sort: 4 },
  { code: "c4_1", no: 4, group: "AI 플랫폼 활용 계획", label: "AI 플랫폼 활용이 카테고리 수준에 적절한가?", max: 20, sort: 5 },
  { code: "c4_2", no: 4, group: "AI 플랫폼 활용 계획", label: "AI 플랫폼 활용 계획이 구체적인가?", max: 10, sort: 6 },
  { code: "c4_3", no: 4, group: "AI 플랫폼 활용 계획", label: "AI 플랫폼 활용을 위한 구체적인 요청사항이 있는가?", max: 10, sort: 7 },
  { code: "c5_1", no: 5, group: "결과 활용방안", label: "연구회 결과물의 활용 방안이 미래지향적인가?", max: 10, sort: 8 },
  { code: "c5_2", no: 5, group: "결과 활용방안", label: "연구회 결과물의 활용 방안이 구체적인가?", max: 10, sort: 9 },
];

/** 진행방법 택1 (운영계획(안) Ⅲ「연구모임 운영」) */
export const STUDY_PROGRESS_METHODS = [
  { key: "전문가코칭", label: "연구과제 해결을 위한 AI 활용 전문가 코칭에 의한 맞춤형 교육 및 연구" },
  { key: "개별학습", label: "연구모임 단위의 개별 학습 및 연구를 통한 연구과제 해결" },
] as const;

export const STUDY_EDUCATION_MODES = [
  { key: "대면", label: "실시간 대면 교육" },
  { key: "비대면", label: "실시간 비대면 교육" },
] as const;

/** 지원사항 — 교육과정 3단계 (기획 → 제작 → 환류), 각 3시간 */
export const STUDY_WORKSHOP_STEPS = [
  {
    key: "step1",
    order: 1,
    name: "기획",
    hours: 3,
    detail: "연구과제 해결을 위한 기획 및 AI 도구 학습",
    sub: "AI 도구를 이용한 자기주도학습",
  },
  {
    key: "step2",
    order: 2,
    name: "제작",
    hours: 3,
    detail: "강의 도구 및 콘텐츠 제작",
    sub: "실제 MVP 제작 및 문제점 도출",
  },
  {
    key: "step3",
    order: 3,
    name: "환류",
    hours: 3,
    detail: "제작시 발생한 오류 해결 및 배포",
    sub: "※ 시스템 업로드 포함",
  },
] as const;

/** 계획서 5번에서 받는 워크숍 희망일 안(案). 1안/2안 중 택1이 아니라 둘 다 받아 교차집계한다. */
export const STUDY_WORKSHOP_OPTIONS = [
  { key: "option1", label: "1안" },
  { key: "option2", label: "2안" },
] as const;

export const STUDY_SUPPORTS = [
  "AI 활용 전문가 및 교내 우수 교원에 의해 맞춤형 교육 지원",
  "블렌디드 러닝 — 연구모임에 따라 실시간 대면 또는 비대면 교육(선택)",
  "연구과제 해결을 위한 유료계정 지원(팀별 계정으로 지원)",
] as const;

/** 이수혜택 (운영계획(안) Ⅲ「이수혜택」) */
export const STUDY_BENEFIT = "(교원) 교육·연구 학생지도 비용 30만 포인트 지급";

/**
 * 유의사항. 이수혜택 바로 아래에 둔다 — 교원은 포인트를 받지만 학생은 역량점수 가산이
 * 없다는 점을 혜택과 나란히 놓아야 오해가 생기지 않는다.
 */
export const STUDY_CAUTIONS = [
  "(학생) 본 프로그램은 역량점수가 가산되지 않는 순수하게 연구모임 참여자의 역량을 향상시키기 위한 자기주도형 프로그램임.",
] as const;

/** 추진일정 (운영계획(안) Ⅲ「일정」 + Ⅵ「향후 추진 일정」) */
export const STUDY_SCHEDULE = [
  { period: "9. 7.(월)", label: "연구모임 신청 시작" },
  { period: "9. 18.(금)", label: "연구모임 신청 마감" },
  { period: "9. 19.(토) ~ 9. 25.(금)", label: "계획서 심사 및 선발 확정" },
  { period: "9. 28.(월) ~ 11. 11.(금)", label: "연구모임 운영 (1차 기획 · 2차 제작 · 3차 환류)" },
  { period: "11. 11.(금)", label: "결과보고서 제출 마감" },
  { period: "11월", label: "프로그램 결과보고 · 성과공유" },
] as const;

/** 기대효과 (운영계획(안) Ⅴ) */
export const STUDY_EXPECTED_EFFECTS = [
  {
    target: "교원",
    text: "수준별 맞춤형 실습과 전문가 코칭으로 교원의 AI 활용 교수 역량이 향상되고, 강의 설계·운영 부담 경감과 강의 질 개선",
  },
  {
    target: "학생",
    text: "RAG·AI 에이전트 기반 학습 지원 도구가 강의 현장에 적용, 상시 피드백 등 학생 맞춤형 학습 경험과 학습 성과가 제고된다.",
  },
  {
    target: "대학",
    text: "연구모임 산출물을 자료집·동영상으로 축적·공유해 교내 AX 확산 기반을 마련하고, 도내 대학과의 공동 활용으로 글로컬 협력 성과를 확산",
  },
] as const;

/** [붙임] 교육·연구 및 학생지도 비용 지급 지침 — 자율선택지표 (연 80만 포인트 한도) */
export const STUDY_GUIDELINE_INTRO =
  "【교육·연구 및 학생지도 비용 지급 지침 제5조(지급원칙)】 ② 교육·연구 및 학생지도 모든 영역을 이행하여 실적에 따라 비용을 지급하는 일반트랙과 연구 영역을 이행하여 실적에 따라 비용을 지급하는 학술연구트랙으로 구분하고, 이 중 하나를 선택하여 이행한 후 심사위원회의 심사를 통해 실적에 따라 비용을 지급한다.";

export const STUDY_GUIDELINE_ROWS = [
  { item: "외국어 강의 지원비", basis: "지원기준에 따라 지급", amount: "(교양) 1,200,000\n(전공) 900,000", note: "연간한도액 · 학사지원과 별도 산정" },
  { item: "융복합 교과목 개발비", basis: "교육혁신처 지원(공모) 계획에 따름", amount: "800,000", note: "" },
  { item: "공개강좌 개발비", basis: "타 지원금의 지원으로 개발된 강좌 제외", amount: "800,000", note: "" },
  { item: "교양과목 강의 지원비", basis: "최대 2과목(「꿈·미래개척」 등 일부 교과목 제외)", amount: "400,000", note: "" },
  { item: "교수법 이수 및 강의개선보고서 제출", basis: "강의개선보고서 제출 실적", amount: "300,000", note: "교육혁신처 주관(인정) 교수법 프로그램" },
  { item: "교수법 연구모임", basis: "연구모임 운영 및 결과보고서 제출", amount: "300,000", note: "← 본 사업" },
  { item: "강의촬영 및 분석 지원비", basis: "지급받은 적이 없거나 지급 후 4년이 경과한 경우 신청 가능", amount: "400,000", note: "" },
  { item: "교과목 포트폴리오", basis: "매 학기별 2개 교과목 이상 내용을 학생들에게 공개한 실적", amount: "300,000", note: "" },
] as const;

export const STUDY_GUIDELINE_FOOTNOTE =
  "※ 각 영역별 세부 지급기준은 향후 교육부 계획 승인 결과에 따라 달라질 수 있음";

// ---------------------------------------------------------------------------
// [서식 1] 계획서 — 작성요령 · 5개 항목 · 작성 예시(9~10페이지)
// ---------------------------------------------------------------------------

export const STUDY_PLAN_WRITING_RULES = [
  "본문 글자: 굴림, 12포인트 (표 삽입 시 굴림, 11~10포인트)",
  "줄간격 160%, 문단 위/아래 간격 0",
  "불필요한 줄바꿈 지양",
  "연구의 배경, 목적, 내용 및 방법 등에 관하여 1페이지 이상으로 작성",
] as const;

/**
 * 서식은 한글(HWP) 인쇄를 전제한 조판 지침이다. 시스템 입력 단계에서 서체·줄간격을
 * 사용자에게 요구할 수는 없으므로, 분량 기준만 실효 규칙(글자 수)으로 환산한다.
 * 서체·줄간격은 제출본 PDF 출력 시 서버가 적용한다.
 */
export const STUDY_PLAN_MIN_CHARS = 1200;
export const STUDY_REPORT_MIN_CHARS = 3600;

export interface StudyPlanSectionDef {
  key: "section1Topic" | "section2Purpose" | "section3Platform" | "section4Effect" | "section5Etc";
  no: number;
  title: string;
  hint?: string;
  /** 배점 연계 안내 — 신청자가 어디에 힘을 쏟아야 하는지 알고 쓰게 한다. */
  scoreNote: string;
  /** 근거문서 9~10페이지 작성 예시. 입력란에 흐린 placeholder로 심고, DB에는 저장하지 않는다. */
  example: string;
}

export const STUDY_PLAN_SECTIONS: StudyPlanSectionDef[] = [
  {
    key: "section1Topic",
    no: 1,
    title: "연구모임의 주제",
    hint: "선택한 카테고리를 앞에 붙이고, 연구의 배경을 함께 적어 주세요.",
    scoreNote: "심사기준 2번(연구회의 주제) 20점",
    example: `가. [중급] 전공 밀착형 학습 지원 모델 설계 및 다양한 강의법 적용 연구
 ○ 연구의 배경
  - 교수의 강의 관리 부담을 경감하고 학생들에게는 24시간 실시간 피드백을 제공할 수 있는 '강의 전용 AI 챗봇'을 직접 제작`,
  },
  {
    key: "section2Purpose",
    no: 2,
    title: "연구모임의 목적 및 필요성",
    scoreNote: "심사기준 2번 연계",
    example: `가. 교수자 역량 강화 및 강의 질 개선
 ○ 학습공동체 형성을 통한 교수법 혁신
  - 교수자 간 자율적인 연구를 통해 생성형 AI를 활용한 고도화된 교수법 사례를 발굴하고 이를 교내외로 확산
  - 단순 문답형 AI 활용에서 나아가, 강의 계획서, 학습 자료, Q&A 데이터를 학습시킨 RAG 기반 교육 서비스의 정밀도 향상`,
  },
  {
    key: "section3Platform",
    no: 3,
    title: "AI 플랫폼 활용 계획",
    hint: "※ 사용하실 AI 플랫폼과 활용 계획을 작성하시면 맞춤형 강의 개설 예정",
    scoreNote: "심사기준 4번(AI 플랫폼 활용 계획) 40점 — 배점이 가장 큽니다",
    example: `가. RAG 구현을 위한 AI 도구 활용
 ○ 주요 활용 플랫폼
  - Google NotebookLM: 전공 PDF 및 강의 자료를 소스로 등록하여 질문-답변 및 요약 기능을 수업에 적용
  - OpenAI GPTs (Knowledge Retrieval): 강의 계획서 및 참고 문헌 데이터를 업로드하여 해당 교과목 전용 학습 도우미 제작
  - OpenAI GPTs (Knowledge Retrieval) 제작 방법과 원하는 답변을 이끌어 낼 수 있는 프롬프트 작성방법에 대해 알고 싶음.`,
  },
  {
    key: "section4Effect",
    no: 4,
    title: "연구모임의 기대효과 및 결과 활용방안",
    scoreNote: "심사기준 5번(결과 활용방안) 20점",
    example: `가. 대학 교육 브랜드 가치 제고 및 성과 공유
 ○ 기대효과
  - 각 전공 특성에 최적화된 RAG 기반 교수법을 발굴하여 교내 확산의 기틀을 마련
 ○ 결과 활용방안
  - 연구를 통해 도출된 우수 산출물을 동영상 콘텐츠로 제작하여 교내에 확산하고, 공동교육센터와 연계하여 도내 대학에도 배포
  - 결과보고서와 회의록을 바탕으로 방학 기간 중 워크숍을 개최하여 실천적인 AI 교수 모델을 공유`,
  },
  {
    key: "section5Etc",
    no: 5,
    title: "기타 (단계별 워크숍 요청 시기 등)",
    hint: "아래 워크숍 희망일 표를 함께 작성해 주세요. 표에 적은 날짜로 강사 배정을 검토합니다.",
    scoreNote: "심사기준 4번 '구체적인 요청사항' 10점",
    example: `가. 워크숍 개설 요청 일자
 ○ 단계별 워크숍 개설 요청
  - 1안: 1차 기획(9월 29일), 2차 제작(10월 13일), 3차 환류(10월 27일)
  - 2안: 1차 기획(9월 30일), 2차 제작(10월 14일), 3차 환류(10월 28일)`,
  },
];

// ---------------------------------------------------------------------------
// [서식 2] 결과보고서 — 작성요령 · 6개 항목
// ---------------------------------------------------------------------------

export const STUDY_REPORT_WRITING_RULES = [
  "본문 글자: 굴림, 12포인트 (표 삽입 시 굴림, 11~10포인트)",
  "줄 간격 160%, 문단 위/아래 간격 0",
  "불필요한 줄바꿈 지양, 마지막 페이지 1/2 이상 작성",
  "최소 3장(표지 제외) 이상 작성",
  "목적 및 필요성, 연구내용, 연구방법, 연구결과, 연구목표 달성도 및 기여도, 활용방안, 참고문헌 등이 포함되도록 작성",
] as const;

export interface StudyReportSectionDef {
  key:
    | "section1Background"
    | "section2TopicPurpose"
    | "section3Operation"
    | "section4ResultUse"
    | "section5EffectSuggestion";
  no: number;
  title: string;
  hint?: string;
  /** 작성 시 옆에 함께 띄울 참조 자료 */
  reference?: "plan1" | "plan2" | "meetings";
}

export const STUDY_REPORT_SECTIONS: StudyReportSectionDef[] = [
  { key: "section1Background", no: 1, title: "연구모임의 구성 배경" },
  {
    key: "section2TopicPurpose",
    no: 2,
    title: "연구모임의 연구 주제 및 목적",
    hint: "계획서에 적은 주제·목적과 대조해 실제로 무엇이 달라졌는지 함께 적어 주세요.",
    reference: "plan1",
  },
  {
    key: "section3Operation",
    no: 3,
    title: "연구모임의 운영 및 연구 내용",
    hint: "제출한 회의록을 바탕으로 운영 경과를 정리해 주세요.",
    reference: "meetings",
  },
  { key: "section4ResultUse", no: 4, title: "연구모임 결과 및 활용 방안" },
  { key: "section5EffectSuggestion", no: 5, title: "AI 활용 연구모임의 효과 및 제언" },
];

export const STUDY_OUTPUT_NOTICE =
  "※ 결과물의 링크를 결과보고서와 AI융합원에서 안내드린 구글 드라이브에 각각 업로드해주시기 바랍니다.";

/** 제출 확인 모달에 원문 그대로 노출하는 서명 문구 */
export const STUDY_APPLY_SIGNATURE =
  "위와 같이 AI 활용 연구모임 신청서 및 계획서를 제출합니다.";
export const STUDY_REPORT_SIGNATURE =
  "위와 같이 AI 활용 연구모임 결과보고서를 제출합니다.";
export const STUDY_SIGNATURE_ADDRESSEE = "AI융합원장 귀하";

/** 개인정보 수집·이용 동의 (기존 특강 신청 폼과 동일한 구조) */
export const STUDY_CONSENT_ITEMS = [
  "수집 항목: 모임명·주제, 대표자 및 참여자의 성명·소속·직급·직(학)번, 대표자 연락처·이메일",
  "수집 목적: 연구모임 신청 접수, 계획서 심사, 운영 안내, 결과보고 및 이수혜택 지급",
  "보유 기간: 사업 종료 후 5년 또는 관계 법령에 따름",
  "동의를 거부하실 수 있으나, 거부 시 연구모임 신청이 불가합니다.",
] as const;

/** 회의록 진척 기준 — 다과비 산출근거(10,000원 × 5명 × 30회 / 10개팀)에서 역산한 팀당 목표 횟수 */
export const STUDY_MEETING_TARGET_COUNT = 3;

// ----------------------------------------------------------------------------
// AI 윤리교육 게이트 — 신청서 작성 전 필수 이수
// ----------------------------------------------------------------------------

/** GNU 공식 채널 「GNU 생성형 AI 윤리 가이드라인 8대 핵심 원칙」 영상 */
export const STUDY_ETHICS_VIDEO_ID = "XzMC4jGM_P0";
export const STUDY_ETHICS_VIDEO_URL = `https://www.youtube.com/watch?v=${STUDY_ETHICS_VIDEO_ID}`;

/** 8대 원칙 중 실천 다짐을 작성해야 하는 최소 개수 */
export const STUDY_ETHICS_MIN_PLEDGES = 3;

/**
 * GNU 생성형 AI 윤리가이드라인(Version 0, 2025) 8대 윤리 원칙.
 * points는 표의 "주요 내용 행동 기준(요약)" 원문이다.
 */
export const STUDY_ETHICS_PRINCIPLES = [
  {
    no: 1,
    title: "데이터 프라이버시 및 보안 중점",
    points: [
      "생성형 AI 도구 사용에서 데이터 프라이버시와 보안의 최우선 고려",
      "데이터 보호 정책 및 관련 법률 준수, 데이터 저장과 공유 등 관리",
    ],
  },
  {
    no: 2,
    title: "콘텐츠 정확성 및 책임",
    points: [
      "생성형 AI의 결과물에 대한 교육 주체의 검토 및 수정",
      "부정확하거나 허구적인 콘텐츠의 확인 및 정확한 출처와 인용 제시",
    ],
  },
  {
    no: 3,
    title: "민감 데이터 입력 금지",
    points: [
      "공용 AI 도구 활용에서 민감한 정보 입력 유의",
      "교육 주체별 승인된 보안 플랫폼에서 민감 데이터 입력 및 사용",
    ],
  },
  {
    no: 4,
    title: "브레인스토밍에 생성형 AI 활용 권장",
    points: [
      "생성형 AI 도구의 교육 및 학습 유용성 활용",
      "교육 주체별 생성된 결과물에 대한 교육 목적에 따른 검토 수정",
    ],
  },
  {
    no: 5,
    title: "생성형 AI 사용 투명성",
    points: [
      "교육 주체별 생성형 AI 사용 여부의 공지, 관련 자료 및 출처 공개",
      "생성형 AI 활용의 설명을 통한 신뢰 확보",
    ],
  },
  {
    no: 6,
    title: "완전 자율적 사용 금지",
    points: [
      "교육과 학습의 보조 도구로서 생성형 AI 사용",
      "교육 및 학습에서 생성형 AI의 자율성에 대한 교수자의 지도와 감독",
    ],
  },
  {
    no: 7,
    title: "윤리적 및 포용적 사용",
    points: [
      "생성형 AI 활용에서 접근 기회 불평등, 편향과 차별, 저작권 등의 윤리적 문제 검토와 GNU 교육공동체 구성원의 포용성 확보",
    ],
  },
  {
    no: 8,
    title: "도구 관리 및 환류",
    points: [
      "생성형 AI 활용을 위한 관련 부서의 지원 (생성형 AI 추천 도구의 목록화 및 배포 등)",
      "윤리가이드라인 교육, 교수자 지원 및 평가, 환류 등 제도적 개선 노력",
    ],
  },
] as const;
