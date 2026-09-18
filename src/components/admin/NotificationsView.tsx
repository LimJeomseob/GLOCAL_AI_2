"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { inputBaseClass } from "@/components/ui/FormField";
import { formatDateTime } from "@/lib/format";
import { useAdminSession } from "@/lib/useAdminSession";
import {
  fetchStudyNotificationTemplates,
  fetchStudyNotifications,
  sendStudyNotificationTest,
  sendStudyNotifications,
  updateStudyNotification,
  updateStudyNotificationTemplate,
  updateStudyNotificationsStatus,
} from "@/lib/studyAdmin";
import {
  STUDY_NOTIFICATION_STAGES,
  STUDY_NOTIFICATION_STATUSES,
  STUDY_NOTIFICATION_TEMPLATE_LABELS,
  STUDY_NOTIFICATION_VARIABLES,
  STUDY_STATUS_LABELS,
  isStudyGroupStatus,
  type StudyNotificationStatus,
  type StudyNotificationTemplate,
  type StudyNotificationWithGroup,
} from "@/lib/studyTypes";

const ALL = "__all__";
/** Edge Function이 한 번에 받는 최대 건수(study-notify의 MAX_BATCH와 같게) */
const SEND_BATCH = 50;

const STATUS_CLASSES: Record<StudyNotificationStatus, string> = {
  대기: "bg-amber-100 text-amber-800",
  성공: "bg-emerald-100 text-emerald-800",
  실패: "bg-rose-100 text-rose-800",
  취소: "bg-slate-200 text-slate-500",
};

function triggerLabel(status: string): string {
  return isStudyGroupStatus(status) ? STUDY_STATUS_LABELS[status] : status;
}

/**
 * 관리자 탭 — 대표자 안내 메일 큐.
 *
 * 큐 행은 DB 트리거가 상태 전이 때 자동으로 만들고(제목·본문까지 렌더링), 여기서 관리자가
 * 내용을 확인·수정한 뒤 승인 발송한다. 실제 발송은 Edge Function study-notify(Resend)가 하므로
 * 발송 뒤에는 목록을 다시 읽어 서버가 기록한 상태를 보여준다.
 */
