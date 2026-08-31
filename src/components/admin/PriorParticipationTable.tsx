"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import { exportRowsAsCsv } from "@/lib/csv";
import { formatDate } from "@/lib/format";
import {
  deletePriorParticipations,
  fetchPriorParticipations,
  parsePriorParticipationPaste,
  upsertPriorParticipations,
  type PriorParticipationInput,
} from "@/lib/studyAdmin";
import type { StudyPriorParticipation } from "@/lib/studyTypes";

const EMPTY: PriorParticipationInput = {
  name: "",
  idNumber: "",
  phone: "",
  programName: "",
  programYear: null,
  completed: false,
  note: "",
};

const PASTE_PLACEHOLDER = `홍길동\t1001\t010-1234-5678\t2025 생성형 AI 워크숍\t2025\tY
김철수\t2001\t\t2025 AI 교수법 특강\t2025\tN`;

/**
 * 관리자 탭 — 심사기준 1번 참여·이수 이력 대장.
 *
 * 심사 화면의 자동 조회는 이 포털을 거친 특강 신청만 잡는다. 과거 연도 행사·오프라인 교육처럼
 * 시스템에 흔적이 없는 이력은 여기서 관리자가 채워 넣어야 20점짜리 심사기준이 형해화되지 않는다.
 *
 * 과거 명단은 실무에서 대부분 엑셀로 존재하므로, 한 줄 입력보다 붙여넣기를 주 경로로 둔다.
 */
