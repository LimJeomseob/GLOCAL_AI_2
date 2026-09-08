"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import { formatDateTime } from "@/lib/format";
import { addReviewer, fetchAdminUsers, removeReviewer } from "@/lib/adminUsers";
import type { AdminRole, AdminUserRow } from "@/lib/types";

const ROLE_LABELS: Record<AdminRole, string> = {
  superadmin: "총괄관리자",
  admin: "관리자",
  reviewer: "심사위원",
};

/**
 * 관리자 탭 — 심사위원 관리(총괄관리자 전용).
 *
 * 구글 계정 이메일을 admin_users에 role='reviewer'로 넣는 것이 전부다. 등록된 계정은
 * 관리자 포털에 로그인하면 「계획서 심사」 탭만 보이고, 계획서 열람과 자기 채점 저장이 된다
 * (0014의 is_reviewer() / study_reviews_own). 그 밖의 관리자 데이터에는 닿지 않는다.
 *
 * 관리자(admin/superadmin) 행은 참고용으로만 보여 준다 — 화면에서 만들거나 지울 수 없다.
 */
export function ReviewersTable({ adminEmail }: { adminEmail: string }) {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchAdminUsers());
    } catch (e) {
      setError(e instanceof Error ? e.message : "계정 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reviewers = useMemo(() => rows.filter((r) => r.role === "reviewer"), [rows]);
  const admins = useMemo(() => rows.filter((r) => r.role !== "reviewer"), [rows]);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice(null);
    setError(null);
    setEmailError(undefined);

    if (!email.trim()) {
      setEmailError("구글 계정 이메일을 입력해 주세요.");
      return;
    }

    setBusy(true);
    const message = await addReviewer(email, adminEmail);
    setBusy(false);

    if (message) {
      setEmailError(message);
      return;
    }
    setNotice(`${email.trim().toLowerCase()} 계정을 심사위원으로 등록했습니다.`);
    setEmail("");
    await load();
  }

  async function handleRemove(row: AdminUserRow) {
    if (
      !window.confirm(
        `${row.email} 계정의 심사위원 권한을 삭제할까요?\n삭제하면 이 계정으로는 관리자 포털에 로그인할 수 없습니다. 이미 저장한 채점은 남습니다.`
      )
    )
      return;

    setNotice(null);
    setError(null);
    setBusy(true);
    const message = await removeReviewer(row.id);
    setBusy(false);

    if (message) {
      setError(message);
      return;
    }
    setNotice(`${row.email} 계정을 심사위원에서 삭제했습니다.`);
    await load();
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-brand sm:text-2xl">심사위원 관리</h1>
        <p className="mt-1 text-sm text-slate-600">
          연구모임 계획서를 심사할 심사위원의 구글 계정을 등록합니다.
        </p>
      </div>

      <div className="rounded-xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm leading-relaxed text-sky-900">
        등록한 구글 계정으로 관리자 포털에 로그인하면 <strong>「계획서 심사」 탭만</strong> 보이며,
        계획서 열람과 채점 저장이 가능합니다. 특강 신청자·설문·전문가 신청 등 다른 관리자 데이터에는
        접근할 수 없습니다.
        <br />
        심사위원은 <strong>자기 채점만</strong> 보고 고칠 수 있고, 다른 심사위원의 점수는 보이지
        않습니다.
      </div>

      {notice && (
        <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      {/* 등록 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-bold text-slate-800">심사위원 등록</h2>
        <form onSubmit={handleAdd} noValidate className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex-1">
            <FormField
              label="구글 계정 이메일"
              required
              error={emailError}
              hint="심사위원이 Google 로그인에 사용하는 이메일을 그대로 입력하세요. 대소문자는 구분하지 않습니다."
            >
              {(p) => (
                <input
                  {...p}
                  type="email"
                  className={inputBaseClass}
                  value={email}
                  autoComplete="off"
                  placeholder="reviewer@gmail.com"
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </FormField>
          </div>
          <Button type="submit" variant="primary" disabled={busy} className="sm:mt-7">
            {busy ? "처리 중..." : "심사위원 등록"}
          </Button>
        </form>
      </section>

      {/* 심사위원 목록 */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-sm font-bold text-slate-800">등록된 심사위원</h2>
          <span className="text-xs text-slate-500">{reviewers.length}명</span>
        </div>
        {loading ? (
          <p className="border-t border-slate-200 px-5 py-6 text-sm text-slate-500" role="status">
            불러오는 중...
          </p>
        ) : reviewers.length === 0 ? (
          <p className="border-t border-slate-200 px-5 py-6 text-sm text-slate-500">
            등록된 심사위원이 없습니다. 위에서 구글 계정 이메일을 등록해 주세요.
          </p>
        ) : (
          <div className="overflow-x-auto border-t border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">구글 계정</th>
                  <th scope="col" className="px-3 py-3 font-semibold">등록일시</th>
                  <th scope="col" className="px-3 py-3 font-semibold">등록자</th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    <span className="sr-only">삭제</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reviewers.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-3 font-medium text-slate-800">{r.email}</td>
                    <td className="px-3 py-3 text-slate-600">{formatDateTime(r.created_at)}</td>
                    <td className="px-3 py-3 text-xs text-slate-500">{r.created_by || "—"}</td>
                    <td className="px-3 py-3 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => handleRemove(r)}
                        className="!border-red-300 !text-red-700 hover:!bg-red-50"
                      >
                        삭제
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 관리자 계정 — 참고용, 화면에서 수정 불가 */}
      <details className="rounded-xl border border-slate-200 bg-white">
        <summary className="cursor-pointer px-5 py-4 text-sm font-bold text-slate-800">
          관리자 계정 ({admins.length}명)
        </summary>
        <div className="border-t border-slate-200">
          <p className="px-5 py-3 text-xs leading-relaxed text-slate-500">
            운영 관리자·총괄관리자 계정은 이 화면에서 추가·삭제할 수 없습니다. 권한 변경이 필요하면
            데이터베이스에서 직접 처리합니다.
          </p>
          <ul className="divide-y divide-slate-100" role="list">
            {admins.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <span className="font-medium text-slate-800">{r.email}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {ROLE_LABELS[r.role]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  );
}
