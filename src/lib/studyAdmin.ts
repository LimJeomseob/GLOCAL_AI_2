"use client";

import { createSupabaseBrowserClient } from "./supabase/client";
import { TABLES } from "./db-tables";
import { extractFunctionError } from "./functionError";
import { countChars } from "./studyValidation";
import type { StudyMemberInput, StudyPlanAdminInput } from "./studyValidation";
import type {
  StudyEthicsPledgeRecord,
  StudyExpertApplication,
  StudyExpertStatus,
  StudyGroup,
  StudyGroupMember,
  StudyGroupPlan,
  StudyGroupWithRelations,
  StudyMeeting,
  StudyNotification,
  StudyNotificationStatus,
  StudyNotificationTemplate,
  StudyNotificationTemplateStage,
  StudyNotificationWithGroup,
  StudyOutput,
  StudyReport,
  StudyPriorParticipation,
  StudyReview,
  StudyRound,
  WorkshopPreference,
} from "./studyTypes";
import { getWorkshopSlot, isWorkshopTimeKey } from "./workshopPref";

/**
 * Postgres 오류를 담당자가 읽을 수 있는 문구로 바꾼다.
 * 고유 제약(23505)은 어느 제약인지에 따라 원인이 전혀 다르므로 제약명으로 갈라 준다.
 */
function toAdminErrorMessage(error: { code?: string; message: string } | null): string | null {
  if (!error) return null;
  if (error.code === "23505") {
    if (error.message.includes("study_expert_applications_round_id_number_key")) {
      return "같은 회차에 이미 등록된 직번입니다. 기존 신청을 수정해 주세요.";
    }
    if (error.message.includes("study_group_members_unique_id_number")) {
      return "같은 팀에 같은 직(학)번이 두 번 있습니다.";
    }
  }
  return error.message;
}

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
 * 복수 학과 판정 수동 보정. null이면 자동 판정으로 되돌린다.
 * is_multi_dept는 DB 트리거(0023)가 재계산하므로 갱신된 최종값을 함께 돌려받아
 * 화면이 다시 조회하지 않고도 배지를 맞출 수 있게 한다.
 */
export async function updateStudyGroupMultiDeptOverride(
  groupId: string,
  value: boolean | null
): Promise<{ error: string | null; isMultiDept?: boolean }> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from(TABLES.STUDY_GROUPS)
    .update({ multi_dept_override: value })
    .eq("id", groupId)
    .select("is_multi_dept")
    .single();

  if (error) return { error: error.message };
  const row = data as { is_multi_dept: boolean } | null;
  return { error: null, isMultiDept: Boolean(row?.is_multi_dept) };
}

/**
 * 관리자의 신청서 직접 수정.
 *
 * 공개 경로(study-submit `apply-edit`)는 심사 착수 전·신청 마감 전에만 열리므로, 그 밖의 정정은
 * 이 경로로 처리한다. RLS(study_groups_admin_all)와 트리거의 관리자 예외(check_study_group_submit)가
 * 이를 허용한다. 회차·연구기간·상태·제출시각·복수학과 보정값은 각각 다른 화면이 담당하므로 건드리지 않는다.
 */
export interface StudyGroupDetailsPatch {
  name: string;
  topic: string;
  category: string;
  leader_name: string;
  leader_affiliation: string;
  leader_position: string;
  leader_id_number: string;
  leader_phone: string;
  leader_email: string;
  has_nontenured: boolean;
  progress_method: string | null;
  education_mode: string | null;
  ethics_pledges: StudyEthicsPledgeRecord[];
}

export async function updateStudyGroupDetails(
  groupId: string,
  patch: StudyGroupDetailsPatch
): Promise<string | null> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from(TABLES.STUDY_GROUPS).update(patch).eq("id", groupId);

  return toAdminErrorMessage(error);
}

