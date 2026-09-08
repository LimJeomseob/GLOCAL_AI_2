"use client";

import { createSupabaseBrowserClient } from "./supabase/client";
import { TABLES } from "./db-tables";
import { emailSchema } from "./validation";
import type { AdminUserRow } from "./types";

/**
 * 심사위원 관리 탭(총괄관리자 전용)의 데이터 접근.
 *
 * admin_users는 로그인 allowlist 그 자체라 쓰기를 넓게 열지 않는다. RLS(0021)가
 * superadmin에게만 전체 읽기와 role='reviewer' 행의 insert/delete를 허용하므로,
 * 여기서는 role을 'reviewer'로 못 박아 보내고 그 밖의 행은 읽기만 한다.
 */

export async function fetchAdminUsers(): Promise<AdminUserRow[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from(TABLES.ADMIN_USERS)
    .select("id, email, role, created_at, created_by")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as AdminUserRow[];
}

/**
 * 구글 계정 이메일을 심사위원으로 등록한다. 성공하면 null, 실패하면 화면에 보여줄 메시지.
 * 이메일 정규화(소문자·공백 제거)는 DB 트리거가 하므로 여기서는 형식만 확인한다.
 */
export async function addReviewer(rawEmail: string, createdBy: string): Promise<string | null> {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "이메일 형식이 올바르지 않습니다.";

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from(TABLES.ADMIN_USERS).insert({
    email: parsed.data.toLowerCase(),
    role: "reviewer",
    created_by: createdBy,
  });

  if (!error) return null;
  // 23505 = unique_violation. 관리자(admin/superadmin)로 이미 있는 계정도 같은 오류로 걸린다.
  if (error.code === "23505") return "이미 등록된 계정입니다. 아래 목록을 확인해 주세요.";
  // 42501 = insufficient_privilege (RLS). 총괄관리자가 아닌 세션이 우회 진입한 경우.
  if (error.code === "42501") return "심사위원 등록 권한이 없습니다. 총괄관리자 계정으로 로그인해 주세요.";
  return error.message;
}

/** 심사위원 행을 삭제한다. RLS가 role='reviewer' 행만 허용하므로 관리자 행은 지워지지 않는다. */
export async function removeReviewer(id: string): Promise<string | null> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from(TABLES.ADMIN_USERS).delete().eq("id", id);
  if (!error) return null;
  if (error.code === "42501") return "심사위원 삭제 권한이 없습니다. 총괄관리자 계정으로 로그인해 주세요.";
  return error.message;
}
