import { z } from "zod";
import { phoneSchema, emailSchema } from "./validation";
import { STUDY_CATEGORIES, STUDY_OUTPUT_TYPES } from "./studyTypes";

/**
 * AI 활용 연구모임 폼 검증 (트랙 B).
 * 연락처 규칙은 기존 phoneSchema를 그대로 재사용한다 — 저장 형식(010-####-####)이
 * 특강 트랙과 어긋나면 본인확인 매칭이 흔들리기 때문.
 */

export const studyMemberSchema = z.object({
  idNumber: z.string().trim().min(1, "직(학)번을 입력해 주세요.").max(50),
  name: z.string().trim().min(1, "성명을 입력해 주세요.").max(50),
  affiliation: z.string().trim().min(1, "소속을 입력해 주세요.").max(100),
  position: z.string().trim().min(1, "직급을 입력해 주세요.").max(50),
  isLeader: z.boolean().default(false),
});

export type StudyMemberInput = z.infer<typeof studyMemberSchema>;

/** [서식 1] 신청서 — 탭 2 */
export const studyApplySchema = z.object({
  roundId: z.string().uuid("모집회차 정보를 불러오지 못했습니다. 새로고침해 주세요."),
  name: z.string().trim().min(2, "모임명을 2자 이상 입력해 주세요.").max(60),
  topic: z.string().trim().min(2, "연구 주제를 2자 이상 입력해 주세요.").max(120),
  category: z.enum(STUDY_CATEGORIES as [string, ...string[]], {
    errorMap: () => ({ message: "수준별 카테고리를 선택해 주세요." }),
  }),
  leaderName: z.string().trim().min(1, "대표자 성명을 입력해 주세요.").max(50),
  leaderAffiliation: z.string().trim().min(1, "대표자 소속을 입력해 주세요.").max(100),
  leaderPosition: z.string().trim().min(1, "대표자 직급을 입력해 주세요.").max(50),
  leaderIdNumber: z.string().trim().min(1, "대표자 직(학)번을 입력해 주세요.").max(50),
  leaderPhone: phoneSchema,
  leaderEmail: emailSchema,
  hasNontenured: z.boolean().default(false),
  consent: z.literal(true, {
    errorMap: () => ({ message: "개인정보 수집·이용에 동의해 주세요." }),
  }),
});

export type StudyApplyInput = z.infer<typeof studyApplySchema>;

/**
 * 참여자 명단 검증. 인원 상·하한은 회차 설정(min/max_team_size)에서 오므로
 * 스키마에 고정하지 않고 이 함수로 검사한다.
 * 최종 강제는 DB 트리거(check_study_group_submit)가 한다 — 화면 검사는 안내용.
 */
export function validateMembers(
  members: StudyMemberInput[],
  min: number,
  max: number
): string | null {
  if (members.length < min) {
    return `참여자를 ${min}명 이상 등록해 주세요. (현재 ${members.length}명)`;
  }
  if (members.length > max) {
    return `참여자는 최대 ${max}명까지 등록할 수 있습니다. (현재 ${members.length}명)`;
  }

  const idNumbers = members.map((m) => m.idNumber.trim()).filter(Boolean);
  if (new Set(idNumbers).size !== idNumbers.length) {
    return "참여자 직(학)번이 중복되었습니다.";
  }

  for (const [index, member] of members.entries()) {
    const parsed = studyMemberSchema.safeParse(member);
    if (!parsed.success) {
      return `참여자 ${index + 1}행: ${parsed.error.issues[0].message}`;
    }
  }

  return null;
}

/** 참여자 소속의 distinct 개수 ≥ 2 → 복수 학과 가산점 대상 */
export function isMultiDepartment(members: { affiliation: string }[]): boolean {
  const departments = new Set(
    members.map((m) => m.affiliation.trim()).filter((v) => v.length > 0)
  );
  return departments.size >= 2;
}

/** 본인확인(대표자 성명 + 연락처) — 탭 3~6의 게이트 */
export const studyIdentitySchema = z.object({
  leaderName: z.string().trim().min(1, "대표자 성명을 입력해 주세요."),
  leaderPhone: phoneSchema,
});

export type StudyIdentityInput = z.infer<typeof studyIdentitySchema>;

/** [서식 2] 6번 산출물 */
export const studyOutputSchema = z.object({
  title: z.string().trim().min(1, "산출물명을 입력해 주세요.").max(200),
  outputType: z.enum(STUDY_OUTPUT_TYPES as [string, ...string[]], {
    errorMap: () => ({ message: "산출물 유형을 선택해 주세요." }),
  }),
  url: z.string().trim().url("링크는 http(s)로 시작하는 주소여야 합니다."),
  driveUploaded: z.boolean().default(false),
  description: z.string().trim().max(2000).default(""),
});

export type StudyOutputInput = z.infer<typeof studyOutputSchema>;

/** [서식 3] 회의록 */
export const studyMeetingSchema = z.object({
  metAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "모임 일자를 선택해 주세요."),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "시작 시각을 입력해 주세요.").nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "종료 시각을 입력해 주세요.").nullable(),
  location: z.string().trim().max(200).default(""),
  subject: z.string().trim().min(1, "모임 주제를 입력해 주세요.").max(200),
  content: z.string().trim().max(20000).default(""),
  authorName: z.string().trim().max(50).default(""),
});

export type StudyMeetingInput = z.infer<typeof studyMeetingSchema>;

/**
 * 공백을 제외한 글자 수. 서식의 "1페이지 이상"·"최소 3장 이상"을 화면에서 다룰 수 있는
 * 기준으로 환산한 값이며, Edge Function도 같은 방식으로 다시 센다(클라이언트 값을 믿지 않는다).
 */
export function countChars(...sections: string[]): number {
  return sections.reduce((sum, section) => sum + section.replace(/\s/g, "").length, 0);
}
