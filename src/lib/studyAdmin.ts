"use client";

import { createSupabaseBrowserClient } from "./supabase/client";
import { TABLES } from "./db-tables";
import type {
  StudyGroup,
  StudyGroupMember,
  StudyGroupPlan,
  StudyGroupWithRelations,
  StudyMeeting,
  StudyOutput,
  StudyReport,
  StudyPriorParticipation,
  StudyReview,
  StudyRound,
} from "./studyTypes";

/**
 * 관리자·심사위원 화면의 데이터 접근.
 * 이 경로는 로그인한 세션의 JWT로 직접 테이블을 읽으므로, 무엇이 보이는지는
 * 전적으로 RLS가 결정한다(관리자: 전체 / 심사위원: 계획서 읽기 + 자기 채점).
 */

export async function fetchStudyRounds(): Promise<StudyRound[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from(TABLES.STUDY_ROUNDS)
    .select("*")
    .order("year", { ascending: false })
    .order("semester", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as StudyRound[];
}

/**
 * 회차의 모든 연구모임 + 자식 레코드.
 * PostgREST 중첩 임베드 대신 테이블별로 병렬 조회 후 조립한다 — 임베드는 행이 많아지면
 * 응답이 급격히 커지고, to-one/​to-many 정규화 처리가 화면마다 반복되기 때문.
 */
export async function fetchStudyGroups(roundId: string): Promise<StudyGroupWithRelations[]> {
  const supabase = createSupabaseBrowserClient();

  const { data: groups, error } = await supabase
    .from(TABLES.STUDY_GROUPS)
    .select("*")
    .eq("round_id", roundId)
    .order("code");

  if (error) throw new Error(error.message);
  const rows = (groups ?? []) as StudyGroup[];
  if (rows.length === 0) return [];

  const ids = rows.map((g) => g.id);

  const [members, plans, reports, meetings, outputs] = await Promise.all([
    supabase.from(TABLES.STUDY_GROUP_MEMBERS).select("*").in("group_id", ids).order("sort_order"),
    supabase.from(TABLES.STUDY_GROUP_PLANS).select("*").in("group_id", ids),
    supabase.from(TABLES.STUDY_REPORTS).select("*").in("group_id", ids),
    supabase
      .from(TABLES.STUDY_MEETINGS)
      .select("id, group_id, met_at, subject")
      .in("group_id", ids)
      .order("met_at", { ascending: false }),
    supabase.from(TABLES.STUDY_OUTPUTS).select("*").in("group_id", ids).order("sort_order"),
  ]);

  const group = <T extends { group_id: string }>(list: T[] | null) => {
    const map = new Map<string, T[]>();
    for (const row of list ?? []) {
      const bucket = map.get(row.group_id) ?? [];
      bucket.push(row);
      map.set(row.group_id, bucket);
    }
    return map;
  };

  const membersBy = group(members.data as StudyGroupMember[] | null);
  const plansBy = group(plans.data as StudyGroupPlan[] | null);
  const reportsBy = group(reports.data as StudyReport[] | null);
  const meetingsBy = group(meetings.data as StudyGroupWithRelations["meetings"] | null);
  const outputsBy = group(outputs.data as StudyOutput[] | null);

  return rows.map((g) => ({
    ...g,
    members: membersBy.get(g.id) ?? [],
    plan: plansBy.get(g.id)?.[0] ?? null,
    report: reportsBy.get(g.id)?.[0] ?? null,
    meetings: meetingsBy.get(g.id) ?? [],
    outputs: outputsBy.get(g.id) ?? [],
  }));
}

/**
 * 회의록 본문 조회.
 * fetchStudyGroups()는 목록 화면이 쓰는 건수·일자만 실어 오므로(본문까지 넣으면 회차 전체가
 * 매번 따라온다), 열람 모달을 열 때 해당 팀 것만 따로 가져온다.
 * 목록의 최신순과 달리 읽을 때는 1차→3차 시간순이 자연스러워 오름차순으로 정렬한다.
 */
export async function fetchStudyMeetings(groupId: string): Promise<StudyMeeting[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from(TABLES.STUDY_MEETINGS)
    .select("*")
    .eq("group_id", groupId)
    .order("met_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as StudyMeeting[];
}

/** 심사 목록. 심사위원은 RLS에 의해 자기 행만 돌아온다. */
export async function fetchStudyReviews(groupIds: string[]): Promise<StudyReview[]> {
  if (groupIds.length === 0) return [];
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from(TABLES.STUDY_REVIEWS)
    .select("*")
    .in("group_id", groupIds);

  if (error) throw new Error(error.message);
  return (data ?? []) as StudyReview[];
}

export interface SaveReviewInput {
  groupId: string;
  reviewerEmail: string;
  scores: Record<string, number>;
  comment: string;
  submit: boolean;
}

/**
 * 채점 저장. total은 DB 트리거(compute_study_review_total)가 criteria와 대조해 계산하므로
 * 클라이언트에서 보내지 않는다 — 배점 상한을 화면에서만 막으면 우회할 수 있기 때문.
 */
export async function saveStudyReview(input: SaveReviewInput): Promise<string | null> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from(TABLES.STUDY_REVIEWS).upsert(
    {
      group_id: input.groupId,
      reviewer_email: input.reviewerEmail,
      scores: input.scores,
      comment: input.comment,
      submitted_at: input.submit ? new Date().toISOString() : null,
    },
    { onConflict: "group_id,reviewer_email" }
  );

  return error ? error.message : null;
}

export interface FinalizeRow {
  group_id: string;
  code: string;
  avg_total: number;
  final_rank: number;
  final_status: string;
}

/** 심사 집계 및 선발 확정. 3인 평균 → 순위 → 상위 max_teams를 selected로 전환한다. */
export async function finalizeStudyReview(roundId: string): Promise<{
  rows: FinalizeRow[];
  error: string | null;
}> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("finalize_study_review", { p_round_id: roundId });

  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as FinalizeRow[], error: null };
}

