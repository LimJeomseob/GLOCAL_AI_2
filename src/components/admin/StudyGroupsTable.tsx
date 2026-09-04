"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { inputBaseClass } from "@/components/ui/FormField";
import { StudyStatusBadge } from "@/components/study/StudyStatusBadge";
import { exportRowsAsCsv } from "@/lib/csv";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  aggregateWorkshopDemand,
  fetchStudyGroups,
  fetchStudyRounds,
  finalizeStudyReview,
  updateStudyGroupStatus,
} from "@/lib/studyAdmin";
import { STUDY_WORKSHOP_STEPS } from "@/lib/studyGroupConstants";
import {
  STUDY_GROUP_STATUSES,
  STUDY_STATUS_LABELS,
  type StudyGroupStatus,
  type StudyGroupWithRelations,
  type StudyRound,
} from "@/lib/studyTypes";

const ALL = "__all__";

/**
 * 관리자 탭 A. 연구모임 관리.
 * 현행 ApplicantsTable의 패턴(필터 → useMemo 파생 → 행 단위 변경 후 로컬 갱신)을 따르되,
 * 연구모임에만 있는 두 가지를 더한다: 계획서 상세 보기, 워크숍 희망일 교차집계.
 */
export function StudyGroupsTable() {
  const [rounds, setRounds] = useState<StudyRound[]>([]);
  const [roundId, setRoundId] = useState<string>("");
  const [groups, setGroups] = useState<StudyGroupWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [demandOpen, setDemandOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const detailTitleId = useId();
  const demandTitleId = useId();

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
      const data = await fetchStudyGroups(id);
      setGroups(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "연구모임을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (roundId) void load(roundId);
  }, [roundId, load]);

  const round = rounds.find((r) => r.id === roundId) ?? null;

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (statusFilter !== ALL && g.status !== statusFilter) return false;
      if (categoryFilter !== ALL && g.category !== categoryFilter) return false;
      if (!keyword) return true;
      return [g.code, g.name, g.topic, g.leader_name, g.leader_affiliation]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [groups, statusFilter, categoryFilter, search]);

  const detail = groups.find((g) => g.id === detailId) ?? null;
  const demand = useMemo(() => aggregateWorkshopDemand(groups), [groups]);

  async function handleStatusChange(groupId: string, status: string) {
    setBusy(true);
    setNotice(null);
    const message = await updateStudyGroupStatus(groupId, status);
    setBusy(false);

    if (message) {
      setError(message);
      return;
    }
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, status: status as StudyGroupStatus } : g))
    );
  }

  async function handleFinalize() {
    if (!round) return;
    if (
      !window.confirm(
        `${round.title}의 심사를 집계하고 상위 ${round.max_teams}개 팀을 선발 확정합니다.\n` +
          "이미 확정된 결과가 있으면 새 평균 점수로 다시 계산됩니다. 계속할까요?"
      )
    ) {
      return;
    }

    setBusy(true);
    setNotice(null);
    const { rows, error: message } = await finalizeStudyReview(round.id);
    setBusy(false);

    if (message) {
      setError(message);
      return;
    }
    setNotice(
      `심사 집계 완료 — ${rows.length}개 팀 순위 산출, ` +
        `${rows.filter((r) => r.final_status === "selected").length}개 팀 선발 확정`
    );
    await load(round.id);
  }

  function handleExport() {
    exportRowsAsCsv(
      filtered,
      [
        { header: "접수번호", accessor: (g) => g.code },
        { header: "모임명", accessor: (g) => g.name },
        { header: "주제", accessor: (g) => g.topic },
        { header: "카테고리", accessor: (g) => g.category },
        { header: "대표자", accessor: (g) => g.leader_name },
        { header: "소속", accessor: (g) => g.leader_affiliation },
        { header: "직급", accessor: (g) => g.leader_position },
        { header: "직번", accessor: (g) => g.leader_id_number },
        { header: "연락처", accessor: (g) => g.leader_phone },
        { header: "이메일", accessor: (g) => g.leader_email },
        { header: "참여인원", accessor: (g) => g.member_count },
        { header: "복수학과", accessor: (g) => (g.is_multi_dept ? "Y" : "N") },
        { header: "비전임포함", accessor: (g) => (g.has_nontenured ? "Y" : "N") },
        { header: "진행방법", accessor: (g) => g.progress_method ?? "" },
        { header: "교육형태", accessor: (g) => g.education_mode ?? "" },
        { header: "상태", accessor: (g) => STUDY_STATUS_LABELS[g.status] },
        { header: "심사총점", accessor: (g) => g.total_score ?? "" },
        { header: "순위", accessor: (g) => g.rank ?? "" },
        { header: "계획서제출", accessor: (g) => (g.plan?.submitted_at ? "Y" : "N") },
        { header: "회의록건수", accessor: (g) => g.meetings.length },
        { header: "결과보고제출", accessor: (g) => (g.report?.submitted_at ? "Y" : "N") },
        { header: "제출일", accessor: (g) => (g.submitted_at ? formatDateTime(g.submitted_at) : "") },
      ],
      `연구모임관리_${new Date().toISOString().slice(0, 10)}.csv`
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
          <h1 className="text-xl font-bold text-brand sm:text-2xl">연구모임 관리</h1>
          <p className="mt-1 text-sm text-slate-600">
            신청 접수부터 선발 확정까지 관리합니다. {round && `선발 ${round.max_teams}개 팀`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setDemandOpen(true)} disabled={loading}>
            워크숍 희망일 집계
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || filtered.length === 0}>
            엑셀 내보내기 ({filtered.length})
          </Button>
          <Button variant="primary" size="sm" onClick={handleFinalize} disabled={busy || loading}>
            심사 집계·선발 확정
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
            {STUDY_GROUP_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STUDY_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          카테고리
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
          검색 (접수번호·모임명·대표자)
          <input
            type="search"
            className={inputBaseClass}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
                <th scope="col" className="px-3 py-3 font-semibold">접수번호</th>
                <th scope="col" className="px-3 py-3 font-semibold">모임명 / 주제</th>
                <th scope="col" className="px-3 py-3 font-semibold">카테고리</th>
                <th scope="col" className="px-3 py-3 font-semibold">대표자</th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">인원</th>
                <th scope="col" className="px-3 py-3 font-semibold">제출</th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">총점/순위</th>
                <th scope="col" className="px-3 py-3 font-semibold">상태</th>
                <th scope="col" className="px-3 py-3 font-semibold">상세</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-slate-500">
                    조건에 맞는 연구모임이 없습니다.
                  </td>
                </tr>
              ) : (
                filtered.map((g) => (
                  <tr key={g.id} className="border-b border-slate-100 last:border-b-0 align-top">
                    <td className="px-3 py-3 font-mono text-xs text-slate-600">{g.code}</td>
                    <td className="px-3 py-3">
                      <span className="block font-semibold text-slate-800">{g.name}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{g.topic}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{g.category}</td>
                    <td className="px-3 py-3">
                      <span className="block text-slate-800">{g.leader_name}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{g.leader_affiliation}</span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                      {g.member_count}
                      {g.is_multi_dept && (
                        <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[13px] font-bold text-amber-800">
                          복수
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600">
                      계획 {g.plan?.submitted_at ? "✓" : "–"} · 회의 {g.meetings.length} · 보고{" "}
                      {g.report?.submitted_at ? "✓" : "–"}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                      {g.total_score ?? "–"}
                      {g.rank !== null && <span className="ml-1 text-xs text-slate-500">({g.rank}위)</span>}
                    </td>
                    <td className="px-3 py-3">
                      <select
                        aria-label={`${g.code} 상태 변경`}
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        value={g.status}
                        disabled={busy}
                        onChange={(e) => void handleStatusChange(g.id, e.target.value)}
                      >
                        {STUDY_GROUP_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {STUDY_STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <Button variant="ghost" size="sm" onClick={() => setDetailId(g.id)}>
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

      {/* 상세 — 신청서 + 계획서 + 참여자를 한 화면에서 확인 */}
      <Modal open={Boolean(detail)} onClose={() => setDetailId(null)} titleId={detailTitleId}>
        {detail && (
          <>
            <h2 id={detailTitleId} className="text-lg font-bold text-brand">
              {detail.code} · {detail.name}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StudyStatusBadge status={detail.status} />
              <span className="text-xs text-slate-500">
                [{detail.category}] · 대표자 {detail.leader_name} ({detail.leader_affiliation},{" "}
                {detail.leader_position})
              </span>
            </div>

            <p className="mt-4 text-sm font-semibold text-slate-800">{detail.topic}</p>

            <h3 className="mt-5 text-sm font-bold text-slate-800">참여자 {detail.member_count}명</h3>
            <ul className="mt-2 space-y-1 text-sm text-slate-600" role="list">
              {detail.members.map((m) => (
                <li key={m.id}>
                  · {m.name} ({m.affiliation} · {m.position} · {m.id_number})
                  {m.is_leader && <span className="ml-1 text-xs font-semibold text-brand">대표</span>}
                </li>
              ))}
            </ul>

            <h3 className="mt-5 text-sm font-bold text-slate-800">AI 윤리교육 실천 다짐</h3>
            {(detail.ethics_pledges ?? []).length > 0 ? (
              <ul className="mt-2 space-y-2 text-sm text-slate-600" role="list">
                {detail.ethics_pledges.map((p) => (
                  <li key={p.no}>
                    <p className="text-xs font-semibold text-slate-500">
                      {p.no}. {p.title}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap leading-relaxed text-slate-700">
                      {p.pledge}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500">작성 없음 (윤리교육 도입 전 신청 건)</p>
            )}

            <h3 className="mt-5 text-sm font-bold text-slate-800">연구계획서</h3>
            {detail.plan ? (
              <div className="mt-2 space-y-3 text-sm">
                {[
                  ["1. 주제", detail.plan.section1_topic],
                  ["2. 목적 및 필요성", detail.plan.section2_purpose],
                  ["3. AI 플랫폼 활용 계획", detail.plan.section3_platform],
                  ["4. 기대효과 및 활용방안", detail.plan.section4_effect],
                  ["5. 기타", detail.plan.section5_etc],
                ].map(([title, body]) => (
                  <div key={title}>
                    <p className="text-xs font-semibold text-slate-500">{title}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                      {body || "(작성 없음)"}
                    </p>
                  </div>
                ))}
                <p className="text-xs text-slate-400">
                  공백 제외 {detail.plan.char_count.toLocaleString()}자
                  {detail.plan.submitted_at && ` · 제출 ${formatDateTime(detail.plan.submitted_at)}`}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">작성된 계획서가 없습니다.</p>
            )}

            <div className="mt-6 flex justify-end">
              <Button variant="outline" onClick={() => setDetailId(null)}>
                닫기
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* 워크숍 희망일 교차집계 — 강사 배정안의 기초 자료 */}
      <Modal open={demandOpen} onClose={() => setDemandOpen(false)} titleId={demandTitleId}>
        <h2 id={demandTitleId} className="text-lg font-bold text-brand">
          단계별 워크숍 희망일 집계
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          계획서 5번에 구조화 저장된 희망일을 단계별로 모았습니다. 같은 날짜에 팀이 몰릴수록 한 번의
          강의로 더 많은 팀을 소화할 수 있습니다.
        </p>

        {demand.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">아직 등록된 희망일이 없습니다.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {STUDY_WORKSHOP_STEPS.map((step) => {
              const cells = demand.filter((d) => d.stepKey === step.key);
              if (cells.length === 0) return null;
              return (
                <div key={step.key}>
                  <h3 className="text-sm font-bold text-slate-800">
                    {step.order}차 {step.name}
                  </h3>
                  <ul className="mt-2 space-y-1 text-sm text-slate-600" role="list">
                    {cells
                      .slice()
                      .sort((a, b) => b.groups.length - a.groups.length || a.date.localeCompare(b.date))
                      .map((cell) => (
                        <li key={`${cell.stepKey}-${cell.date}`}>
                          · {formatDate(cell.date)} —{" "}
                          <strong className="tabular-nums text-brand">{cell.groups.length}팀</strong>{" "}
                          <span className="text-xs text-slate-500">({cell.groups.join(", ")})</span>
                        </li>
                      ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <Button variant="outline" onClick={() => setDemandOpen(false)}>
            닫기
          </Button>
        </div>
      </Modal>
    </div>
  );
}
