// 전문가 배정 팀 조회 Edge Function ('배정 팀 확인' 탭).
//
// study_expert_applications·study_groups 모두 RLS로 공개 SELECT가 막혀 있으므로,
// study-lookup과 같은 방식으로 이 함수에서만 Service Role로 "성명 + 연락처가 일치하는
// 선정 전문가"를 서버에서 찾고 그에게 배정된 팀을 돌려준다.
//
// 대표자 조회(study-lookup)와 다른 점:
//   · 선정(selected) 상태의 전문가만 연다 — 접수·미선정 단계에서는 배정이 없다.
//   · 배정된 팀의 대표자 연락처·이메일을 함께 준다. 전문가가 직접 연락해 일정을 잡아야 하므로
//     배정 관계가 확인된 범위에서만 노출한다.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

// ---------------------------------------------------------------------------
// CORS 헬퍼 — Supabase 대시보드 코드 편집기로도 배포할 수 있게 파일 안에 둔다.
// 편집기는 index.ts 한 파일만 올리므로 ../_shared/ import가 있으면 "Module not found"로
// 실패한다(study-submit·study-notify와 같은 이유). _shared/cors.ts 를 고칠 때 여기도 함께 볼 것.
// ---------------------------------------------------------------------------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

const PHONE_REGEX = /^01[0-9]-?\d{3,4}-?\d{4}$/;

const lookupSchema = z.object({
  expertName: z.string().trim().min(1),
  expertPhone: z.string().trim().regex(PHONE_REGEX),
});

function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const json = await req.json().catch(() => null);
  const parsed = lookupSchema.safeParse(json);
  if (!parsed.success) {
    return jsonResponse({ error: "입력값을 확인해 주세요." }, 400);
  }

  const { expertName, expertPhone } = parsed.data;
  const normalizedPhone = normalizePhone(expertPhone);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const { data: experts, error: expertError } = await supabase
    .from("study_expert_applications")
    .select("id, code, name, affiliation, position, phone, email, status")
    .eq("name", expertName)
    .eq("status", "selected");

  if (expertError) {
    console.error("[study-expert-lookup] 전문가 조회 실패:", expertError);
    return jsonResponse({ error: "조회 중 오류가 발생했습니다." }, 500);
  }

  // 하이픈 유무와 무관하게 매칭되도록 숫자만 남겨 비교한다.
  const expert = (experts ?? []).find(
    (row: { phone: string }) => normalizePhone(row.phone) === normalizedPhone
  );

  // 불일치는 에러가 아니라 빈 결과 — study-lookup의 규약을 그대로 승계한다.
  if (!expert) {
    return jsonResponse({ expert: null, groups: [] });
  }

  const { data: groups, error: groupError } = await supabase
    .from("study_groups")
    .select(
      `id, code, name, topic, category, status,
       leader_name, leader_affiliation, leader_position, leader_phone, leader_email,
       period_start, period_end, member_count, progress_method, education_mode`
    )
    .eq("expert_id", expert.id)
    .order("code");

  if (groupError) {
    console.error("[study-expert-lookup] 배정 팀 조회 실패:", groupError);
    return jsonResponse({ error: "조회 중 오류가 발생했습니다." }, 500);
  }

  const expertPayload = {
    id: expert.id,
    code: expert.code,
    name: expert.name,
    affiliation: expert.affiliation,
    position: expert.position,
    email: expert.email,
  };

  const rows = groups ?? [];
  if (rows.length === 0) {
    return jsonResponse({ expert: expertPayload, groups: [] });
  }

  const ids = rows.map((g: { id: string }) => g.id);

  const [plansRes, sessionsRes, memosRes, finalSchedulesRes] = await Promise.all([
    supabase.from("study_group_plans").select("group_id, workshop_pref").in("group_id", ids),
    supabase
      .from("study_coaching_sessions")
      .select("*")
      .in("group_id", ids)
      .order("session_no")
      .order("created_at"),
    supabase
      .from("study_coaching_memos")
      .select("*")
      .in("group_id", ids)
      .order("created_at"),
    // 팀별 최종 일정 공지(0027) — 대표자 화면(study-lookup)과 같은 공개 행만 보여 준다.
    supabase
      .from("study_final_schedules")
      .select("*")
      .in("group_id", ids)
      .eq("published", true),
  ]);

  const byGroup = <T extends { group_id: string }>(list: T[] | null) => {
    const map = new Map<string, T[]>();
    for (const row of list ?? []) {
      const bucket = map.get(row.group_id) ?? [];
      bucket.push(row);
      map.set(row.group_id, bucket);
    }
    return map;
  };

  const plans = byGroup(plansRes.data as { group_id: string; workshop_pref: unknown }[] | null);
  const sessions = byGroup(sessionsRes.data as { group_id: string }[] | null);
  const memos = byGroup(memosRes.data as { group_id: string }[] | null);
  const finalSchedules = byGroup(finalSchedulesRes.data as { group_id: string }[] | null);

  // 공문의 교육과정 3단계. study-lookup의 FINAL_STEPS와 같아야 한다(단일 파일 배포라 복제).
  const FINAL_STEPS = [
    { no: 1, label: "기획" },
    { no: 2, label: "제작" },
    { no: 3, label: "환류" },
  ];

  const toFinalSchedule = (row: any) =>
    row
      ? {
          teamNo: row.team_no,
          composition: row.composition,
          expertLabel: row.expert_label,
          steps: FINAL_STEPS.map((step) => ({
            no: step.no,
            label: step.label,
            when: row[`step${step.no}_when`] ?? "",
            detail: row[`step${step.no}_detail`] ?? "",
          })),
          note: row.note,
          updatedAt: row.updated_at,
        }
      : null;

  const payload = rows.map((g: any) => ({
    groupId: g.id,
    code: g.code,
    name: g.name,
    topic: g.topic,
    category: g.category,
    status: g.status,
    leaderName: g.leader_name,
    leaderAffiliation: g.leader_affiliation,
    leaderPosition: g.leader_position,
    leaderPhone: g.leader_phone,
    leaderEmail: g.leader_email,
    periodStart: g.period_start,
    periodEnd: g.period_end,
    memberCount: g.member_count,
    progressMethod: g.progress_method,
    educationMode: g.education_mode,
    workshopPref: (plans.get(g.id)?.[0] as any)?.workshop_pref ?? {},
    finalSchedule: toFinalSchedule(finalSchedules.get(g.id)?.[0] ?? null),
    coachingSessions: (sessions.get(g.id) ?? []).map((s: any) => ({
      id: s.id,
      sessionNo: s.session_no,
      metAt: s.met_at,
      startTime: s.start_time,
      endTime: s.end_time,
      location: s.location,
      status: s.status,
      proposedBy: s.proposed_by,
      expertNote: s.expert_note,
      confirmedBy: s.confirmed_by,
      confirmedAt: s.confirmed_at,
      createdAt: s.created_at,
    })),
    coachingMemos: (memos.get(g.id) ?? []).map((m: any) => ({
      id: m.id,
      authorRole: m.author_role,
      authorName: m.author_name,
      body: m.body,
      createdAt: m.created_at,
    })),
  }));

  return jsonResponse({ expert: expertPayload, groups: payload });
});