export interface PriorParticipation {
  applied_count: number;
  completed_count: number;
  programs: string[];
}

/**
 * 심사기준 1번 자동 채점 보조 — 기존 특강 신청 이력(applications)에서 참여·이수 건수를 찾는다.
 * 반환값은 "근거"이지 점수가 아니다. 최종 점수는 심사위원이 직접 입력한다.
 */
export async function fetchPriorParticipation(
  name: string,
  idNumber: string,
  phone: string
): Promise<PriorParticipation | null> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("match_prior_participation", {
    p_name: name,
    p_id_number: idNumber,
    p_phone: phone,
  });

  if (error || !data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    applied_count: Number(row.applied_count ?? 0),
    completed_count: Number(row.completed_count ?? 0),
    programs: (row.programs ?? []) as string[],
  };
}

/** 관리자 상태 변경(선발 확정 후 개별 조정, 이수 확정 등) */
export async function updateStudyGroupStatus(
  groupId: string,
  status: string
): Promise<string | null> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase
    .from(TABLES.STUDY_GROUPS)
    .update({ status })
    .eq("id", groupId);

  return error ? error.message : null;
}

/**
 * 계획서 5번의 워크숍 희망일 교차집계.
 * 팀별 희망일을 (단계 × 날짜)로 모아 강사 배정안을 바로 뽑을 수 있게 한다.
 * 이 집계가 없으면 담당자가 10개 팀 계획서를 다시 읽어 손으로 취합해야 한다.
 */
export interface WorkshopDemandCell {
  stepKey: string;
  date: string;
  groups: string[];
}

