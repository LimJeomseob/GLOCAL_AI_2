import { z } from "zod";
import { phoneSchema, emailSchema } from "./validation";
import {
  STUDY_CATEGORIES,
  STUDY_EXPERT_STATUSES,
  STUDY_OUTPUT_TYPES,
  type StudyExpertStatus,
} from "./studyTypes";
import {
  WORKSHOP_DATE_PATTERN,
  WORKSHOP_TIME_PATTERN,
  isWorkshopTimeKey,
} from "./workshopPref";

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
 * 관리자 화면의 연구모임 신청서 편집. 공개 신청 스키마와 같은 규칙을 쓰되
 * 동의(consent, 이미 저장된 값)와 회차(roundId, 회차 이동 불가)는 받지 않고,
 * 계획서 단계에서 정하는 진행방법·교육형태를 함께 고친다.
 */
export const studyGroupAdminSchema = studyApplySchema.omit({ consent: true, roundId: true }).extend({
  progressMethod: z.enum(["전문가코칭", "개별학습"]).nullable(),
  educationMode: z.enum(["대면", "비대면"]).nullable(),
});

export type StudyGroupAdminInput = z.infer<typeof studyGroupAdminSchema>;

/**
 * 단계별 워크숍 희망일·시작 시간. `${stepKey}Time` 키는 HH:MM, 나머지는 YYYY-MM-DD로 본다.
 * Edge Function(study-submit)에도 같은 규칙이 복제돼 있다 — 별도 배포물이라 import를 공유할 수 없다.
 */
export const workshopPrefSchema = z
  .record(z.record(z.string()))
  .default({})
  .superRefine((pref, ctx) => {
    for (const [optionKey, option] of Object.entries(pref)) {
      for (const [key, value] of Object.entries(option ?? {})) {
        if (!value) continue;
        const ok = isWorkshopTimeKey(key)
          ? WORKSHOP_TIME_PATTERN.test(value)
          : WORKSHOP_DATE_PATTERN.test(value);
        if (!ok) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [optionKey, key],
            message: isWorkshopTimeKey(key)
              ? "시작 시간을 HH:MM 형식으로 입력해 주세요."
              : "희망일을 날짜로 선택해 주세요.",
          });
        }
      }
    }
  });

/** 관리자 화면의 계획서 편집 — Edge Function planSchema와 같은 한도 */
export const studyPlanAdminSchema = z.object({
  section1Topic: z.string().max(20000, "20,000자 이내로 작성해 주세요.").default(""),
  section2Purpose: z.string().max(20000, "20,000자 이내로 작성해 주세요.").default(""),
  section3Platform: z.string().max(20000, "20,000자 이내로 작성해 주세요.").default(""),
  section4Effect: z.string().max(20000, "20,000자 이내로 작성해 주세요.").default(""),
  section5Etc: z.string().max(20000, "20,000자 이내로 작성해 주세요.").default(""),
  workshopPref: workshopPrefSchema,
});

export type StudyPlanAdminInput = z.infer<typeof studyPlanAdminSchema>;

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

/**
 * 복수 학과 판정용 소속 정규화. DB의 normalize_study_affiliation()(마이그레이션 0023)과
 * 같은 규칙·같은 순서여야 한다 — 어긋나면 신청 폼의 "가산점 대상" 안내와 저장값이 달라진다.
 *   1. 소문자화·앞뒤 공백 제거
 *   2. 대학명 문자열 제거(긴 것부터)
 *   3. 공백 토큰 중 대학교/대학원/대학으로 끝나는 토큰 제거(단과대학·대학원 계층)
 *   4. 남은 공백 전부 제거
 * "경상국립대학교 의류학과" · "의류학과" · "경상국립대 의류학과"가 모두 "의류학과"로 모인다.
 */
export function normalizeAffiliation(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/(국립경상대학교|경상국립대학교|경상국립대|국립경상대|경상대학교|경상대|gnu)/g, "")
    .replace(/\S*(대학교|대학원|대학)(?=\s|$)/g, "")
    .replace(/\s+/g, "");
}

