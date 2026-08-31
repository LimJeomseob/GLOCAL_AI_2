"use client";

import { createSupabaseBrowserClient } from "./supabase/client";
import { extractFunctionError } from "./functionError";
import { TABLES } from "./db-tables";
import type {
  StudyGroupStatus,
  StudyIdentity,
  StudyLookupResult,
  StudyRound,
} from "./studyTypes";

/**
 * 연구모임 데이터 접근 계층.
 *
 * study_* 테이블은 study_rounds(공개 메타)를 제외하면 RLS로 전부 닫혀 있으므로,
 * 신청자 경로의 읽기·쓰기는 모두 Edge Function(study-lookup / study-submit)을 거친다.
 */

/** 진행 중인 모집회차 1건. 신청기간·카테고리·심사기준의 정본은 DB다. */
export async function fetchActiveStudyRound(): Promise<StudyRound | null> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from(TABLES.STUDY_ROUNDS)
    .select("*")
    .eq("is_active", true)
    .order("year", { ascending: false })
    .order("semester", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as StudyRound | null) ?? null;
}

export interface StudyRoundStats {
  submittedCount: number;
  selectedCount: number;
  remainingSlots: number;
}

/** 접수 현황(집계값만). study_groups 원본은 RLS로 막혀 있어 RPC로만 노출된다. */
export async function fetchStudyRoundStats(roundId: string): Promise<StudyRoundStats> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_study_round_stats", { p_round_id: roundId });

  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    return { submittedCount: 0, selectedCount: 0, remainingSlots: 0 };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    submittedCount: Number(row.submitted_count ?? 0),
    selectedCount: Number(row.selected_count ?? 0),
    remainingSlots: Number(row.remaining_slots ?? 0),
  };
}

export interface StudyRoundWindow {
  isNotYetOpen: boolean;
  isClosed: boolean;
  isOpen: boolean;
}

/**
 * 신청 구간 판정(표시용). 실제 허용 여부는 DB 트리거가 서버 시각으로 다시 판정하므로,
 * 클라이언트 시계가 틀어져 있어도 잘못된 접수가 통과하지는 않는다.
 */
export function deriveStudyRoundWindow(
  round: Pick<StudyRound, "apply_open_at" | "apply_close_at">,
  now: Date = new Date()
): StudyRoundWindow {
  const t = now.getTime();
  const isNotYetOpen = t < new Date(round.apply_open_at).getTime();
  const isClosed = t > new Date(round.apply_close_at).getTime();
  return { isNotYetOpen, isClosed, isOpen: !isNotYetOpen && !isClosed };
}

// ---------------------------------------------------------------------------
// Edge Function 호출
// ---------------------------------------------------------------------------

export interface StudyApiResult<T> {
  data: T | null;
  error: string | null;
}

/** 대표자 성명+연락처로 팀을 조회한다. 불일치는 에러가 아니라 빈 배열이다. */
export async function lookupStudyGroups(
  identity: StudyIdentity
): Promise<StudyApiResult<StudyLookupResult[]>> {
  const supabase = createSupabaseBrowserClient();
  try {
    const { data, error } = await supabase.functions.invoke("study-lookup", { body: identity });

    if (error) {
      return { data: null, error: await extractFunctionError(error, "조회 중 오류가 발생했습니다.") };
    }
    if (!data || !Array.isArray(data.results)) {
      return { data: null, error: "응답을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요." };
    }
    return { data: data.results as StudyLookupResult[], error: null };
  } catch {
    return { data: null, error: "네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
  }
}

/** study-submit 호출 공통 래퍼. payload의 kind가 처리 분기를 결정한다. */
export async function submitStudy<T = Record<string, unknown>>(
  payload: Record<string, unknown>,
  fallbackMessage = "저장 중 오류가 발생했습니다."
): Promise<StudyApiResult<T>> {
  const supabase = createSupabaseBrowserClient();
  try {
    const { data, error } = await supabase.functions.invoke("study-submit", { body: payload });

    if (error) {
      return { data: null, error: await extractFunctionError(error, fallbackMessage) };
    }
    if (!data?.ok) {
      return { data: null, error: "응답을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요." };
    }
    return { data: data as T, error: null };
  } catch {
    return { data: null, error: "네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
  }
}

// ---------------------------------------------------------------------------
// 본인확인 신원 보관
//
// 탭 2에서 신청한 사람이 탭 3으로 넘어갈 때 성명·연락처를 다시 입력하게 하면
// 이탈이 생긴다. 브라우저 탭이 살아 있는 동안만 신원을 들고 있다가 각 탭의 게이트에
// 채워 넣는다. 개인정보이므로 sessionStorage(탭 종료 시 소멸)를 쓰고 localStorage는 쓰지 않는다.
// ---------------------------------------------------------------------------

const IDENTITY_KEY = "gnu.study.identity";

export function readStudyIdentity(): StudyIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StudyIdentity;
    if (!parsed?.leaderName || !parsed?.leaderPhone) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStudyIdentity(identity: StudyIdentity): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // 프라이빗 모드 등에서 저장이 막혀도 본인확인을 다시 입력하면 되므로 무시한다.
  }
}

export function clearStudyIdentity(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(IDENTITY_KEY);
  } catch {
    // 무시
  }
}

// ---------------------------------------------------------------------------
// 진행 상태 → 다음 할 일
// ---------------------------------------------------------------------------

export interface StudyNextStep {
  label: string;
  description: string;
  href: string | null;
}

/** '내 연구모임' 탭의 CTA. 상태마다 팀이 지금 해야 할 일 하나만 제시한다. */
export function deriveNextStep(result: StudyLookupResult): StudyNextStep {
  switch (result.status) {
    case "draft":
      return {
        label: "연구계획서 작성하기",
        description: "신청서는 저장되었습니다. 계획서를 작성해 제출해야 접수가 완료됩니다.",
        href: "/plan",
      };
    case "submitted":
    case "under_review":
      return {
        label: "심사 결과를 기다리는 중",
        description: "제출이 완료되었습니다. 심사 결과는 대표자 이메일과 이 화면으로 안내됩니다.",
        href: null,
      };
    case "selected":
      return {
        label: "회의록 등록하기",
        description: "선발되었습니다. 연구모임을 운영하며 회의록을 등록해 주세요.",
        href: "/meetings",
      };
    case "in_progress":
      return {
        label: "회의록 등록하기",
        description: "운영 중입니다. 회의록을 채우고 기간 내에 결과보고서를 제출해 주세요.",
        href: "/meetings",
      };
    case "report_submitted":
      return {
        label: "검토 결과를 기다리는 중",
        description: "결과보고서가 제출되었습니다. AI융합원 검토 후 이수가 확정됩니다.",
        href: null,
      };
    case "completed":
      return {
        label: "이수 완료",
        description: "모든 절차가 완료되었습니다. 이수혜택은 별도 안내에 따라 지급됩니다.",
        href: null,
      };
    case "rejected":
      return {
        label: "미선발",
        description: "아쉽게도 이번 회차에는 선발되지 않았습니다. 다음 모집을 기다려 주세요.",
        href: null,
      };
    case "cancelled":
      return { label: "취소됨", description: "취소된 신청입니다.", href: null };
    default:
      return { label: "-", description: "", href: null };
  }
}

/** 운영 산출물(회의록·결과보고서) 제출이 열려 있는 상태 — 서버(study-submit)와 동일 기준 */
export const STUDY_OPERATION_STATUSES: StudyGroupStatus[] = ["selected", "in_progress"];

export function canSubmitOperationDocs(status: StudyGroupStatus): boolean {
  return STUDY_OPERATION_STATUSES.includes(status);
}
