// 연구모임 대표자 안내 메일 발송 Edge Function.
//
// 큐(study_notifications)는 DB 트리거가 채우고, 이 함수는 관리자가 「안내 발송」 탭에서 승인한
// 행만 Resend API로 보낸다. 정적 배포라 서버가 없어 발송 키(RESEND_API_KEY)를 둘 곳이
// Edge Function 시크릿뿐이다 — 이 프로젝트에서 자동 주입되지 않는 첫 시크릿이다.
//
// 인증: 호출자의 JWT로 is_admin()을 확인한다(관리자 포털에서 functions.invoke가 세션 JWT를 싣는다).
// 발송·큐 갱신은 service role로 한다. 이 함수는 큐 행을 만들지 않는다(트리거의 몫).
//
// 요청:
//   { action: "send", ids: string[] }         — 대기/실패 행을 보내고 성공/실패로 갱신
//   { action: "test", id: string, to: string } — 그 행의 제목·본문을 to로 보내되 행은 갱신하지 않음
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

// ---------------------------------------------------------------------------
// CORS 헬퍼 — study-submit과 같은 이유로 파일 안에 복제한다(대시보드 편집기의 단일 파일 배포).
// _shared/cors.ts 를 고칠 때 여기도 함께 볼 것.
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

const RESEND_ENDPOINT = "https://api.resend.com/emails";
/** Resend 기본 한도가 초당 2건이라 순차 발송 사이에 둔다. */
const SEND_INTERVAL_MS = 600;
/** 한 번의 호출에서 처리할 최대 건수(50건 × 0.6초 = 30초, Edge Function 시간 안). */
const MAX_BATCH = 50;

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("send"),
    ids: z.array(z.string().uuid()).min(1).max(MAX_BATCH),
  }),
  z.object({
    action: z.literal("test"),
    id: z.string().uuid(),
    to: z.string().trim().email(),
  }),
]);

interface NotificationRow {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
}

interface ResendResult {
  ok: boolean;
  messageId: string;
  error: string;
}

/** Resend에 1건 보낸다. 실패는 던지지 않고 사유를 돌려준다(행에 그대로 기록). */
async function sendViaResend(
  apiKey: string,
  from: string,
  replyTo: string,
  to: string,
  subject: string,
  text: string,
  idempotencyKey: string | null
): Promise<ResendResult> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const payload: Record<string, unknown> = { from, to, subject, text };
  if (replyTo) payload.reply_to = replyTo;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      // Resend 오류는 { statusCode, message, name } 형태
      const name = body?.name ? ` ${body.name}` : "";
      const message = body?.message ?? res.statusText;
      return { ok: false, messageId: "", error: `Resend ${res.status}${name}: ${message}` };
    }
    return { ok: true, messageId: String(body?.id ?? ""), error: "" };
  } catch (e) {
    return { ok: false, messageId: "", error: `네트워크 오류: ${e instanceof Error ? e.message : String(e)}` };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return jsonResponse({ error: "입력값을 확인해 주세요." }, 400);
  }
  const body = parsed.data;

  // --------------------------------------------------------------------------
  // 관리자 확인 — 호출자 JWT로 is_admin()을 묻는다. 심사위원(reviewer)은 false.
  // --------------------------------------------------------------------------
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) {
    return jsonResponse({ error: "로그인이 필요합니다." }, 401);
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false }, accessToken: async () => jwt }
  );

  const { data: isAdmin, error: adminError } = await userClient.rpc("is_admin");
  if (adminError || isAdmin !== true) {
    return jsonResponse({ error: "관리자만 발송할 수 있습니다." }, 403);
  }
  const { data: userData } = await userClient.auth.getUser(jwt);
  const approvedBy = userData?.user?.email ?? "";

  // --------------------------------------------------------------------------
  // 발송 설정 — 키가 없으면 행을 건드리지 않고 알린다.
  // --------------------------------------------------------------------------
  const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const fromEmail = Deno.env.get("NOTIFY_FROM_EMAIL") ?? "";
  const replyTo = Deno.env.get("NOTIFY_REPLY_TO") ?? "";
  if (!apiKey || !fromEmail) {
    return jsonResponse(
      {
        error:
          "발송 설정이 없습니다. Edge Function 시크릿 RESEND_API_KEY와 NOTIFY_FROM_EMAIL을 등록해 주세요. (README 「Edge Function 배포」 참고)",
      },
      400
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // --------------------------------------------------------------------------
  // 테스트 발송 — 행 상태를 바꾸지 않는다. 멱등 키도 붙이지 않는다(같은 행을 여러 번 시험 발송할 수 있게).
  // --------------------------------------------------------------------------
  if (body.action === "test") {
    const { data: row, error } = await supabase
      .from("study_notifications")
      .select("id, recipient, subject, body, status")
      .eq("id", body.id)
      .maybeSingle();
    if (error || !row) {
      return jsonResponse({ error: "대상 안내를 찾을 수 없습니다." }, 404);
    }
    const r = row as NotificationRow;
    const result = await sendViaResend(apiKey, fromEmail, replyTo, body.to, `[테스트] ${r.subject}`, r.body, null);
    if (!result.ok) {
      return jsonResponse({ error: result.error }, 502);
    }
    return jsonResponse({ ok: true, messageId: result.messageId });
  }

  // --------------------------------------------------------------------------
  // 승인 발송 — 대기/실패 행만. 성공/취소 행은 건너뛰고 결과에 사유를 남긴다.
  // --------------------------------------------------------------------------
  const { data: rows, error: rowsError } = await supabase
    .from("study_notifications")
    .select("id, recipient, subject, body, status")
    .in("id", body.ids);
  if (rowsError) {
    return jsonResponse({ error: "대상 안내를 불러오지 못했습니다." }, 500);
  }

  const byId = new Map((rows as NotificationRow[]).map((r) => [r.id, r]));
  const results: { id: string; ok: boolean; error: string }[] = [];
  let sentCount = 0;

  for (const id of body.ids) {
    const row = byId.get(id);
    if (!row) {
      results.push({ id, ok: false, error: "대상 안내를 찾을 수 없습니다." });
      continue;
    }
    if (row.status !== "대기" && row.status !== "실패") {
      results.push({ id, ok: false, error: `이미 ${row.status} 상태입니다.` });
      continue;
    }
    if (!row.recipient.trim()) {
      results.push({ id, ok: false, error: "수신자 이메일이 비어 있습니다." });
      continue;
    }

    if (sentCount > 0) await sleep(SEND_INTERVAL_MS);
    sentCount += 1;

    // 같은 행의 재시도끼리 구분되도록 시각을 섞는다(Resend는 같은 키를 24시간 동안 같은 요청으로 본다).
    const idempotencyKey = `study-notify:${row.id}:${Date.now()}`;
    const result = await sendViaResend(
      apiKey, fromEmail, replyTo, row.recipient.trim(), row.subject, row.body, idempotencyKey
    );

    const patch = result.ok
      ? {
          status: "성공",
          sent_at: new Date().toISOString(),
          approved_by: approvedBy,
          provider_message_id: result.messageId,
          error_message: "",
        }
      : { status: "실패", approved_by: approvedBy, error_message: result.error };

    const { error: updateError } = await supabase
      .from("study_notifications")
      .update(patch)
      .eq("id", row.id);

    if (updateError) {
      console.error("[study-notify] 상태 갱신 실패:", updateError);
    }
    results.push({ id, ok: result.ok, error: result.error });
  }

  return jsonResponse({ ok: true, results });
});