/**
 * 참여자 명단 교체.
 *
 * 공개 경로는 전체 삭제 후 삽입이라 그 사이에 장애가 나면 명단이 빈다. 관리자 화면은 그 사고를
 * 복구하는 도구이므로 순서를 뒤집어, 먼저 upsert로 새 명단을 확정한 뒤 빠진 행만 지운다.
 * member_count·is_multi_dept는 트리거(sync_study_group_members)가 재계산하므로 쓰지 않는다.
 */
export async function replaceStudyGroupMembers(
  groupId: string,
  existing: StudyGroupMember[],
  next: StudyMemberInput[]
): Promise<string | null> {
  const supabase = createSupabaseBrowserClient();

  const rows = next.map((member, index) => ({
    group_id: groupId,
    id_number: member.idNumber.trim(),
    name: member.name.trim(),
    affiliation: member.affiliation.trim(),
    position: member.position.trim(),
    is_leader: member.isLeader,
    sort_order: index,
  }));

  const { error: upsertError } = await supabase
    .from(TABLES.STUDY_GROUP_MEMBERS)
    .upsert(rows, { onConflict: "group_id,id_number" });

  if (upsertError) return toAdminErrorMessage(upsertError);

  // 직번이 바뀐 행(대표자 직번 수정 포함)은 새 행으로 들어오므로 옛 행을 지워야 한다.
  const keep = new Set(rows.map((r) => r.id_number));
  const removeIds = existing.filter((m) => !keep.has(m.id_number)).map((m) => m.id);
  if (removeIds.length === 0) return null;

  const { error: deleteError } = await supabase
    .from(TABLES.STUDY_GROUP_MEMBERS)
    .delete()
    .in("id", removeIds);

  return toAdminErrorMessage(deleteError);
}

/**
 * 계획서 저장. 계획서가 없던 팀이면 새로 만든다(제출 상태가 아닌 미제출 행으로 생성된다).
 * submitted_at은 payload에 넣지 않아 기존 제출 시각이 보존된다.
 */
export async function upsertStudyGroupPlan(
  groupId: string,
  input: StudyPlanAdminInput
): Promise<string | null> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from(TABLES.STUDY_GROUP_PLANS).upsert(
    {
      group_id: groupId,
      section1_topic: input.section1Topic,
      section2_purpose: input.section2Purpose,
      section3_platform: input.section3Platform,
      section4_effect: input.section4Effect,
      section5_etc: input.section5Etc,
      workshop_pref: input.workshopPref as WorkshopPreference,
      char_count: countChars(
        input.section1Topic,
        input.section2Purpose,
        input.section3Platform,
        input.section4Effect,
        input.section5Etc
      ),
    },
    { onConflict: "group_id" }
  );

  return toAdminErrorMessage(error);
}

/**
 * 연구모임 신청 삭제(테스트 접수분 정리, 중복 접수 취소).
 * 참여자·계획서·심사·회의록·결과보고서·산출물·알림은 FK on delete cascade로 함께 지워진다.
 * 첨부파일은 Storage 버킷 `study-attachments`에 남으므로 대시보드에서 별도 정리해야 한다.
 */
export async function deleteStudyGroups(ids: string[]): Promise<string | null> {
  if (ids.length === 0) return null;
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from(TABLES.STUDY_GROUPS).delete().in("id", ids);

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
  /** 시작 시간(HH:MM). 시간 입력 도입 전 접수분은 "" */
  time: string;
  groups: string[];
}

export function aggregateWorkshopDemand(
  groups: Pick<StudyGroupWithRelations, "code" | "plan">[]
): WorkshopDemandCell[] {
  const map = new Map<string, WorkshopDemandCell>();

  for (const group of groups) {
    const pref = group.plan?.workshop_pref;
    if (!pref) continue;

    for (const [optionKey, option] of Object.entries(pref)) {
      for (const stepKey of Object.keys(option ?? {})) {
        // 시간 키(`${stepKey}Time`)는 날짜 칸을 돌 때 함께 읽으므로 따로 세지 않는다.
        if (isWorkshopTimeKey(stepKey)) continue;
        const { date, time } = getWorkshopSlot(pref, optionKey, stepKey);
        if (!date) continue;
        // 같은 날이라도 시간대가 다르면 강사 배정 단위가 달라지므로 따로 센다.
        const key = `${stepKey}|${date}|${time}`;
        const cell = map.get(key) ?? { stepKey, date, time, groups: [] };
        // 같은 팀이 1안·2안에 같은 날짜·시간을 적었어도 한 번만 센다.
        if (!cell.groups.includes(group.code)) cell.groups.push(group.code);
        map.set(key, cell);
      }
    }
  }

  return Array.from(map.values()).sort(
    (a, b) =>
      a.stepKey.localeCompare(b.stepKey) ||
      a.date.localeCompare(b.date) ||
      a.time.localeCompare(b.time)
  );
}