export function NotificationsView() {
  const session = useAdminSession();
  const adminEmail = session.status === "authorized" ? session.admin.email : "";

  const [rows, setRows] = useState<StudyNotificationWithGroup[]>([]);
  const [templates, setTemplates] = useState<StudyNotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [statusFilter, setStatusFilter] = useState<string>("대기");
  const [stageFilter, setStageFilter] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [detailId, setDetailId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ subject: "", body: "", recipient: "" });
  const [testTo, setTestTo] = useState("");
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailNotice, setDetailNotice] = useState<string | null>(null);
  const detailTitleId = useId();

  const [templateDrafts, setTemplateDrafts] = useState<Record<string, StudyNotificationTemplate>>({});
  const [templateError, setTemplateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, tpl] = await Promise.all([fetchStudyNotifications(), fetchStudyNotificationTemplates()]);
      setRows(list);
      setTemplates(tpl);
      setTemplateDrafts(Object.fromEntries(tpl.map((t) => [t.stage, t])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "안내 발송 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (adminEmail && !testTo) setTestTo(adminEmail);
  }, [adminEmail, testTo]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== ALL && r.status !== statusFilter) return false;
      if (stageFilter !== ALL && r.stage !== stageFilter) return false;
      if (!keyword) return true;
      return [r.group_code, r.group_name, r.leader_name, r.recipient, r.subject]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [rows, statusFilter, stageFilter, search]);

  const detail = rows.find((r) => r.id === detailId) ?? null;
  const pendingCount = rows.filter((r) => r.status === "대기").length;
  const failedCount = rows.filter((r) => r.status === "실패").length;

  /** 발송·취소는 화면에 보이는 행 중 선택된 것만 대상으로 한다(연구모임 관리와 같은 규칙). */
  const selectedVisible = useMemo(
    () => filtered.filter((r) => selected.has(r.id)),
    [filtered, selected]
  );
  const allVisibleSelected = filtered.length > 0 && selectedVisible.length === filtered.length;
  const sendable = selectedVisible.filter((r) => r.status === "대기" || r.status === "실패");

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filtered.forEach((r) => next.delete(r.id));
      else filtered.forEach((r) => next.add(r.id));
      return next;
    });
  }

  /** 승인 발송. 50건씩 나눠 부르고, 서버가 기록한 결과를 다시 읽는다. */
  async function sendIds(ids: string[]): Promise<{ ok: number; failed: number; error: string | null }> {
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < ids.length; i += SEND_BATCH) {
      const { results, error: message } = await sendStudyNotifications(ids.slice(i, i + SEND_BATCH));
      if (message) return { ok, failed, error: message };
      ok += results.filter((r) => r.ok).length;
      failed += results.filter((r) => !r.ok).length;
    }
    return { ok, failed, error: null };
  }

  async function handleSendSelected() {
    if (sendable.length === 0) return;
    if (
      !window.confirm(
        `선택한 ${sendable.length}건을 대표자에게 발송합니다.\n` +
          `${sendable
            .slice(0, 10)
            .map((r) => `· ${r.group_code} ${r.stage} → ${r.recipient}`)
            .join("\n")}${sendable.length > 10 ? `\n… 외 ${sendable.length - 10}건` : ""}\n\n계속할까요?`
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await sendIds(sendable.map((r) => r.id));
    setBusy(false);
    setSelected(new Set());
    await load();

    if (result.error) {
      setError(result.error);
      return;
    }
    setNotice(`발송 ${result.ok}건 성공${result.failed > 0 ? ` · ${result.failed}건 실패(사유는 표의 상태 열 참고)` : ""}`);
  }

  async function handleCancelSelected() {
    const targets = selectedVisible.filter((r) => r.status === "대기" || r.status === "실패");
    if (targets.length === 0) return;
    if (!window.confirm(`선택한 ${targets.length}건을 보내지 않고 취소합니다. 계속할까요?`)) return;

    setBusy(true);
    setError(null);
    setNotice(null);
    const message = await updateStudyNotificationsStatus(
      targets.map((r) => r.id),
      "취소"
    );
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    setSelected(new Set());
    setRows((prev) => prev.map((r) => (targets.some((t) => t.id === r.id) ? { ...r, status: "취소" } : r)));
    setNotice(`${targets.length}건 취소했습니다.`);
  }

  function openDetail(row: StudyNotificationWithGroup) {
    setDetailId(row.id);
    setDraft({ subject: row.subject, body: row.body, recipient: row.recipient });
    setDetailError(null);
    setDetailNotice(null);
  }

  function closeDetail() {
    setDetailId(null);
    setDetailError(null);
    setDetailNotice(null);
  }

  const detailDirty =
    detail !== null &&
    (draft.subject !== detail.subject || draft.body !== detail.body || draft.recipient !== detail.recipient);
  const detailEditable = detail !== null && (detail.status === "대기" || detail.status === "실패");

  async function handleDetailSave(): Promise<boolean> {
    if (!detail || !detailDirty) return true;
    const recipient = draft.recipient.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      setDetailError("수신자 이메일 형식이 올바르지 않습니다.");
      return false;
    }
    setBusy(true);
    setDetailError(null);
    const patch = { subject: draft.subject.trim(), body: draft.body, recipient };
    const message = await updateStudyNotification(detail.id, patch);
    setBusy(false);
    if (message) {
      setDetailError(message);
      return false;
    }
    setRows((prev) => prev.map((r) => (r.id === detail.id ? { ...r, ...patch } : r)));
    setDetailNotice("저장했습니다.");
    return true;
  }

  async function handleDetailSend() {
    if (!detail) return;
    if (!(await handleDetailSave())) return;
    if (!window.confirm(`${draft.recipient.trim()} 주소로 발송합니다. 계속할까요?`)) return;

    setBusy(true);
    setDetailError(null);
    const result = await sendIds([detail.id]);
    setBusy(false);
    await load();

    if (result.error) {
      setDetailError(result.error);
      return;
    }
    if (result.failed > 0) {
      setDetailError("발송에 실패했습니다. 표의 상태 열에서 사유를 확인해 주세요.");
      return;
    }
    setNotice(`${detail.group_code} ${detail.stage} 안내를 발송했습니다.`);
    closeDetail();
  }

  async function handleDetailTest() {
    if (!detail) return;
    if (!(await handleDetailSave())) return;
    const to = testTo.trim();
    if (!to) {
      setDetailError("테스트 수신 주소를 입력해 주세요.");
      return;
    }
    setBusy(true);
    setDetailError(null);
    const message = await sendStudyNotificationTest(detail.id, to);
    setBusy(false);
    if (message) {
      setDetailError(message);
      return;
    }
    setDetailNotice(`${to} 주소로 테스트 발송했습니다. (행 상태는 바뀌지 않습니다)`);
  }

  function updateTemplateDraft(stage: string, patch: Partial<StudyNotificationTemplate>) {
    setTemplateDrafts((prev) => ({ ...prev, [stage]: { ...prev[stage], ...patch } }));
  }

  async function handleTemplateSave(stage: StudyNotificationTemplate["stage"]) {
    const d = templateDrafts[stage];
    if (!d) return;
    setBusy(true);
    setTemplateError(null);
    const message = await updateStudyNotificationTemplate(stage, {
      subject: d.subject,
      body: d.body,
      enabled: d.enabled,
    });
    setBusy(false);
    if (message) {
      setTemplateError(message);
      return;
    }
    setTemplates((prev) => prev.map((t) => (t.stage === stage ? { ...t, ...d } : t)));
    setNotice(`「${STUDY_NOTIFICATION_TEMPLATE_LABELS[stage]}」 템플릿을 저장했습니다. 이후 생성되는 안내부터 적용됩니다.`);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-brand sm:text-2xl">안내 발송</h1>
          <p className="mt-1 text-sm text-slate-600">
            신청 접수·심사 결과·이수 확정 시 자동으로 준비된 대표자 안내 메일을 확인하고 승인해 발송합니다.{" "}
            <strong className="text-slate-800">대기 {pendingCount}건</strong>
            {failedCount > 0 && (
              <>
                {" "}
                · <strong className="text-rose-700">실패 {failedCount}건</strong>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy || loading}>
            새로고침
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleCancelSelected()}
            disabled={busy || loading || sendable.length === 0}
          >
            선택 취소 ({sendable.length})
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleSendSelected()}
            disabled={busy || loading || sendable.length === 0}
          >
            선택 발송 ({sendable.length})
          </Button>
        </div>
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

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          상태
          <select className={inputBaseClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value={ALL}>전체</option>
            {STUDY_NOTIFICATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          단계
          <select className={inputBaseClass} value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
            <option value={ALL}>전체</option>
            {STUDY_NOTIFICATION_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          검색 (접수번호·모임명·대표자·수신자·제목)
          <input type="search" className={inputBaseClass} value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      {loading ? (
        <p role="status" className="py-10 text-center text-sm text-slate-500">
          불러오는 중...
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th scope="col" className="px-3 py-3 font-semibold">
                  <input
                    type="checkbox"
                    aria-label="목록 전체 선택"
                    className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent"
                    checked={allVisibleSelected}
                    disabled={filtered.length === 0}
                    onChange={toggleAllVisible}
                  />
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">모임</th>
                <th scope="col" className="px-3 py-3 font-semibold">단계</th>
                <th scope="col" className="px-3 py-3 font-semibold">수신자</th>
                <th scope="col" className="px-3 py-3 font-semibold">제목</th>
                <th scope="col" className="px-3 py-3 font-semibold">생성일</th>
                <th scope="col" className="px-3 py-3 font-semibold">상태</th>
                <th scope="col" className="px-3 py-3 font-semibold">상세</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                    {rows.length === 0
                      ? "준비된 안내가 없습니다. 신청이 제출되거나 선발·이수가 확정되면 자동으로 쌓입니다."
                      : "조건에 맞는 안내가 없습니다."}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 align-top last:border-b-0">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label={`${r.group_code} ${r.stage} 선택`}
                        className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent"
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <span className="block font-mono text-xs text-slate-600">{r.group_code}</span>
                      <span className="block font-semibold text-slate-800">{r.group_name}</span>
                      <span className="block text-xs text-slate-500">{r.leader_name}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="block text-slate-800">{r.stage}</span>
                      <span className="block text-xs text-slate-500">{triggerLabel(r.trigger_status)}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{r.recipient || <span className="text-rose-700">(없음)</span>}</td>
                    <td className="px-3 py-3 text-slate-700">{r.subject}</td>
                    <td className="px-3 py-3 text-xs text-slate-500">{formatDateTime(r.created_at)}</td>
                    <td className="px-3 py-3">
                      <span
                        className={clsx(
                          "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold",
                          STATUS_CLASSES[r.status]
                        )}
                      >
                        {r.status}
                      </span>
                      {r.sent_at && (
                        <span className="mt-1 block text-xs text-slate-500">{formatDateTime(r.sent_at)}</span>
                      )}
                      {r.error_message && (
                        <span className="mt-1 block max-w-[14rem] text-xs text-rose-700" title={r.error_message}>
                          {r.error_message}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Button variant="ghost" size="sm" onClick={() => openDetail(r)}>
                        보기
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 템플릿 — 이후 생성되는 안내에 적용. 이미 큐에 있는 행은 상세에서 개별 수정한다. */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-bold text-brand">안내 템플릿</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          상태가 바뀌는 순간 아래 템플릿으로 제목·본문이 만들어져 대기 목록에 들어갑니다. 치환 변수:{" "}
          {STUDY_NOTIFICATION_VARIABLES.map((v) => (
            <code key={v} className="mr-1 rounded bg-slate-100 px-1 py-0.5 text-[11px] text-slate-700">
              {`{${v}}`}
            </code>
          ))}
          사용 여부를 끄면 그 단계는 큐에 들어가지 않습니다.
        </p>
        {templateError && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-600">
            {templateError}
          </p>
        )}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {templates.map((t) => {
            const d = templateDrafts[t.stage] ?? t;
            const dirty = d.subject !== t.subject || d.body !== t.body || d.enabled !== t.enabled;
            return (
              <div key={t.stage} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-800">{STUDY_NOTIFICATION_TEMPLATE_LABELS[t.stage]}</h3>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent"
                      checked={d.enabled}
                      onChange={(e) => updateTemplateDraft(t.stage, { enabled: e.target.checked })}
                    />
                    사용
                  </label>
                </div>
                <input
                  type="text"
                  aria-label={`${STUDY_NOTIFICATION_TEMPLATE_LABELS[t.stage]} 제목`}
                  className={inputBaseClass}
                  value={d.subject}
                  onChange={(e) => updateTemplateDraft(t.stage, { subject: e.target.value })}
                />
                <textarea
                  aria-label={`${STUDY_NOTIFICATION_TEMPLATE_LABELS[t.stage]} 본문`}
                  rows={7}
                  className={`${inputBaseClass} resize-y leading-relaxed`}
                  value={d.body}
                  onChange={(e) => updateTemplateDraft(t.stage, { body: e.target.value })}
                />
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleTemplateSave(t.stage)}
                    disabled={busy || !dirty}
                  >
                    템플릿 저장
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 상세 — 내용 확인·수정, 테스트 발송, 승인 발송 */}
      <Modal open={Boolean(detail)} onClose={closeDetail} titleId={detailTitleId} size="lg">
        {detail && (
          <>
            <h2 id={detailTitleId} className="text-lg font-bold text-brand">
              {detail.group_code} · {detail.stage}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span
                className={clsx(
                  "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold",
                  STATUS_CLASSES[detail.status]
                )}
              >
                {detail.status}
              </span>
              <span>
                {detail.group_name} · 대표자 {detail.leader_name} · 전이 {triggerLabel(detail.trigger_status)} ·{" "}
                생성 {formatDateTime(detail.created_at)}
              </span>
            </div>
            {detail.sent_at && (
              <p className="mt-1 text-xs text-slate-500">
                발송 {formatDateTime(detail.sent_at)}
                {detail.approved_by && ` · 승인 ${detail.approved_by}`}
                {detail.provider_message_id && ` · 메시지 ID ${detail.provider_message_id}`}
              </p>
            )}
            {detail.error_message && (
              <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {detail.error_message}
              </p>
            )}

            {detailNotice && (
              <p role="status" className="mt-3 text-sm font-medium text-emerald-700">
                {detailNotice}
              </p>
            )}
            {detailError && (
              <p role="alert" className="mt-3 text-sm font-medium text-red-600">
                {detailError}
              </p>
            )}

            <div className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                수신자
                <input
                  type="email"
                  className={inputBaseClass}
                  value={draft.recipient}
                  disabled={!detailEditable}
                  onChange={(e) => setDraft((p) => ({ ...p, recipient: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                제목
                <input
                  type="text"
                  className={inputBaseClass}
                  value={draft.subject}
                  disabled={!detailEditable}
                  onChange={(e) => setDraft((p) => ({ ...p, subject: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                본문
                <textarea
                  rows={12}
                  className={`${inputBaseClass} resize-y leading-relaxed`}
                  value={draft.body}
                  disabled={!detailEditable}
                  onChange={(e) => setDraft((p) => ({ ...p, body: e.target.value }))}
                />
              </label>
            </div>

            {detailEditable && (
              <div className="mt-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-end">
                <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-slate-600">
                  테스트 수신 주소 (행 상태는 바뀌지 않습니다)
                  <input
                    type="email"
                    className={inputBaseClass}
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                  />
                </label>
                <Button variant="outline" size="sm" onClick={() => void handleDetailTest()} disabled={busy}>
                  테스트 발송
                </Button>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={closeDetail} disabled={busy}>
                닫기
              </Button>
              {detailEditable && (
                <>
                  <Button variant="outline" onClick={() => void handleDetailSave()} disabled={busy || !detailDirty}>
                    저장
                  </Button>
                  <Button variant="primary" onClick={() => void handleDetailSend()} disabled={busy}>
                    {detail.status === "실패" ? "재발송" : "발송"}
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
