/**
 * AI 활용 연구모임(트랙 B) 타입 정의.
 * 기존 특강 트랙의 타입(types.ts)과 섞지 않기 위해 파일을 분리한다.
 * 근거: docs/연구모임_신청시스템_재구성_전략.md §Ⅴ 데이터 모델
 */

export type StudyCategory = "초급" | "중급" | "고급1" | "고급2";

export const STUDY_CATEGORIES: StudyCategory[] = ["초급", "중급", "고급1", "고급2"];

/**
 * 상태 전이:
 * draft → submitted → under_review → selected / rejected
 *                                      └→ in_progress → report_submitted → completed
 */
export type StudyGroupStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "selected"
  | "rejected"
  | "in_progress"
  | "report_submitted"
  | "completed"
  | "cancelled";

export const STUDY_GROUP_STATUSES: StudyGroupStatus[] = [
  "draft",
  "submitted",
  "under_review",
  "selected",
  "rejected",
  "in_progress",
  "report_submitted",
  "completed",
  "cancelled",
];

/** 화면 표기용 한글 라벨(단일 출처) */
export const STUDY_STATUS_LABELS: Record<StudyGroupStatus, string> = {
  draft: "임시저장",
  submitted: "제출완료",
  under_review: "심사중",
  selected: "선발",
  rejected: "미선발",
  in_progress: "운영중",
  report_submitted: "결과보고 제출",
  completed: "이수완료",
  cancelled: "취소",
};

export function isStudyGroupStatus(value: string): value is StudyGroupStatus {
  return (STUDY_GROUP_STATUSES as string[]).includes(value);
}

export type StudyProgressMethod = "전문가코칭" | "개별학습";
export type StudyEducationMode = "대면" | "비대면";

export type StudyOutputType =
  | "GPTs"
  | "RAG 챗봇"
  | "웹도구"
  | "AI 에이전트"
  | "강의자료"
  | "영상"
  | "기타";

export const STUDY_OUTPUT_TYPES: StudyOutputType[] = [
  "GPTs",
  "RAG 챗봇",
  "웹도구",
  "AI 에이전트",
  "강의자료",
  "영상",
  "기타",
];

/** study_rounds.categories 원소 */
export interface StudyCategoryDef {
  key: StudyCategory;
  label: string;
  /** [서식 1] 작성방법 2항의 수준별 주제 선택 가이드 */
  guide: string;
}

/**
 * study_rounds.criteria 원소.
 * 근거문서의 연번(no)이 1·2·4·5로 3번이 결번이므로, 표시 연번과 정렬 순서(sort)를 분리해
 * 원문 연번을 그대로 보존한다.
 */
export interface StudyCriterion {
  code: string;
  no: number;
  group: string;
  label: string;
  max: number;
  sort: number;
}

/** study_rounds — 모집회차 메타 */
export interface StudyRound {
  id: string;
  year: number;
  semester: string;
  title: string;
  research_topic: string;
  apply_open_at: string;
  apply_close_at: string;
  review_close_at: string;
  period_start: string;
  period_end: string;
  report_due_at: string;
  max_teams: number;
  max_members_total: number;
  min_team_size: number;
  max_team_size: number;
  categories: StudyCategoryDef[];
  criteria: StudyCriterion[];
  notes: string;
  is_active: boolean;
}

/** study_groups.ethics_pledges 원소 — GNU 생성형 AI 윤리 8대 핵심원칙 실천 다짐 */
export interface StudyEthicsPledgeRecord {
  no: number;
  title: string;
  pledge: string;
}

export interface StudyGroupMember {
  id: string;
  group_id: string;
  id_number: string;
  name: string;
  affiliation: string;
  position: string;
  is_leader: boolean;
  sort_order: number;
}

export interface StudyGroup {
  id: string;
  round_id: string;
  code: string;
  name: string;
  topic: string;
  category: StudyCategory;
  leader_name: string;
  leader_affiliation: string;
  leader_position: string;
  leader_id_number: string;
  leader_phone: string;
  leader_email: string;
  period_start: string;
  period_end: string;
  member_count: number;
  is_multi_dept: boolean;
  has_nontenured: boolean;
  /** 윤리교육 게이트에서 작성한 8대 핵심원칙 실천 다짐. 도입 전 신청 건은 빈 배열 */
  ethics_pledges: StudyEthicsPledgeRecord[];
  progress_method: StudyProgressMethod | null;
  education_mode: StudyEducationMode | null;
  status: StudyGroupStatus;
  total_score: number | null;
  rank: number | null;
  created_by_admin: boolean;
  created_at: string;
  submitted_at: string | null;
}

/**
 * 계획서 5번의 구조화 부분.
 * { option1: { step1: "2026-09-29", step2: "...", step3: "..." }, option2: {...} }
 */
export type WorkshopPreference = Record<string, Record<string, string>>;

export interface StudyGroupPlan {
  id: string;
  group_id: string;
  section1_topic: string;
  section2_purpose: string;
  section3_platform: string;
  section4_effect: string;
  section5_etc: string;
  workshop_pref: WorkshopPreference;
  char_count: number;
  submitted_at: string | null;
}

