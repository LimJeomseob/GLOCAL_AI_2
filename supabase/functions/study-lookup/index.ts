// 연구모임 조회 Edge Function ('내 연구모임' 탭 + 계획서·회의록·결과보고서 탭의 본인확인 게이트).
//
// study_* 테이블은 RLS로 공개 SELECT가 전부 차단되어 있으므로, 현행 lookup과 동일하게
// 이 함수에서만 Service Role로 "대표자 성명 + 연락처가 일치하는 팀"을 서버에서 필터링해 반환한다.
// 팀이 제출·작성해야 할 모든 것(계획서/회의록/결과보고서/산출물)을 한 번에 실어 보내므로,
// 각 탭은 이 응답 하나로 화면을 그릴 수 있다.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";

const PHONE_REGEX = /^01[0-9]-?\d{3,4}-?\d{4}$/;

const lookupSchema = z.object({
  leaderName: z.string().trim().min(1),
  leaderPhone: z.string().trim().regex(PHONE_REGEX),
});

function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

/** PostgREST가 to-one 임베드를 배열로 줄 수 있어 정규화한다(현행 lookup과 동일한 방어). */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const json = await req.json().catch(() => null);
  const parsed = lookupSchema.safeParse(json);
  if (!parsed.success) {
    return jsonResponse({ error: "입력값을 확인해 주세요." }, 400);
  }

  const { leaderName, leaderPhone } = parsed.data;
  const normalizedPhone = normalizePhone(leaderPhone);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const { data: groups, error } = await supabase
    .from("study_groups")
    .select(
      `id, code, name, topic, category, status,
       leader_name, leader_affiliation, leader_position, leader_id_number, leader_phone, leader_email,
       period_start, period_end, member_count, is_multi_dept, has_nontenured,
       progress_method, education_mode, total_score, rank, submitted_at, created_at,
       round:study_rounds(
         id, year, semester, title, research_topic,
         apply_open_at, apply_close_at, review_close_at,
         period_start, period_end, report_due_at,
         max_teams, min_team_size, max_team_size, categories, criteria
       )`
    )
    .eq("leader_name", leaderName);

  if (error) {
    console.error("[study-lookup] 조회 실패:", error);
    return jsonResponse({ error: "조회 중 오류가 발생했습니다." }, 500);
  }

  // 하이픈 유무와 무관하게 매칭되도록 숫자만 남겨 비교한다.
  const matched = (groups ?? []).filter(
    (row: { leader_phone: string }) => normalizePhone(row.leader_phone) === normalizedPhone
  );

  // 불일치는 에러가 아니라 빈 배열 — 현행 lookup의 규약을 그대로 승계한다.
  if (matched.length === 0) {
    return jsonResponse({ results: [] });
  }

  const ids = matched.map((row: { id: string }) => row.id);

  const [membersRes, plansRes, meetingsRes, reportsRes, outputsRes] = await Promise.all([
    supabase
      .from("study_group_members")
      .select("id, group_id, id_number, name, affiliation, position, is_leader, sort_order")
      .in("group_id", ids)
      .order("sort_order"),
    supabase
      .from("study_group_plans")
      .select("*")
      .in("group_id", ids),
    supabase
      .from("study_meetings")
      .select("*")
      .in("group_id", ids)
      .order("met_at", { ascending: false }),
    supabase
      .from("study_reports")
      .select("*")
      .in("group_id", ids),
    supabase
      .from("study_outputs")
      .select("*")
      .in("group_id", ids)
      .order("sort_order"),
  ]);

  const byGroup = <T extends { group_id: string }>(rows: T[] | null) => {
    const map = new Map<string, T[]>();
    for (const row of rows ?? []) {
      const list = map.get(row.group_id) ?? [];
      list.push(row);
      map.set(row.group_id, list);
    }
    return map;
  };

  const members = byGroup(membersRes.data);
  const plans = byGroup(plansRes.data);
  const meetings = byGroup(meetingsRes.data);
  const reports = byGroup(reportsRes.data);
  const outputs = byGroup(outputsRes.data);

  const results = matched.map((g: any) => {
    const round = one<any>(g.round);
    const plan = plans.get(g.id)?.[0] ?? null;
    const report = reports.get(g.id)?.[0] ?? null;

    return {
      groupId: g.id,
      code: g.code,
      name: g.name,
      topic: g.topic,
      category: g.category,
      status: g.status,
      leaderName: g.leader_name,
      leaderAffiliation: g.leader_affiliation,
      leaderPosition: g.leader_position,
      leaderIdNumber: g.leader_id_number,
      leaderEmail: g.leader_email,
      periodStart: g.period_start,
      periodEnd: g.period_end,
      memberCount: g.member_count,
      isMultiDept: g.is_multi_dept,
      hasNontenured: g.has_nontenured,
      progressMethod: g.progress_method,
      educationMode: g.education_mode,
      // 심사 결과는 확정(selected/rejected) 이후에만 공개한다 — 심사 중 점수 노출 방지.
      totalScore: ["selected", "rejected", "in_progress", "report_submitted", "completed"].includes(g.status)
        ? g.total_score
        : null,
      rank: ["selected", "rejected", "in_progress", "report_submitted", "completed"].includes(g.status)
        ? g.rank
        : null,
      submittedAt: g.submitted_at,
      createdAt: g.created_at,
      members: (members.get(g.id) ?? []).map((m: any) => ({
        id: m.id,
        idNumber: m.id_number,
        name: m.name,
        affiliation: m.affiliation,
        position: m.position,
        isLeader: m.is_leader,
        sortOrder: m.sort_order,
      })),
      plan: plan
        ? {
            section1Topic: plan.section1_topic,
            section2Purpose: plan.section2_purpose,
            section3Platform: plan.section3_platform,
            section4Effect: plan.section4_effect,
            section5Etc: plan.section5_etc,
            workshopPref: plan.workshop_pref ?? {},
            charCount: plan.char_count,
            submittedAt: plan.submitted_at,
          }
        : null,
      meetings: (meetings.get(g.id) ?? []).map((m: any) => ({
        id: m.id,
        metAt: m.met_at,
        startTime: m.start_time,
        endTime: m.end_time,
        location: m.location,
        subject: m.subject,
        content: m.content,
        authorName: m.author_name,
      })),
      report: report
        ? {
            actualPeriodStart: report.actual_period_start,
            actualPeriodEnd: report.actual_period_end,
            section1Background: report.section1_background,
            section2TopicPurpose: report.section2_topic_purpose,
            section3Operation: report.section3_operation,
            section4ResultUse: report.section4_result_use,
            section5EffectSuggestion: report.section5_effect_suggestion,
            charCount: report.char_count,
            submittedAt: report.submitted_at,
          }
        : null,
      outputs: (outputs.get(g.id) ?? []).map((o: any) => ({
        id: o.id,
        title: o.title,
        outputType: o.output_type,
        url: o.url,
        driveUploaded: o.drive_uploaded,
        description: o.description,
        sortOrder: o.sort_order,
      })),
      round: round
        ? {
            id: round.id,
            year: round.year,
            semester: round.semester,
            title: round.title,
            researchTopic: round.research_topic,
            applyOpenAt: round.apply_open_at,
            applyCloseAt: round.apply_close_at,
            reviewCloseAt: round.review_close_at,
            periodStart: round.period_start,
            periodEnd: round.period_end,
            reportDueAt: round.report_due_at,
            maxTeams: round.max_teams,
            minTeamSize: round.min_team_size,
            maxTeamSize: round.max_team_size,
            categories: round.categories ?? [],
            criteria: round.criteria ?? [],
          }
        : null,
    };
  });

  results.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));

  return jsonResponse({ results });
});
