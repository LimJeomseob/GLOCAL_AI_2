"use client";

import { ReviewersTable } from "@/components/admin/ReviewersTable";
import { useAdminSession } from "@/lib/useAdminSession";

/**
 * 관리자 탭 — 심사위원 관리. 총괄관리자(superadmin) 전용.
 * 실제 보호는 RLS(0021)가 하고, 여기서는 탭을 감춘 뒤 URL로 들어온 경우를 안내한다.
 */
export default function AdminReviewersPage() {
  const session = useAdminSession();
  if (session.status !== "authorized") return null;

  if (session.admin.role !== "superadmin") {
    return (
      <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm font-medium text-amber-800">
        심사위원 관리는 총괄관리자만 이용할 수 있습니다.
      </div>
    );
  }

  return <ReviewersTable adminEmail={session.admin.email} />;
}
