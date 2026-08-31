import { FunctionsHttpError } from "@supabase/supabase-js";

/**
 * Edge Function이 비2xx로 응답했을 때 서버가 보낸 { error } 메시지를 꺼낸다.
 * supabase-js는 비2xx를 FunctionsHttpError로 감싸고 본문을 error.context에 남기므로,
 * 이 과정을 거치지 않으면 사용자에게 "Edge Function returned a non-2xx status code"만 보인다.
 */
export async function extractFunctionError(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body?.error) return body.error as string;
    } catch {
      // 본문을 읽을 수 없으면 기본 메시지 사용
    }
  }
  return fallback;
}
