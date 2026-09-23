import { STUDY_WORKSHOP_OPTIONS, STUDY_WORKSHOP_STEPS } from "@/lib/studyGroupConstants";
import type { WorkshopPreference } from "@/lib/studyTypes";

/**
 * 계획서 5번 「단계별 워크숍 희망일·시작 시간」의 값 읽기·쓰기 헬퍼.
 *
 * workshop_pref(jsonb)는 { option1: { step1: "2026-09-28", step1Time: "14:00", ... } } 형태로,
 * 날짜와 시작 시간을 같은 option 객체 안에 둔다. 시간 키를 `${stepKey}Time`으로 파생시켜
 * 컬럼 타입(Record<string, Record<string, string>>)을 그대로 쓰므로 DB 마이그레이션이 필요 없고,
 * 시간 키가 없는 기존 행도 "시간 미입력"으로 그대로 읽힌다.
 *
 * 키 문자열을 만드는 곳은 이 파일 하나다 — 화면·PDF·교차집계가 모두 여기를 거친다.
 */

const TIME_SUFFIX = "Time";

/** 시작 시간 입력 형식. Edge Function(study-submit)의 회의록 시각 검사와 같은 규칙. */
export const WORKSHOP_TIME_PATTERN = /^\d{2}:\d{2}$/;

/** 희망일 입력 형식(YYYY-MM-DD). */
export const WORKSHOP_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function workshopTimeKey(stepKey: string): string {
  return `${stepKey}${TIME_SUFFIX}`;
}

export function isWorkshopTimeKey(key: string): boolean {
  return key.endsWith(TIME_SUFFIX);
}

export interface WorkshopSlot {
  /** YYYY-MM-DD, 미입력이면 "" */
  date: string;
  /** HH:MM, 미입력이면 "" */
  time: string;
}

export function getWorkshopSlot(
  pref: WorkshopPreference | null | undefined,
  optionKey: string,
  stepKey: string
): WorkshopSlot {
  const option = pref?.[optionKey];
  return {
    date: option?.[stepKey] ?? "",
    time: option?.[workshopTimeKey(stepKey)] ?? "",
  };
}

/** 한 칸(안 × 단계)의 날짜 또는 시간을 바꾼 새 pref를 돌려준다(불변). */
export function setWorkshopSlot(
  pref: WorkshopPreference,
  optionKey: string,
  stepKey: string,
  patch: Partial<WorkshopSlot>
): WorkshopPreference {
  const option = { ...(pref[optionKey] ?? {}) };
  if (patch.date !== undefined) option[stepKey] = patch.date;
  if (patch.time !== undefined) option[workshopTimeKey(stepKey)] = patch.time;
  return { ...pref, [optionKey]: option };
}

/** "14:00" + 3시간 → "17:00". 형식이 어긋나면 null. */
export function workshopEndTime(time: string, hours: number): string | null {
  if (!WORKSHOP_TIME_PATTERN.test(time)) return null;
  const [h, m] = time.split(":").map(Number);
  if (h > 23 || m > 59) return null;
  const total = h * 60 + m + hours * 60;
  // 자정을 넘기면 시간 표기가 오해를 부르므로 시작 시각만 쓴다.
  if (total >= 24 * 60) return null;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** "14:00" + 3시간 → "14:00~17:00". 시간이 없으면 "". */
export function formatWorkshopTimeRange(time: string, hours: number): string {
  if (!WORKSHOP_TIME_PATTERN.test(time)) return "";
  const end = workshopEndTime(time, hours);
  return end ? `${time}~${end}` : time;
}

/** 표시용 한 칸 표기: "2026년 9월 28일 (월) 14:00~17:00". formatDate는 호출부에서 주입한다. */
export function formatWorkshopSlot(
  slot: WorkshopSlot,
  hours: number,
  formatDate: (iso: string) => string,
  emptyDate = "–"
): string {
  if (!slot.date) return emptyDate;
  const date = WORKSHOP_DATE_PATTERN.test(slot.date) ? formatDate(slot.date) : slot.date;
  const range = formatWorkshopTimeRange(slot.time, hours);
  return range ? `${date} ${range}` : date;
}

/**
 * 날짜는 적혀 있는데 시작 시간이 빈 칸이 하나라도 있는지.
 * 시간 입력을 도입하기 전에 제출한 계획서를 찾아 대표자에게 시간 추가를 안내하는 데 쓴다.
 */
export function hasMissingWorkshopTime(pref: WorkshopPreference | null | undefined): boolean {
  if (!pref) return false;
  return STUDY_WORKSHOP_OPTIONS.some((option) =>
    STUDY_WORKSHOP_STEPS.some((step) => {
      const slot = getWorkshopSlot(pref, option.key, step.key);
      return Boolean(slot.date) && !slot.time;
    })
  );
}

/** 희망일이 한 칸이라도 적혀 있는지(빈 표를 감추는 데 쓴다). */
export function hasAnyWorkshopDate(pref: WorkshopPreference | null | undefined): boolean {
  if (!pref) return false;
  return STUDY_WORKSHOP_OPTIONS.some((option) =>
    STUDY_WORKSHOP_STEPS.some((step) => Boolean(getWorkshopSlot(pref, option.key, step.key).date))
  );
}
