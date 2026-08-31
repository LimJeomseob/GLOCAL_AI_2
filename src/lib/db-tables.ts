/**
 * Supabase 테이블 이름 상수. 만족도 응답 테이블은 PRD §6.3 요구사항에 따라
 * 실제 물리 테이블명을 "LAWdata"로 사용한다(PRD §7.3의 survey_responses와 동일 테이블).
 */
export const TABLES = {
  WORKSHOPS: "workshops",
  APPLICATIONS: "applications",
  SURVEY: "LAWdata",
  CERTIFICATES: "certificates",
  CERTIFICATE_TEMPLATES: "certificate_templates",
  ADMIN_USERS: "admin_users",

  // AI 활용 연구모임(트랙 B) — 기존 테이블은 건드리지 않고 study_ 접두어로 네임스페이스를 분리한다.
  STUDY_ROUNDS: "study_rounds",
  STUDY_GROUPS: "study_groups",
  STUDY_GROUP_MEMBERS: "study_group_members",
  STUDY_GROUP_PLANS: "study_group_plans",
  STUDY_REVIEWS: "study_reviews",
  STUDY_MEETINGS: "study_meetings",
  STUDY_REPORTS: "study_reports",
  STUDY_OUTPUTS: "study_outputs",
  STUDY_NOTIFICATIONS: "study_notifications",
} as const;

export const CERTIFICATES_BUCKET = "certificates";
export const STUDY_ATTACHMENTS_BUCKET = "study-attachments";