export interface StudyReview {
  id: string;
  group_id: string;
  reviewer_email: string;
  scores: Record<string, number>;
  total: number;
  comment: string;
  submitted_at: string | null;
}

export interface StudyMeeting {
  id: string;
  group_id: string;
  met_at: string;
  start_time: string | null;
  end_time: string | null;
  location: string;
  subject: string;
  content: string;
  author_name: string;
}

export interface StudyReport {
  id: string;
  group_id: string;
  actual_period_start: string | null;
  actual_period_end: string | null;
  section1_background: string;
  section2_topic_purpose: string;
  section3_operation: string;
  section4_result_use: string;
  section5_effect_suggestion: string;
  char_count: number;
  submitted_at: string | null;
  reviewed_at: string | null;
}

export interface StudyOutput {
  id: string;
  group_id: string;
  title: string;
  output_type: StudyOutputType;
  url: string;
  drive_uploaded: boolean;
  description: string;
  sort_order: number;
}

/**
 * study_prior_participations — 심사기준 1번의 수기 등록 대장.
 * 행의 존재 자체가 '참여'이고 `completed`가 true면 '이수'까지 인정된다.
 */
export interface StudyPriorParticipation {
  id: string;
  name: string;
  id_number: string;
  phone: string;
  program_name: string;
  program_year: number | null;
  completed: boolean;
  note: string;
  created_by: string;
  created_at: string;
}

/** 관리자 목록 화면용 조인 결과 */
export interface StudyGroupWithRelations extends StudyGroup {
  members: StudyGroupMember[];
  plan: StudyGroupPlan | null;
  report: StudyReport | null;
  /** 목록 화면은 건수·일자만 쓰므로 본문(content)까지 실어 오지 않는다. */
  meetings: Pick<StudyMeeting, "id" | "group_id" | "met_at" | "subject">[];
  outputs: StudyOutput[];
}

// ---------------------------------------------------------------------------
// Edge Function 응답 shape (study-lookup / study-submit과 동일하게 유지)
// ---------------------------------------------------------------------------

export interface StudyLookupMember {
  id: string;
  idNumber: string;
  name: string;
  affiliation: string;
  position: string;
  isLeader: boolean;
  sortOrder: number;
}

export interface StudyLookupPlan {
  section1Topic: string;
  section2Purpose: string;
  section3Platform: string;
  section4Effect: string;
  section5Etc: string;
  workshopPref: WorkshopPreference;
  charCount: number;
  submittedAt: string | null;
}

export interface StudyLookupMeeting {
  id: string;
  metAt: string;
  startTime: string | null;
  endTime: string | null;
  location: string;
  subject: string;
  content: string;
  authorName: string;
}

export interface StudyLookupReport {
  actualPeriodStart: string | null;
  actualPeriodEnd: string | null;
  section1Background: string;
  section2TopicPurpose: string;
  section3Operation: string;
  section4ResultUse: string;
  section5EffectSuggestion: string;
  charCount: number;
  submittedAt: string | null;
}

export interface StudyLookupOutput {
  id: string;
  title: string;
  outputType: StudyOutputType;
  url: string;
  driveUploaded: boolean;
  description: string;
  sortOrder: number;
}

export interface StudyLookupRound {
  id: string;
  year: number;
  semester: string;
  title: string;
  researchTopic: string;
  applyOpenAt: string;
  applyCloseAt: string;
  reviewCloseAt: string;
  periodStart: string;
  periodEnd: string;
  reportDueAt: string;
  maxTeams: number;
  minTeamSize: number;
  maxTeamSize: number;
  categories: StudyCategoryDef[];
  criteria: StudyCriterion[];
}

/** POST supabase.functions.invoke("study-lookup") 응답의 각 항목 */
export interface StudyLookupResult {
  groupId: string;
  code: string;
  name: string;
  topic: string;
  category: StudyCategory;
  status: StudyGroupStatus;
  leaderName: string;
  leaderAffiliation: string;
  leaderPosition: string;
  leaderIdNumber: string;
  leaderEmail: string;
  periodStart: string;
  periodEnd: string;
  memberCount: number;
  isMultiDept: boolean;
  hasNontenured: boolean;
  progressMethod: StudyProgressMethod | null;
  educationMode: StudyEducationMode | null;
  /** 심사 확정 전에는 null — 심사 중 점수를 신청자에게 노출하지 않는다. */
  totalScore: number | null;
  rank: number | null;
  submittedAt: string | null;
  createdAt: string;
  members: StudyLookupMember[];
  plan: StudyLookupPlan | null;
  meetings: StudyLookupMeeting[];
  report: StudyLookupReport | null;
  outputs: StudyLookupOutput[];
  round: StudyLookupRound | null;
}

/** 본인확인에 사용하는 대표자 신원(세션 동안만 메모리/sessionStorage에 보관) */
export interface StudyIdentity {
  leaderName: string;
  leaderPhone: string;
}