export function aggregateWorkshopDemand(
  groups: Pick<StudyGroupWithRelations, "code" | "plan">[]
): WorkshopDemandCell[] {
  const map = new Map<string, WorkshopDemandCell>();

  for (const group of groups) {
    const pref = group.plan?.workshop_pref;
    if (!pref) continue;

    for (const option of Object.values(pref)) {
      for (const [stepKey, date] of Object.entries(option ?? {})) {
        if (!date) continue;
        const key = `${stepKey}|${date}`;
        const cell = map.get(key) ?? { stepKey, date, groups: [] };
        // 같은 팀이 1안·2안에 같은 날짜를 적었어도 한 번만 센다.
        if (!cell.groups.includes(group.code)) cell.groups.push(group.code);
        map.set(key, cell);
      }
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => a.stepKey.localeCompare(b.stepKey) || a.date.localeCompare(b.date)
  );
}

// ---------------------------------------------------------------------------
// 심사기준 1번 — 참여·이수 이력 수기 등록 대장 (study_prior_participations)
//
// 자동 조회(특강 applications)만으로는 이 포털을 거치지 않은 프로그램 이력을 잡지 못한다.
// 심사기준 1번이 20점이라 근거가 비면 배점이 형해화되므로, 관리자가 직접 채워 넣는다.
// ---------------------------------------------------------------------------

export interface PriorParticipationInput {
  name: string;
  idNumber: string;
  phone: string;
  programName: string;
  programYear: number | null;
  completed: boolean;
  note: string;
}

export async function fetchPriorParticipations(): Promise<StudyPriorParticipation[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from(TABLES.STUDY_PRIOR_PARTICIPATIONS)
    .select("*")
    .order("name")
    .order("program_year", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as StudyPriorParticipation[];
}

function toRow(input: PriorParticipationInput) {
  return {
    name: input.name.trim(),
    id_number: input.idNumber.trim(),
    phone: input.phone.trim(),
    program_name: input.programName.trim(),
    program_year: input.programYear,
    completed: input.completed,
    note: input.note.trim(),
    // created_by는 DB 트리거가 세션 이메일로 채운다(위조 방지).
  };
}

/**
 * 여러 건을 한 번에 등록한다. 과거 프로그램 명단은 보통 엑셀로 존재하므로
 * 한 줄씩 넣게 하면 실무에서 쓰이지 않는다.
 * 이미 있는 (성명·직번·연락처·프로그램) 조합은 이수 여부만 갱신한다.
 */
export async function upsertPriorParticipations(
  inputs: PriorParticipationInput[]
): Promise<string | null> {
  if (inputs.length === 0) return null;
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase
    .from(TABLES.STUDY_PRIOR_PARTICIPATIONS)
    .upsert(inputs.map(toRow), { onConflict: "name,id_number,phone,program_name" });

  return error ? error.message : null;
}

export async function deletePriorParticipations(ids: string[]): Promise<string | null> {
  if (ids.length === 0) return null;
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase
    .from(TABLES.STUDY_PRIOR_PARTICIPATIONS)
    .delete()
    .in("id", ids);

  return error ? error.message : null;
}

/**
 * 붙여넣기 한 덩어리를 행으로 판독한다. 엑셀에서 복사하면 탭 구분, 그 외에는 쉼표를 쓴다.
 * 열 순서: 성명 · 직번 · 연락처 · 프로그램명 · 연도 · 이수여부
 * 이수여부는 Y/y/O/1/true/이수 를 참으로 본다.
 */
export function parsePriorParticipationPaste(text: string): {
  rows: PriorParticipationInput[];
  errors: string[];
} {
  const rows: PriorParticipationInput[] = [];
  const errors: string[] = [];

  text.split(/\r?\n/).forEach((line, index) => {
    const raw = line.trim();
    if (!raw) return;

    const cells = (raw.includes("\t") ? raw.split("\t") : raw.split(",")).map((c) => c.trim());
    const [name, idNumber = "", phone = "", programName, year = "", completed = ""] = cells;

    const lineNo = index + 1;
    if (!name || !programName) {
      errors.push(`${lineNo}행: 성명과 프로그램명은 필수입니다.`);
      return;
    }
    // 직번도 연락처도 없으면 어떤 신청자와도 이어지지 않는다(DB 제약과 동일 기준).
    if (!idNumber && !phone) {
      errors.push(`${lineNo}행: 직번 또는 연락처 중 하나는 있어야 합니다.`);
      return;
    }

    const parsedYear = year ? Number(year.replace(/[^0-9]/g, "")) : NaN;

    rows.push({
      name,
      idNumber,
      phone,
      programName,
      programYear: Number.isFinite(parsedYear) && parsedYear > 0 ? parsedYear : null,
      completed: /^(y|o|1|true|이수)$/i.test(completed),
      note: "",
    });
  });

  return { rows, errors };
}
