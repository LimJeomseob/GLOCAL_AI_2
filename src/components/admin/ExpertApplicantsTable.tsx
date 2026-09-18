"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { inputBaseClass } from "@/components/ui/FormField";
import { ExpertApplicationFormModal } from "@/components/admin/ExpertApplicationFormModal";
import { exportRowsAsCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";
import {
  deleteStudyExpertApplications,
  fetchStudyExpertApplications,
  fetchStudyRounds,
  updateStudyExpertApplication,
} from "@/lib/studyAdmin";
import { STUDY_EXPERT_HEADCOUNT } from "@/lib/studyGroupConstants";
import {
  STUDY_EXPERT_STATUSES,
  STUDY_EXPERT_STATUS_LABELS,
  type StudyExpertApplication,
  type StudyExpertStatus,
  type StudyRound,
} from "@/lib/studyTypes";

const ALL = "__all__";

const STATUS_CLASSES: Record<StudyExpertStatus, string> = {
  submitted: "bg-blue-100 text-blue-800",
  selected: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  cancelled: "bg-slate-200 text-slate-500",
};

/**
 * 관리자 탭 — 교내 AI활용 전문가 신청자.
 * StudyGroupsTable의 패턴(회차 선택 → 필터 → 행 단위 상태 변경 → 로컬 갱신)을 따른다.
 * 선정은 별도 심사 집계 없이 담당자가 행 단위로 확정한다(모집 5명 내외, 서면심사 규정 없음).
 */
export function ExpertApplicantsTable() {
  const [rounds, setRounds] = useState<StudyRound[]>([]);
  const [roundId, setRoundId] = useState<string>("");
  const [rows, setRows] = useState<StudyExpertApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [noteDraft, setNoteDraft] = useState("");
  const detailTitleId = useId();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await fetchStudyRounds();
        if (!active) return;
        setRounds(data);
        setRoundId((prev) => prev || data[0]?.id || "");
        if (data.length === 0) setLoading(false);
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : "모집회차를 불러오지 못했습니다.");
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchStudyExpertApplications(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "전문가 신청을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSelected(new Set());
    if (roundId) void load(roundId);
  }, [roundId, load]);

  const round = rounds.find((r) => r.id === roundId) ?? null;

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== ALL && r.status !== statusFilter) return false;
      if (categoryFilter !== ALL && !r.categories.includes(categoryFilter as never)) return false;
      if (!keyword) return true;
      return [r.code, r.name, r.affiliation, r.id_number, r.ai_tools]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [rows, statusFilter, categoryFilter, search]);

  const selectedCount = rows.filter((r) => r.status === "selected").length;
  const detail = rows.find((r) => r.id === detailId) ?? null;
  const editTarget = rows.find((r) => r.id === editId) ?? null;

  /**
   * 삭제는 화면에 보이는 행만 대상으로 한다 — 필터를 좁힌 뒤 「전체 선택」을 눌렀는데
   * 필터 밖의 선택이 남아 함께 지워지면 담당자가 삭제 범위를 예측할 수 없다.
   */
  const selectedVisible = useMemo(
    () => filtered.filter((r) => selected.has(r.id)),
    [filtered, selected]
  );
  const allVisibleSelected = filtered.length > 0 && selectedVisible.length === filtered.length;

  function openDetail(row: StudyExpertApplication) {
    setDetailId(row.id);
    setNoteDraft(row.note);
  }

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

  async function handleDelete() {
    const targets = selectedVisible;
    if (targets.length === 0) return;
    if (
      !window.confirm(
        `선택한 ${targets.length}건을 삭제합니다.\n` +
          `${targets.map((r) => `· ${r.code} ${r.name}`).join("\n")}\n\n` +
          "되돌릴 수 없습니다. 계속할까요?"
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    const ids = targets.map((r) => r.id);
    const message = await deleteStudyExpertApplications(ids);
    setBusy(false);

    if (message) {
      setError(message);
      return;
    }
    const removed = new Set(ids);
    setRows((prev) => prev.filter((r) => !removed.has(r.id)));
    setSelected(new Set());
    if (detailId && removed.has(detailId)) setDetailId(null);
    setNotice(`${targets.length}건 삭제했습니다.`);
  }

  async function handleStatusChange(id: string, status: StudyExpertStatus) {
    setBusy(true);
    setError(null);
    const message = await updateStudyExpertApplication(id, { status });
    setBusy(false);

    if (message) {
      setError(message);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  async function handleNoteSave() {
    if (!detail) return;
    setBusy(true);
    setError(null);
    const message = await updateStudyExpertApplication(detail.id, { note: noteDraft.trim() });
    setBusy(false);

    if (message) {
      setError(message);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === detail.id ? { ...r, note: noteDraft.trim() } : r)));
  }

  function handleExport() {
    exportRowsAsCsv(
      filtered,
      [
        { header: "접수번호", accessor: (r) => r.code },
        { header: "성명", accessor: (r) => r.name },
        { header: "소속", accessor: (r) => r.affiliation },
        { header: "직급", accessor: (r) => r.position },
        { header: "직번", accessor: (r) => r.id_number },
        { header: "연락처", accessor: (r) => r.phone },
        { header: "이메일", accessor: (r) => r.email },
        { header: "교원구분", accessor: (r) => (r.is_nontenured ? "비전임" : "전임") },
        { header: "지도카테고리", accessor: (r) => r.categories.join("/") },
        { header: "주요AI도구", accessor: (r) => r.ai_tools },
        { header: "경험", accessor: (r) => r.experience },
        { header: "상태", accessor: (r) => STUDY_EXPERT_STATUS_LABELS[r.status] },
        { header: "메모", accessor: (r) => r.note },
        { header: "신청일", accessor: (r) => formatDateTime(r.created_at) },
        { header: "최종수정", accessor: (r) => formatDateTime(r.updated_at) },
      ],
      `전문가신청자_${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  if (rounds.length === 0 && !loading && !error) {
    return (
      <p role="status" className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
        등록된 모집회차가 없습니다. 마이그레이션(0016) 시드를 적용해 주세요.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-brand sm:text-2xl">전문가 신청자</h1>
          <p className="mt-1 text-sm text-slate-600">
            교내 AI활용 전문가(연구모임 코칭 강사) 신청 접수·선정. 모집 {STUDY_EXPERT_HEADCOUNT}명 내외 ·{" "}
            <strong className="text-slate-800">현재 선정 {selectedCount}명</strong> / 접수 {rows.length}명
          </p>
          {round && (
            <p className="mt-1 text-xs text-slate-500">
              신청기간 ·{" "}
              {round.expert_apply_open_at && round.expert_apply_close_at
                ? `${formatDateTime(round.expert_apply_open_at)} ~ ${formatDateTime(round.expert_apply_close_at)}`
                : "이 회차는 전문가 모집 구간이 설정되지 않았습니다(0019 마이그레이션 확인)."}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCreateOpen(true)}
            disabled={loading || !round}
          >
            신청자 추가
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || filtered.length === 0}>
            엑셀 내보내기 ({filtered.length})
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => void handleDelete()}
            disabled={busy || loading || selectedVisible.length === 0}
          >
            선택 삭제 ({selectedVisible.length})
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

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          모집회차
          <select className={inputBaseClass} value={roundId} onChange={(e) => setRoundId(e.target.value)}>
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          상태
          <select className={inputBaseClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value={ALL}>전체</option>
            {STUDY_EXPERT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STUDY_EXPERT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          지도 카테고리
          <select className={inputBaseClass} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value={ALL}>전체</option>
            {(round?.categories ?? []).map((c) => (
              <option key={c.key} value={c.key}>
                {c.key}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          검색 (접수번호·성명·소속·직번·AI도구)
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
                <th scope="col" className="px-3 py-3 font-semibold">접수번호</th>
                <th scope="col" className="px-3 py-3 font-semibold">성명</th>
                <th scope="col" className="px-3 py-3 font-semibold">소속 / 직급</th>
                <th scope="col" className="px-3 py-3 font-semibold">직번</th>
                <th scope="col" className="px-3 py-3 font-semibold">연락처 / 이메일</th>
                <th scope="col" className="px-3 py-3 font-semibold">교원</th>
                <th scope="col" className="px-3 py-3 font-semibold">지도 카테고리</th>
                <th scope="col" className="px-3 py-3 font-semibold">신청일</th>
                <th scope="col" className="px-3 py-3 font-semibold">상태</th>
                <th scope="col" className="px-3 py-3 font-semibold">상세</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-10 text-center text-slate-500">
                    {rows.length === 0 ? "접수된 전문가 신청이 없습니다." : "조건에 맞는 신청이 없습니다."}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 align-top last:border-b-0">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label={`${r.code} ${r.name} 선택`}
                        className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent"
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                      />
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-600">{r.code}</td>
                    <td className="px-3 py-3 font-semibold text-slate-800">{r.name}</td>
                    <td className="px-3 py-3">
                      <span className="block text-slate-800">{r.affiliation}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{r.position}</span>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-slate-600">{r.id_number}</td>
                    <td className="px-3 py-3">
                      <span className="block tabular-nums text-slate-700">{r.phone}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{r.email}</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600">{r.is_nontenured ? "비전임" : "전임"}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.categories.map((c) => (
                          <span key={c} className="rounded bg-accent/10 px-1.5 py-0.5 text-xs font-semibold text-accent">
                            {c}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">{formatDateTime(r.created_at)}</td>
                    <td className="px-3 py-3">
                      <select
                        aria-label={`${r.code} 상태 변경`}
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        value={r.status}
                        disabled={busy}
                        onChange={(e) => void handleStatusChange(r.id, e.target.value as StudyExpertStatus)}
                      >
                        {STUDY_EXPERT_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {STUDY_EXPERT_STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                      {r.note && (
                        <span className="mt-1 block max-w-[10rem] truncate text-xs text-slate-500" title={r.note}>
                          {r.note}
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

      {/* 상세 — 경험 서술 전문 + 관리자 메모 */}
      <Modal open={Boolean(detail)} onClose={() => setDetailId(null)} titleId={detailTitleId}>
        {detail && (
          <>
            <h2 id={detailTitleId} className="text-lg font-bold text-brand">
              {detail.code} · {detail.name}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={clsx(
                  "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold",
                  STATUS_CLASSES[detail.status]
                )}
              >
                {STUDY_EXPERT_STATUS_LABELS[detail.status]}
              </span>
              <span className="text-xs text-slate-500">
                {detail.affiliation} · {detail.position} · {detail.is_nontenured ? "비전임교원" : "전임교원"} ·{" "}
                {detail.id_number}
              </span>
            </div>

            <dl className="mt-4 space-y-2 text-sm text-slate-700">
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 font-semibold text-slate-500">연락처</dt>
                <dd className="tabular-nums">{detail.phone}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 font-semibold text-slate-500">이메일</dt>
                <dd>{detail.email}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 font-semibold text-slate-500">지도 카테고리</dt>
                <dd>{detail.categories.join(", ")}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 font-semibold text-slate-500">주요 AI 도구</dt>
                <dd>{detail.ai_tools || "–"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 font-semibold text-slate-500">신청일</dt>
                <dd>{formatDateTime(detail.created_at)}</dd>
              </div>
            </dl>

            <h3 className="mt-5 text-sm font-bold text-slate-800">생성형 AI 활용 교수법 또는 연구 경험</h3>
            <p className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
              {detail.experience}
            </p>

            <h3 className="mt-5 text-sm font-bold text-slate-800">관리자 메모</h3>
            <p className="mt-1 text-xs text-slate-500">배정 연구모임, 연락 결과 등. 신청자에게는 보이지 않습니다.</p>
            <textarea
              rows={3}
              className={`${inputBaseClass} mt-2 resize-y`}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              aria-label="관리자 메모"
            />

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setDetailId(null)} disabled={busy}>
                닫기
              </Button>
              <Button
                variant="outline"
                onClick={handleNoteSave}
                disabled={busy || noteDraft.trim() === detail.note}
              >
                메모 저장
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setEditId(detail.id);
                  setDetailId(null);
                }}
                disabled={busy}
              >
                수정
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* 추가 — 오프라인·유선 접수의 소급 등록 */}
      {createOpen && round && (
        <ExpertApplicationFormModal
          key="new"
          mode="create"
          round={round}
          onClose={() => setCreateOpen(false)}
          onSaved={(row) => {
            setCreateOpen(false);
            setError(null);
            setRows((prev) => [...prev, row].sort((a, b) => a.code.localeCompare(b.code)));
            setNotice(`${row.code} ${row.name} 신청을 등록했습니다.`);
          }}
        />
      )}

      {/* 수정 — 신청자가 직접 고칠 수 없는 접수 건의 정정 */}
      {editTarget && round && (
        <ExpertApplicationFormModal
          key={editTarget.id}
          mode="edit"
          round={round}
          initial={editTarget}
          onClose={() => setEditId(null)}
          onSaved={(row) => {
            setEditId(null);
            setError(null);
            setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
            setNotice(`${row.code} 신청 내용을 저장했습니다.`);
          }}
        />
      )}
    </div>
  );
}
