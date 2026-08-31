"use client";

import { StudyReviewPanel } from "@/components/admin/StudyReviewPanel";
import { useAdminSession } from "@/lib/useAdminSession";

/**
 * 관리자 탭 B. 계획서 심사.
 * 채점 행은 RLS가 reviewer_email = JWT 이메일로 격리하므로, 로그인한 계정의 이메일을 그대로 넘긴다.
 */
export default function AdminStudyReviewPage() {
  const session = useAdminSession();

  if (session.status !== "authorized") {
    return (
      <p role="status" className="py-10 text-center text-sm text-slate-500">
        로그인 확인 중...
      </p>
    );
  }

  return <StudyReviewPanel reviewerEmail={session.admin.email} />;
}
