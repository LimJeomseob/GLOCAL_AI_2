// 연구모임 제출 Edge Function — 신청서·계획서·회의록·결과보고서·산출물의 유일한 공개 쓰기 경로.
//
// study_* 테이블에는 익명 INSERT 정책이 없다. 연구모임 신청은 "모임 1건 + 참여자 3~5행 +
// 계획서 1행"을 한 번에 만들고 접수번호를 되돌려줘야 해서 단일 INSERT로 끝나지 않고,
// 컬럼 위조를 정책만으로 막을 수도 없기 때문이다. 그래서 모든 공개 쓰기를 이 함수의
// Service Role 경로로 모으고, 본인확인(대표자 성명+연락처)을 유일한 인증 요소로 삼는다.
//
// 규약은 현행 함수들을 그대로 승계한다.
//   · 미존재와 본인 불일치를 같은 404 메시지로 통일 → 팀 존재 여부를 노출하지 않는다
//   · UPDATE에 허용 상태 조건을 다시 걸어 조회-갱신 사이 경합에서 안전하게 실패시킨다
//   · 신청 구간·팀 규모의 최종 강제는 DB 트리거(check_study_group_submit)가 한다
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";

const PHONE_REGEX = /^01[0-9]-?\d{3,4}-?\d{4}$/;

/** 계획서/결과보고서 최소 분량. 서식의 "1페이지 이상"·"최소 3장 이상"을 글자 수로 환산한 값 */
const PLAN_MIN_CHARS = 1200;
const REPORT_MIN_CHARS = 3600;

const phoneField = z.string().trim().regex(PHONE_REGEX);
const identity = {
  leaderName: z.string().trim().min(1),
  leaderPhone: phoneField,
};

const memberSchema = z.object({
  idNumber: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(50),
  affiliation: z.string().trim().min(1).max(100),
  position: z.string().trim().min(1).max(50),
  isLeader: z.boolean().default(false),
});

/** 윤리교육 실천 다짐 — 화면(studyEthicsPledgeSchema)과 같은 규칙으로 다시 검사한다 */
const ethicsPledgeSchema = z.object({
  no: z.number().int().min(1).max(8),
  title: z.string().trim().min(1).max(100),
  pledge: z.string().trim().min(10).max(1000),
});

const applySchema = z.object({
  kind: z.literal("apply"),
  roundId: z.string().uuid(),
  ...identity,
  name: z.string().trim().min(2).max(60),
  topic: z.string().trim().min(2).max(120),
  category: z.enum(["초급", "중급", "고급1", "고급2"]),
  leaderAffiliation: z.string().trim().min(1).max(100),
  leaderPosition: z.string().trim().min(1).max(50),
  leaderIdNumber: z.string().trim().min(1).max(50),
  leaderEmail: z.string().trim().email(),
  hasNontenured: z.boolean().default(false),
  members: z.array(memberSchema).min(1).max(20),
  // 윤리교육 게이트(8대 핵심원칙 중 3개 이상)를 통과해야 신청이 저장된다
  ethicsPledges: z.array(ethicsPledgeSchema).min(3).max(8),
  consent: z.literal(true),
});

const planSchema = z.object({
  kind: z.literal("plan"),
  groupId: z.string().uuid(),
  ...identity,
  section1Topic: z.string().max(20000).default(""),
  section2Purpose: z.string().max(20000).default(""),
  section3Platform: z.string().max(20000).default(""),
  section4Effect: z.string().max(20000).default(""),
  section5Etc: z.string().max(20000).default(""),
  workshopPref: z.record(z.record(z.string())).default({}),
  progressMethod: z.enum(["전문가코칭", "개별학습"]).nullable().default(null),
  educationMode: z.enum(["대면", "비대면"]).nullable().default(null),
  submit: z.boolean().default(false),
});

const meetingSaveSchema = z.object({
  kind: z.literal("meeting-save"),
  groupId: z.string().uuid(),
  ...identity,
  meetingId: z.string().uuid().nullable().default(null),
  metAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().default(null),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().default(null),
  location: z.string().max(200).default(""),
  subject: z.string().trim().min(1).max(200),
  content: z.string().max(20000).default(""),
  authorName: z.string().max(50).default(""),
});