// ---------------------------------------------------------------------------
// 교내 AI활용 전문가 신청 (study_expert_applications, 0019)
// ---------------------------------------------------------------------------

export async function fetchStudyExpertApplications(
  roundId: string
): Promise<StudyExpertApplication[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from(TABLES.STUDY_EXPERT_APPLICATIONS)
    .select("*")
    .eq("round_id", roundId)
    .order("code");

  if (error) throw new Error(error.message);
  return (data ?? []) as StudyExpertApplication[];
}

/**
 * 선정·미선정 처리, 관리자 메모(배정 팀 등), 신청 내용 정정.
 * 트리거는 관리자(is_admin)에게 신청 구간 검사를 면제하므로 마감 후에도 고칠 수 있다.
 */
export type StudyExpertApplicationPatch = Partial<
  Pick<
    StudyExpertApplication,
    | "name"
    | "affiliation"
    | "position"
    | "id_number"
    | "phone"
    | "email"
    | "is_nontenured"
    | "experience"
    | "categories"
    | "ai_tools"
    | "status"
    | "note"
  >
> & { status?: StudyExpertStatus };

export async function updateStudyExpertApplication(
  id: string,
  patch: StudyExpertApplicationPatch
): Promise<string | null> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase
    .from(TABLES.STUDY_EXPERT_APPLICATIONS)
    .update(patch)
    .eq("id", id);

  return toAdminErrorMessage(error);
}

/**
 * 관리자 직접 등록(오프라인·유선 접수 소급 등록).
 * 접수번호(code)는 보내지 않는다 — 트리거(check_study_expert_apply)가 EX-{연도}-{학기}-{연번}으로 채번한다.
 * availability_confirmed·consent는 DB CHECK가 true를 요구하므로, 화면에서 담당자가 오프라인 확인을
 * 체크한 경우에만 이 함수를 호출한다.
 */
export async function createStudyExpertApplication(
  roundId: string,
  input: Omit<StudyExpertApplicationPatch, "status"> & { status: StudyExpertStatus }
): Promise<{ row: StudyExpertApplication | null; error: string | null }> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from(TABLES.STUDY_EXPERT_APPLICATIONS)
    .insert({
      round_id: roundId,
      experience: "",
      ...input,
      availability_confirmed: true,
      consent: true,
    })
    .select("*")
    .single();

  if (error) return { row: null, error: toAdminErrorMessage(error) };
  return { row: data as StudyExpertApplication, error: null };
}