/** 정규화된 참여자 소속의 distinct 개수 ≥ 2 → 복수 학과 가산점 대상 */
export function isMultiDepartment(members: { affiliation: string }[]): boolean {
  const departments = new Set(
    members.map((m) => normalizeAffiliation(m.affiliation)).filter((v) => v.length > 0)
  );
  return departments.size >= 2;
}

/**
 * AI 윤리교육 실천 다짐 1건. 게이트 화면과 Edge Function이 같은 규칙으로 검사한다
 * (3개 이상·원칙 중복 금지는 배열 단위라 각각의 호출부에서 검사).
 */
export const studyEthicsPledgeSchema = z.object({
  no: z.number().int().min(1).max(8),
  title: z.string().trim().min(1).max(100),
  pledge: z
    .string()
    .trim()
    .min(10, "실천 다짐을 10자 이상 작성해 주세요.")
    .max(1000, "실천 다짐은 1,000자 이내로 작성해 주세요."),
});

export type StudyEthicsPledge = z.infer<typeof studyEthicsPledgeSchema>;

/**
 * 교내 AI활용 전문가 신청 — 탭 7. Edge Function(expertApplySchema)과 같은 규칙.
 * 카테고리 중복 금지는 화면이 체크박스라 생길 수 없어 서버에서만 검사한다.
 */
export const studyExpertApplySchema = z.object({
  roundId: z.string().uuid("모집회차 정보를 불러오지 못했습니다. 새로고침해 주세요."),
  name: z.string().trim().min(1, "성명을 입력해 주세요.").max(50),
  affiliation: z.string().trim().min(1, "소속을 입력해 주세요.").max(100),
  position: z.string().trim().min(1, "직급을 입력해 주세요.").max(50),
  idNumber: z.string().trim().min(1, "직번을 입력해 주세요.").max(50),
  phone: phoneSchema,
  email: emailSchema,
  categories: z
    .array(z.enum(STUDY_CATEGORIES as [string, ...string[]]))
    .min(1, "지도 가능 카테고리를 1개 이상 선택해 주세요.")
    .max(4),
  aiTools: z.string().trim().max(1000, "주요 활용 AI 도구는 1,000자 이내로 작성해 주세요.").default(""),
  availabilityConfirmed: z.literal(true, {
    errorMap: () => ({ message: "운영기간 중 3회 코칭 참여 가능 여부를 확인해 주세요." }),
  }),
  consent: z.literal(true, {
    errorMap: () => ({ message: "개인정보 수집·이용에 동의해 주세요." }),
  }),
});

export type StudyExpertApplyInput = z.infer<typeof studyExpertApplySchema>;

/**
 * 관리자 화면의 전문가 신청 등록·편집. 공개 신청 규칙을 상속하되 확인·동의 체크는 받지 않고
 * (신규 등록은 화면에서 오프라인 확인 체크박스로 갈음, DB CHECK 때문에 true로 저장),
 * 관리자만 다루는 교원 구분·경험·상태·메모를 더한다. 교원 구분과 경험은 공개 폼에서 빠진
 * 레거시 항목이지만 관리자 표·엑셀이 여전히 표시하므로 관리자는 고칠 수 있게 둔다.
 */
export const studyExpertAdminSchema = studyExpertApplySchema
  .omit({ availabilityConfirmed: true, consent: true })
  .extend({
    isNontenured: z.boolean().default(false),
    experience: z.string().trim().max(4000, "경험은 4,000자 이내로 작성해 주세요.").default(""),
    status: z.enum(STUDY_EXPERT_STATUSES as [StudyExpertStatus, ...StudyExpertStatus[]]),
    note: z.string().trim().max(2000, "메모는 2,000자 이내로 작성해 주세요.").default(""),
  });

export type StudyExpertAdminInput = z.infer<typeof studyExpertAdminSchema>;

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