const meetingDeleteSchema = z.object({
  kind: z.literal("meeting-delete"),
  groupId: z.string().uuid(),
  ...identity,
  meetingId: z.string().uuid(),
});

const outputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  outputType: z.enum(["GPTs", "RAG 챗봇", "웹도구", "AI 에이전트", "강의자료", "영상", "기타"]),
  url: z.string().trim().url(),
  driveUploaded: z.boolean().default(false),
  description: z.string().max(2000).default(""),
});

const reportSchema = z.object({
  kind: z.literal("report"),
  groupId: z.string().uuid(),
  ...identity,
  actualPeriodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  actualPeriodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  section1Background: z.string().max(40000).default(""),
  section2TopicPurpose: z.string().max(40000).default(""),
  section3Operation: z.string().max(40000).default(""),
  section4ResultUse: z.string().max(40000).default(""),
  section5EffectSuggestion: z.string().max(40000).default(""),
  outputs: z.array(outputSchema).max(30).default([]),
  submit: z.boolean().default(false),
});

const bodySchema = z.discriminatedUnion("kind", [
  applySchema,
  planSchema,
  meetingSaveSchema,
  meetingDeleteSchema,
  reportSchema,
]);

function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

function countChars(...sections: string[]): number {
  return sections.reduce((sum, s) => sum + s.replace(/\s/g, "").length, 0);
}

const IDENTITY_ERROR = "일치하는 연구모임이 없습니다. 대표자 성명과 연락처를 확인해 주세요.";

type Client = ReturnType<typeof createClient>;