/** 전문가 신청 삭제(중복·테스트 접수 정리). 이 테이블을 참조하는 FK는 없다. */
export async function deleteStudyExpertApplications(ids: string[]): Promise<string | null> {
  if (ids.length === 0) return null;
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase
    .from(TABLES.STUDY_EXPERT_APPLICATIONS)
    .delete()
    .in("id", ids);

  return toAdminErrorMessage(error);
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

// ---------------------------------------------------------------------------
// 대표자 안내 메일 큐 (study_notifications + study_notification_templates, 0024)
//
// 큐 행은 DB 트리거가 만들고, 관리자는 여기서 내용을 확인·수정한 뒤 승인 발송한다.
// 실제 발송은 Edge Function study-notify(Resend)가 하며, 브라우저는 행을 갱신하지 않는다.
// ---------------------------------------------------------------------------

/** 큐 전체 + 모임 식별 정보. 모임이 삭제되면 cascade로 큐 행도 사라지므로 조인 실패는 없다. */
export async function fetchStudyNotifications(): Promise<StudyNotificationWithGroup[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from(TABLES.STUDY_NOTIFICATIONS)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as StudyNotification[];
  if (rows.length === 0) return [];

  const groupIds = Array.from(new Set(rows.map((r) => r.group_id)));
  const { data: groups, error: groupError } = await supabase
    .from(TABLES.STUDY_GROUPS)
    .select("id, code, name, leader_name")
    .in("id", groupIds);

  if (groupError) throw new Error(groupError.message);
  const byId = new Map(
    ((groups ?? []) as { id: string; code: string; name: string; leader_name: string }[]).map((g) => [g.id, g])
  );

  return rows.map((r) => {
    const g = byId.get(r.group_id);
    return {
      ...r,
      group_code: g?.code ?? "",
      group_name: g?.name ?? "",
      leader_name: g?.leader_name ?? "",
    };
  });
}

export interface StudyNotificationPatch {
  subject?: string;
  body?: string;
  recipient?: string;
  status?: StudyNotificationStatus;
}

/** 승인 전 내용 수정·취소·재시도(실패→대기). 성공 행은 이력이므로 화면이 편집을 열지 않는다. */
export async function updateStudyNotification(
  id: string,
  patch: StudyNotificationPatch
): Promise<string | null> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from(TABLES.STUDY_NOTIFICATIONS).update(patch).eq("id", id);
  return error ? error.message : null;
}

export async function updateStudyNotificationsStatus(
  ids: string[],
  status: StudyNotificationStatus
): Promise<string | null> {
  if (ids.length === 0) return null;
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase
    .from(TABLES.STUDY_NOTIFICATIONS)
    .update({ status })
    .in("id", ids);
  return error ? error.message : null;
}

export async function fetchStudyNotificationTemplates(): Promise<StudyNotificationTemplate[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from(TABLES.STUDY_NOTIFICATION_TEMPLATES)
    .select("*")
    .order("stage");

  if (error) throw new Error(error.message);
  return (data ?? []) as StudyNotificationTemplate[];
}

export async function updateStudyNotificationTemplate(
  stage: StudyNotificationTemplateStage,
  patch: { subject?: string; body?: string; enabled?: boolean }
): Promise<string | null> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase
    .from(TABLES.STUDY_NOTIFICATION_TEMPLATES)
    .update(patch)
    .eq("stage", stage);
  return error ? error.message : null;
}

export interface StudyNotifySendResult {
  id: string;
  ok: boolean;
  error: string;
}

/**
 * 승인 발송. Edge Function이 행 상태를 갱신하므로 호출 후 목록을 다시 읽는다.
 * 한 번에 최대 50건 — 그 이상은 화면이 나눠 부른다.
 */
export async function sendStudyNotifications(
  ids: string[]
): Promise<{ results: StudyNotifySendResult[]; error: string | null }> {
  if (ids.length === 0) return { results: [], error: null };
  const supabase = createSupabaseBrowserClient();
  try {
    const { data, error } = await supabase.functions.invoke("study-notify", {
      body: { action: "send", ids },
    });
    if (error) {
      return { results: [], error: await extractFunctionError(error, "발송 요청에 실패했습니다.") };
    }
    return { results: (data?.results ?? []) as StudyNotifySendResult[], error: null };
  } catch {
    return { results: [], error: "네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
  }
}

/** 테스트 발송 — 행 상태를 바꾸지 않고 지정 주소로만 보낸다. */
export async function sendStudyNotificationTest(id: string, to: string): Promise<string | null> {
  const supabase = createSupabaseBrowserClient();
  try {
    const { error } = await supabase.functions.invoke("study-notify", {
      body: { action: "test", id, to },
    });
    if (error) return await extractFunctionError(error, "테스트 발송에 실패했습니다.");
    return null;
  } catch {
    return "네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
  }
}