export function PriorParticipationTable() {
  const [rows, setRows] = useState<StudyPriorParticipation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [single, setSingle] = useState<PriorParticipationInput>(EMPTY);
  const [paste, setPaste] = useState("");
  const [pasteErrors, setPasteErrors] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchPriorParticipations());
    } catch (e) {
      setError(e instanceof Error ? e.message : "이력을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((r) =>
      [r.name, r.id_number, r.phone, r.program_name].join(" ").toLowerCase().includes(keyword)
    );
  }, [rows, search]);

  async function handleAddSingle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice(null);
    setError(null);

    if (!single.name.trim() || !single.programName.trim()) {
      setError("성명과 프로그램명은 필수입니다.");
      return;
    }
    if (!single.idNumber.trim() && !single.phone.trim()) {
      setError("직번 또는 연락처 중 하나는 입력해야 신청자와 이어집니다.");
      return;
    }

    setBusy(true);
    const message = await upsertPriorParticipations([single]);
    setBusy(false);

    if (message) {
      setError(message);
      return;
    }
    setNotice("1건 등록했습니다.");
    setSingle(EMPTY);
    await load();
  }

  async function handleBulkAdd() {
    setNotice(null);
    setError(null);

    const { rows: parsed, errors } = parsePriorParticipationPaste(paste);
    setPasteErrors(errors);

    if (parsed.length === 0) {
      setError("등록할 행이 없습니다. 형식을 확인해 주세요.");
      return;
    }

    setBusy(true);
    const message = await upsertPriorParticipations(parsed);
    setBusy(false);

    if (message) {
      setError(message);
      return;
    }
    setNotice(
      `${parsed.length}건 등록했습니다.` +
        (errors.length > 0 ? ` (형식 오류 ${errors.length}행은 건너뜀)` : "")
    );
    setPaste("");
    await load();
  }

  async function handleDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!window.confirm(`선택한 ${ids.length}건을 삭제할까요? 되돌릴 수 없습니다.`)) return;

    setBusy(true);
    const message = await deletePriorParticipations(ids);
    setBusy(false);

    if (message) {
      setError(message);
      return;
    }
    setNotice(`${ids.length}건 삭제했습니다.`);
    setSelected(new Set());
    await load();
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-brand sm:text-2xl">참여이력 관리</h1>
        <p className="mt-1 text-sm text-slate-600">
          심사기준 1번(AI융합원 프로그램 참여 및 이수, 20점)의 근거 대장입니다.
        </p>
      </div>

      <div className="rounded-xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm leading-relaxed text-sky-900">
        심사 화면은 <strong>이 포털을 거친 특강 신청 이력을 자동으로</strong> 찾아 줍니다. 과거 연도
        행사·오프라인 교육처럼 시스템에 기록이 없는 이력만 여기에 등록하시면 됩니다. 등록한 건은
        심사 화면에서 <strong>[수기]</strong> 표시와 함께 자동 조회분과 합산되어 보입니다.
        <br />
        신청자와 이어 주는 열쇠는 <strong>성명 + (직번 또는 연락처)</strong> 입니다. 둘 다 비면 어떤
        신청자와도 매칭되지 않습니다.
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

      {/* 여러 건 붙여넣기 — 과거 명단은 대개 엑셀에 있으므로 이쪽이 주 경로다 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-bold text-slate-800">엑셀에서 붙여넣기</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          열 순서: <strong>성명 · 직번 · 연락처 · 프로그램명 · 연도 · 이수여부</strong> — 엑셀에서
          그대로 복사해 붙여넣으세요(탭 구분). 쉼표 구분도 됩니다. 이수여부는 <code>Y</code>·
          <code>이수</code>·<code>1</code> 을 이수로 봅니다. 이미 등록된 같은 사람·같은 프로그램은
          이수 여부만 갱신됩니다.
        </p>
        <textarea
          rows={5}
          className={`${inputBaseClass} mt-3 resize-y font-mono text-xs`}
          value={paste}
          placeholder={PASTE_PLACEHOLDER}
          onChange={(e) => setPaste(e.target.value)}
          aria-label="참여이력 붙여넣기"
        />
        {pasteErrors.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-amber-800" role="list">
            {pasteErrors.slice(0, 5).map((m) => (
              <li key={m}>· {m}</li>
            ))}
            {pasteErrors.length > 5 && <li>· 그 외 {pasteErrors.length - 5}행…</li>}
          </ul>
        )}
        <div className="mt-3">
          <Button variant="primary" size="sm" onClick={handleBulkAdd} disabled={busy || !paste.trim()}>
            붙여넣은 내용 등록
          </Button>
        </div>
      </section>

      {/* 한 건씩 추가 */}
      <details className="rounded-xl border border-slate-200 bg-white">
        <summary className="cursor-pointer px-5 py-4 text-sm font-bold text-slate-800">
          한 건씩 직접 입력
        </summary>
        <form onSubmit={handleAddSingle} noValidate className="border-t border-slate-200 p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="성명" required>
              {(p) => (
                <input {...p} type="text" className={inputBaseClass} value={single.name}
                  onChange={(e) => setSingle((s) => ({ ...s, name: e.target.value }))} />
              )}
            </FormField>
            <FormField label="직번" hint="직번 또는 연락처 중 하나는 필수">
              {(p) => (
                <input {...p} type="text" className={inputBaseClass} value={single.idNumber}
                  onChange={(e) => setSingle((s) => ({ ...s, idNumber: e.target.value }))} />
              )}
            </FormField>
            <FormField label="연락처">
              {(p) => (
                <input {...p} type="tel" className={inputBaseClass} value={single.phone}
                  placeholder="010-1234-5678"
                  onChange={(e) => setSingle((s) => ({ ...s, phone: e.target.value }))} />
              )}
            </FormField>
            <FormField label="프로그램명" required>
              {(p) => (
                <input {...p} type="text" className={inputBaseClass} value={single.programName}
                  placeholder="예: 2025 생성형 AI 워크숍"
                  onChange={(e) => setSingle((s) => ({ ...s, programName: e.target.value }))} />
              )}
            </FormField>
            <FormField label="연도">
              {(p) => (
                <input {...p} type="number" className={inputBaseClass}
                  value={single.programYear ?? ""}
                  onChange={(e) =>
                    setSingle((s) => ({
                      ...s,
                      programYear: e.target.value ? Number(e.target.value) : null,
                    }))
                  } />
              )}
            </FormField>
            <FormField label="이수 여부">
              {(p) => (
                <label htmlFor={p.id} className="flex items-center gap-2 pt-2 text-sm text-slate-700">
                  <input {...p} type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent"
                    checked={single.completed}
                    onChange={(e) => setSingle((s) => ({ ...s, completed: e.target.checked }))} />
                  <span>이수까지 완료</span>
                </label>
              )}
            </FormField>
          </div>
          <div className="mt-4">
            <Button type="submit" variant="outline" size="sm" disabled={busy}>
              등록
            </Button>
          </div>
        </form>
      </details>

      {/* 목록 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          검색 (성명·직번·연락처·프로그램명)
          <input type="search" className={inputBaseClass} value={search}
            onChange={(e) => setSearch(e.target.value)} />
        </label>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={filtered.length === 0}
            onClick={() =>
              exportRowsAsCsv(
                filtered,
                [
                  { header: "성명", accessor: (r) => r.name },
                  { header: "직번", accessor: (r) => r.id_number },
                  { header: "연락처", accessor: (r) => r.phone },
                  { header: "프로그램명", accessor: (r) => r.program_name },
                  { header: "연도", accessor: (r) => r.program_year ?? "" },
                  { header: "이수", accessor: (r) => (r.completed ? "Y" : "N") },
                  { header: "등록자", accessor: (r) => r.created_by },
                  { header: "등록일", accessor: (r) => formatDate(r.created_at) },
                ],
                `참여이력_${new Date().toISOString().slice(0, 10)}.csv`
              )
            }>
            엑셀 내보내기 ({filtered.length})
          </Button>
          <Button variant="danger" size="sm" onClick={handleDelete} disabled={busy || selected.size === 0}>
            선택 삭제 ({selected.size})
          </Button>
        </div>
      </div>

      {loading ? (
        <p role="status" className="py-10 text-center text-sm text-slate-500">불러오는 중...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th scope="col" className="px-3 py-3 font-semibold">
                  <span className="sr-only">선택</span>
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">성명</th>
                <th scope="col" className="px-3 py-3 font-semibold">직번</th>
                <th scope="col" className="px-3 py-3 font-semibold">연락처</th>
                <th scope="col" className="px-3 py-3 font-semibold">프로그램명</th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">연도</th>
                <th scope="col" className="px-3 py-3 font-semibold">이수</th>
                <th scope="col" className="px-3 py-3 font-semibold">등록</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                    {rows.length === 0
                      ? "등록된 이력이 없습니다. 위에서 명단을 붙여넣어 주세요."
                      : "검색 조건에 맞는 이력이 없습니다."}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-3 py-3">
                      <input type="checkbox" aria-label={`${r.name} ${r.program_name} 선택`}
                        className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent"
                        checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                    </td>
                    <td className="px-3 py-3 font-semibold text-slate-800">{r.name}</td>
                    <td className="px-3 py-3 tabular-nums text-slate-600">{r.id_number || "–"}</td>
                    <td className="px-3 py-3 tabular-nums text-slate-600">{r.phone || "–"}</td>
                    <td className="px-3 py-3 text-slate-700">{r.program_name}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                      {r.program_year ?? "–"}
                    </td>
                    <td className="px-3 py-3">
                      {r.completed ? (
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                          이수
                        </span>
                      ) : (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          참여
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">
                      {r.created_by || "–"}
                      <br />
                      {formatDate(r.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