/** 본인확인. 미존재/불일치를 같은 404로 통일해 팀 존재 여부를 노출하지 않는다. */
async function verifyLeader(supabase: Client, groupId: string, leaderName: string, leaderPhone: string) {
  const { data, error } = await supabase
    .from("study_groups")
    .select("id, code, status, leader_name, leader_phone, round_id, period_start, period_end")
    .eq("id", groupId)
    .maybeSingle();

  if (error) return { error: jsonResponse({ error: "조회 중 오류가 발생했습니다." }, 500) };

  const mismatch =
    !data ||
    data.leader_name !== leaderName ||
    normalizePhone(data.leader_phone as string) !== normalizePhone(leaderPhone);

  if (mismatch) return { error: jsonResponse({ error: IDENTITY_ERROR }, 404) };
  return { group: data as Record<string, any> };
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return jsonResponse({ error: "입력값을 확인해 주세요." }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const body = parsed.data;

  // --------------------------------------------------------------------------
  // 1. 신청서 ([서식 1] 상단) — 모임 생성 또는 기존 임시저장 건 갱신
  // --------------------------------------------------------------------------
  if (body.kind === "apply") {
    const { data: round, error: roundError } = await supabase
      .from("study_rounds")
      .select("id, min_team_size, max_team_size, period_start, period_end")
      .eq("id", body.roundId)
      .maybeSingle();

    if (roundError || !round) {
      return jsonResponse({ error: "모집회차 정보를 확인할 수 없습니다." }, 400);
    }

    const min = round.min_team_size as number;
    const max = round.max_team_size as number;
    if (body.members.length < min || body.members.length > max) {
      return jsonResponse(
        { error: `참여자는 ${min}명 이상 ${max}명 이하로 구성해 주세요. (현재 ${body.members.length}명)` },
        400
      );
    }

    const idNumbers = body.members.map((m) => m.idNumber);
    if (new Set(idNumbers).size !== idNumbers.length) {
      return jsonResponse({ error: "참여자 직(학)번이 중복되었습니다." }, 400);
    }

    const pledgeNos = body.ethicsPledges.map((p) => p.no);
    if (new Set(pledgeNos).size !== pledgeNos.length) {
      return jsonResponse({ error: "윤리교육 실천 다짐의 원칙이 중복되었습니다." }, 400);
    }

    // 같은 대표자가 같은 회차에 남겨 둔 임시저장 건이 있으면 새로 만들지 않고 갱신한다
    // (탭 2로 되돌아왔을 때 중복 접수가 쌓이는 것을 막는다).
    const { data: existingList } = await supabase
      .from("study_groups")
      .select("id, leader_phone, status")
      .eq("round_id", body.roundId)
      .eq("leader_name", body.leaderName)
      .eq("status", "draft");

    const existing = (existingList ?? []).find(
      (g: any) => normalizePhone(g.leader_phone) === normalizePhone(body.leaderPhone)
    );

    const groupFields = {
      round_id: body.roundId,
      name: body.name,
      topic: body.topic,
      category: body.category,
      leader_name: body.leaderName,
      leader_affiliation: body.leaderAffiliation,
      leader_position: body.leaderPosition,
      leader_id_number: body.leaderIdNumber,
      leader_phone: body.leaderPhone,
      leader_email: body.leaderEmail,
      has_nontenured: body.hasNontenured,
      ethics_pledges: body.ethicsPledges,
      period_start: round.period_start,
      period_end: round.period_end,
      consent: true,
    };

    let groupId: string;
    let code: string;

    if (existing) {
      const { data: updated, error: updateError } = await supabase
        .from("study_groups")
        .update(groupFields)
        .eq("id", existing.id)
        .eq("status", "draft")
        .select("id, code")
        .maybeSingle();

      if (updateError || !updated) {
        console.error("[study-submit] 임시저장 갱신 실패:", updateError);
        return jsonResponse({ error: "저장 중 오류가 발생했습니다." }, 500);
      }
      groupId = updated.id as string;
      code = updated.code as string;

      await supabase.from("study_group_members").delete().eq("group_id", groupId);
    } else {
      const { data: created, error: insertError } = await supabase
        .from("study_groups")
        .insert(groupFields)
        .select("id, code")
        .maybeSingle();

      if (insertError || !created) {
        // 트리거가 올린 신청 구간 위반(P0002/P0004)은 사용자에게 사유를 그대로 보여준다.
        const message = insertError?.message ?? "저장 중 오류가 발생했습니다.";
        const isWindow = insertError?.code === "P0002" || insertError?.code === "P0004";
        return jsonResponse({ error: isWindow ? message : "저장 중 오류가 발생했습니다." }, isWindow ? 400 : 500);
      }
      groupId = created.id as string;
      code = created.code as string;
    }

    const { error: memberError } = await supabase.from("study_group_members").insert(
      body.members.map((m, index) => ({
        group_id: groupId,
        id_number: m.idNumber,
        name: m.name,
        affiliation: m.affiliation,
        position: m.position,
        is_leader: m.isLeader,
        sort_order: index,
      }))
    );

    if (memberError) {
      console.error("[study-submit] 참여자 저장 실패:", memberError);
      return jsonResponse({ error: "참여자 저장 중 오류가 발생했습니다." }, 500);
    }

    // 계획서 행을 미리 만들어 둔다 — 탭 3이 항상 같은 행을 갱신하면 되도록.
    await supabase.from("study_group_plans").upsert({ group_id: groupId }, { onConflict: "group_id" });

    return jsonResponse({ ok: true, groupId, code });
  }

  // --------------------------------------------------------------------------
  // 이하 모든 요청은 본인확인을 통과해야 한다.
  // --------------------------------------------------------------------------
  const verified = await verifyLeader(supabase, body.groupId, body.leaderName, body.leaderPhone);
  if ("error" in verified) return verified.error;
  const group = verified.group;

  // --------------------------------------------------------------------------
  // 2. 계획서 ([서식 1] 하단) — 임시저장 상태에서만 수정 가능, 제출하면 잠긴다
  // --------------------------------------------------------------------------
  if (body.kind === "plan") {
    if (group.status !== "draft") {
      return jsonResponse(
        { error: "이미 제출된 계획서는 수정할 수 없습니다. 수정이 필요하면 AI융합원으로 문의해 주세요." },
        400
      );
    }

    const charCount = countChars(
      body.section1Topic,
      body.section2Purpose,
      body.section3Platform,
      body.section4Effect,
      body.section5Etc
    );

    if (body.submit && charCount < PLAN_MIN_CHARS) {
      return jsonResponse(
        { error: `계획서는 공백 제외 ${PLAN_MIN_CHARS}자 이상 작성해 주세요. (현재 ${charCount}자)` },
        400
      );
    }

    const { error: planError } = await supabase.from("study_group_plans").upsert(
      {
        group_id: body.groupId,
        section1_topic: body.section1Topic,
        section2_purpose: body.section2Purpose,
        section3_platform: body.section3Platform,
        section4_effect: body.section4Effect,
        section5_etc: body.section5Etc,
        workshop_pref: body.workshopPref,
        char_count: charCount,
        submitted_at: body.submit ? new Date().toISOString() : null,
      },
      { onConflict: "group_id" }
    );

    if (planError) {
      console.error("[study-submit] 계획서 저장 실패:", planError);
      return jsonResponse({ error: "저장 중 오류가 발생했습니다." }, 500);
    }

    const groupUpdate: Record<string, unknown> = {
      progress_method: body.progressMethod,
      education_mode: body.educationMode,
    };
    if (body.submit) groupUpdate.status = "submitted";

    const { data: updatedGroup, error: groupError } = await supabase
      .from("study_groups")
      .update(groupUpdate)
      .eq("id", body.groupId)
      .eq("status", "draft")
      .select("id, code, status")
      .maybeSingle();

    if (groupError) {
      // 팀 규모(P0005)·신청 마감(P0002)은 트리거가 올린 사유를 그대로 보여준다.
      const known = ["P0002", "P0005"].includes(groupError.code ?? "");
      console.error("[study-submit] 모임 상태 갱신 실패:", groupError);
      return jsonResponse(
        { error: known ? groupError.message : "제출 중 오류가 발생했습니다." },
        known ? 400 : 500
      );
    }
    if (!updatedGroup) {
      return jsonResponse({ error: "상태가 변경되었습니다. 다시 조회해 주세요." }, 400);
    }

    return jsonResponse({
      ok: true,
      groupId: body.groupId,
      code: updatedGroup.code,
      status: updatedGroup.status,
      charCount,
      submitted: body.submit,
    });
  }

  // --------------------------------------------------------------------------
  // 3·4. 회의록 / 결과보고서 — 선발된 팀의 운영 기간에만 열린다
  // --------------------------------------------------------------------------
  const OPERATION_STATUSES = ["selected", "in_progress"];
  if (!OPERATION_STATUSES.includes(group.status)) {
    const message =
      group.status === "report_submitted" || group.status === "completed"
        ? "결과보고서가 제출되어 더 이상 수정할 수 없습니다."
        : "선발된 연구모임만 이용할 수 있습니다.";
    return jsonResponse({ error: message }, 400);
  }

  /** 첫 제출 시 selected → in_progress 로 올린다(운영 착수 시점을 별도 조작 없이 기록). */
  async function markInProgress() {
    if (group.status === "selected") {
      await supabase
        .from("study_groups")
        .update({ status: "in_progress" })
        .eq("id", group.id)
        .eq("status", "selected");
    }
  }

  if (body.kind === "meeting-save") {
    const row = {
      group_id: body.groupId,
      met_at: body.metAt,
      start_time: body.startTime,
      end_time: body.endTime,
      location: body.location,
      subject: body.subject,
      content: body.content,
      author_name: body.authorName,
    };

    if (body.meetingId) {
      const { data: updated, error } = await supabase
        .from("study_meetings")
        .update(row)
        .eq("id", body.meetingId)
        .eq("group_id", body.groupId) // 다른 팀의 회의록을 건드릴 수 없게 한다
        .select("id")
        .maybeSingle();

      if (error) {
        console.error("[study-submit] 회의록 수정 실패:", error);
        return jsonResponse({ error: "저장 중 오류가 발생했습니다." }, 500);
      }
      if (!updated) return jsonResponse({ error: "회의록을 찾을 수 없습니다." }, 404);

      await markInProgress();
      return jsonResponse({ ok: true, meetingId: updated.id });
    }

    const { data: created, error } = await supabase
      .from("study_meetings")
      .insert(row)
      .select("id")
      .maybeSingle();

    if (error || !created) {
      console.error("[study-submit] 회의록 저장 실패:", error);
      return jsonResponse({ error: "저장 중 오류가 발생했습니다." }, 500);
    }

    await markInProgress();
    return jsonResponse({ ok: true, meetingId: created.id });
  }

  if (body.kind === "meeting-delete") {
    const { error } = await supabase
      .from("study_meetings")
      .delete()
      .eq("id", body.meetingId)
      .eq("group_id", body.groupId);

    if (error) {
      console.error("[study-submit] 회의록 삭제 실패:", error);
      return jsonResponse({ error: "삭제 중 오류가 발생했습니다." }, 500);
    }
    return jsonResponse({ ok: true });
  }

  // body.kind === "report"
  const charCount = countChars(
    body.section1Background,
    body.section2TopicPurpose,
    body.section3Operation,
    body.section4ResultUse,
    body.section5EffectSuggestion
  );

  if (body.submit && charCount < REPORT_MIN_CHARS) {
    return jsonResponse(
      { error: `결과보고서는 공백 제외 ${REPORT_MIN_CHARS}자 이상 작성해 주세요. (현재 ${charCount}자)` },
      400
    );
  }
  if (body.submit && body.outputs.length === 0) {
    return jsonResponse({ error: "산출물을 1건 이상 등록해 주세요." }, 400);
  }

  const { error: reportError } = await supabase.from("study_reports").upsert(
    {
      group_id: body.groupId,
      actual_period_start: body.actualPeriodStart ?? group.period_start,
      actual_period_end: body.actualPeriodEnd ?? group.period_end,
      section1_background: body.section1Background,
      section2_topic_purpose: body.section2TopicPurpose,
      section3_operation: body.section3Operation,
      section4_result_use: body.section4ResultUse,
      section5_effect_suggestion: body.section5EffectSuggestion,
      char_count: charCount,
      submitted_at: body.submit ? new Date().toISOString() : null,
    },
    { onConflict: "group_id" }
  );

  if (reportError) {
    console.error("[study-submit] 결과보고서 저장 실패:", reportError);
    return jsonResponse({ error: "저장 중 오류가 발생했습니다." }, 500);
  }

  // 산출물은 목록 전체를 통째로 교체한다(건수가 적고 순서가 의미를 가지므로 diff보다 단순·정확).
  await supabase.from("study_outputs").delete().eq("group_id", body.groupId);
  if (body.outputs.length > 0) {
    const { error: outputError } = await supabase.from("study_outputs").insert(
      body.outputs.map((o, index) => ({
        group_id: body.groupId,
        title: o.title,
        output_type: o.outputType,
        url: o.url,
        drive_uploaded: o.driveUploaded,
        description: o.description,
        sort_order: index,
      }))
    );
    if (outputError) {
      console.error("[study-submit] 산출물 저장 실패:", outputError);
      return jsonResponse({ error: "산출물 저장 중 오류가 발생했습니다." }, 500);
    }
  }

  if (body.submit) {
    const { data: updated, error } = await supabase
      .from("study_groups")
      .update({ status: "report_submitted" })
      .eq("id", body.groupId)
      .in("status", OPERATION_STATUSES)
      .select("id, status")
      .maybeSingle();

    if (error || !updated) {
      console.error("[study-submit] 결과보고서 제출 상태 갱신 실패:", error);
      return jsonResponse({ error: "제출 중 오류가 발생했습니다. 다시 조회해 주세요." }, 400);
    }
    return jsonResponse({ ok: true, charCount, submitted: true, status: updated.status });
  }

  await markInProgress();
  return jsonResponse({ ok: true, charCount, submitted: false });
});
