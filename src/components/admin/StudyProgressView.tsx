"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { inputBaseClass } from "@/components/ui/FormField";
import { StudyProgressRowEditor } from "@/components/admin/StudyProgressRowEditor";
import { StudyFinalScheduleModal } from "@/components/admin/StudyFinalScheduleModal";
import { exportRowsAsCsv } from "@/lib/csv";
import { formatDate, formatPhone } from "@/lib/format";
import {
  fetchStudyExpertApplications,
  fetchStudyGroups,
  fetchStudyRounds,
  isStudyExpertCandidate,
  studyGroupExpertDisplay,
  updateStudyGroupStatus,
} from "@/lib/studyAdmin";
import {
  STUDY_COACHING_TARGET_COUNT,
  STUDY_MEETING_TARGET_COUNT,
  STUDY_OPERATING_STATUSES,
} from "@/lib/studyGroupConstants";
import {
  STUDY_GROUP_STATUSES,
  STUDY_OUTPUT_TYPES,
  STUDY_STATUS_LABELS,
  type StudyGroupStatus,
  type StudyExpertApplication,
  type StudyGroupWithRelations,
  type StudyRound,
} from "@/lib/studyTypes";

const ALL = "__all__";

/** 운영 단계 상태만 행 안에서 바꿀 수 있다 — 접수·심사 단계로 되돌리는 일은 「연구모임 관리」에서 한다. */
const OPERATING_STATUS_OPTIONS = STUDY_GROUP_STATUSES.filter((status) =>
  STUDY_OPERATING_STATUSES.has(status)
);

/**
 * 관리자 탭 C. 연구모임 운영현황 — **선발 이후** 단계를 모두 다룬다.
 * 전문가 배정·일정·상태 변경의 입력 지점은 여기 한 곳이다(「연구모임 관리」는 선발 전만).
 *
 * 세 가지를 한 화면에서 처리한다.
 *  1) 팀별 진척 매트릭스 — 미제출 팀을 눈에 띄게 해 독려 대상을 바로 고른다.
 *     행을 펼치면 전문가 배정·3단계 일정·코칭 조율 내역을 그 자리에서 보고 고친다(StudyProgressRowEditor).
 *     확정표의 팀 구성·비고·공개 여부까지 고칠 때는 「일정 상세 입력」(StudyFinalScheduleModal).
 *     저장한 값은 대표자 '내 연구모임'·전문가 「배정 팀 확인」이 읽는 같은 데이터다.
 *     상태(선발 → 운영중 → 결과보고 제출 → 이수완료)도 행에서 바꾼다.
 *  2) 산출물 아카이브 — 유형·팀별로 걸러 CSV로 내보내면 성과 자료집 목차가 나온다
 *  3) 이수 확정 명단 — 30만 포인트 지급 대상(참여자 전원)을 CSV로 내보낸다
 */
export function StudyProgressView() {
  const [rounds, setRounds] = useState<StudyRound[]>([]);
  const [roundId, setRoundId] = useState("");
  const [groups, setGroups] = useState<StudyGroupWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [outputTypeFilter, setOutputTypeFilter] = useState<string>(ALL);
  const [participantQuery, setParticipantQuery] = useState("");
  const [participantStatusFilter, setParticipantStatusFilter] = useState<string>(ALL);
  /** 배정 후보 — 이 회차 등록 전문가(외부 포함, 미선정·취소 제외). 배정하면 선정으로 바뀐다. */
  const [experts, setExperts] = useState<StudyExpertApplication[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /** 「일정 상세 입력」 대상 — 팀 구성·비고·공개 여부까지 포함한 최종 일정 전체 폼 */
  const [scheduleEditId, setScheduleEditId] = useState<string | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  /** silent: 저장 뒤 재조회 — 화면을 "불러오는 중"으로 비우지 않아 펼친 행이 그대로 남는다. */
  const load = useCallback(async (id: string, { silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [all, expertRows] = await Promise.all([
        fetchStudyGroups(id),
        fetchStudyExpertApplications(id),
      ]);
      setGroups(all.filter((g) => STUDY_OPERATING_STATUSES.has(g.status)));
      setExperts(expertRows.filter(isStudyExpertCandidate));
    } catch (e) {
      setError(e instanceof Error ? e.message : "운영 현황을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (roundId) void load(roundId);
  }, [roundId, load]);

  const round = rounds.find((r) => r.id === roundId) ?? null;
  // 모달 대상은 목록에서 파생해 재조회 후 최신 값을 보게 한다.
  const scheduleTarget = groups.find((g) => g.id === scheduleEditId) ?? null;

  /** 운영 단계 안에서의 상태 변경. 이수완료로 바꾸면 아래 「이수 확정 명단」에 바로 집계된다. */
  async function handleStatusChange(group: StudyGroupWithRelations, status: string) {
    setStatusBusyId(group.id);
    setNotice(null);
    setError(null);
    const message = await updateStudyGroupStatus(group.id, status);
    setStatusBusyId(null);
    if (message) {
      setError(message);
      return;
    }
    setGroups((prev) =>
      prev.map((g) => (g.id === group.id ? { ...g, status: status as StudyGroupStatus } : g))
    );
    setNotice(`${group.code} 상태를 "${STUDY_STATUS_LABELS[status as StudyGroupStatus]}"로 바꿨습니다.`);
  }

  /** 팀별 전문가·일정·진척 한 표 — 선발 이후 관리 자료의 원본 */
  function exportProgress() {
    exportRowsAsCsv(
      groups,
      [
        { header: "접수번호", accessor: (g) => g.code },
        { header: "모임명", accessor: (g) => g.name },
        { header: "카테고리", accessor: (g) => g.category },
        { header: "대표자", accessor: (g) => g.leader_name },
        { header: "소속", accessor: (g) => g.leader_affiliation },
        { header: "참여인원", accessor: (g) => g.member_count },
        { header: "진행방법", accessor: (g) => g.progress_method ?? "" },
        { header: "교육형태", accessor: (g) => g.education_mode ?? "" },
        { header: "배정전문가", accessor: (g) => studyGroupExpertDisplay(g).name },
        {
          header: "배정팀확인",
          accessor: (g) => {
            const d = studyGroupExpertDisplay(g);
            return d.linked ? "가능" : d.individual || !d.name ? "-" : "불가(미연결)";
          },
        },
        {
          header: "최종일정",
          accessor: (g) =>
            g.finalSchedule ? (g.finalSchedule.published ? "등록" : "비공개") : "미등록",
        },
        { header: "1차기획", accessor: (g) => g.finalSchedule?.step1_when ?? "" },
        { header: "2차제작", accessor: (g) => g.finalSchedule?.step2_when ?? "" },
        { header: "3차환류", accessor: (g) => g.finalSchedule?.step3_when ?? "" },
        {
          header: "코칭확정",
          accessor: (g) => g.coachingSessions.filter((s) => s.status === "확정").length,
        },
        { header: "회의록", accessor: (g) => g.meetings.length },
        { header: "산출물", accessor: (g) => g.outputs.length },
        { header: "결과보고", accessor: (g) => (g.report?.submitted_at ? "Y" : "N") },
        { header: "상태", accessor: (g) => STUDY_STATUS_LABELS[g.status] },
      ],
      `연구모임운영현황_${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  /** 산출물을 팀 정보와 함께 평탄화 — 아카이브 표와 CSV가 같은 행 구조를 쓴다. */
  const outputRows = useMemo(
    () =>
      groups.flatMap((g) =>
        g.outputs
          .filter((o) => outputTypeFilter === ALL || o.output_type === outputTypeFilter)
          .map((o) => ({ group: g, output: o }))
      ),
    [groups, outputTypeFilter]
  );

  /** 이수 확정 팀의 참여자 전원 — 이수혜택 지급 대상 명단 */
  const completedMembers = useMemo(
    () =>
      groups
        .filter((g) => g.status === "completed")
        .flatMap((g) => g.members.map((m) => ({ group: g, member: m }))),
    [groups]
  );

  /** 선발 이후 전 팀의 참여자 전원 — 검색·상태 필터 적용 */
  const participantRows = useMemo(() => {
    const q = participantQuery.trim().toLowerCase();
    return groups
      .filter((g) => participantStatusFilter === ALL || g.status === participantStatusFilter)
      .flatMap((g) => g.members.map((m) => ({ group: g, member: m })))
      .filter(
        ({ member }) =>
          q === "" || [member.name, member.affiliation].some((v) => v.toLowerCase().includes(q))
      );
  }, [groups, participantQuery, participantStatusFilter]);

  function exportParticipants() {
    exportRowsAsCsv(
      participantRows.map((r, i) => ({ ...r, no: i + 1 })),
      [
        { header: "연번", accessor: (r) => r.no },
        { header: "접수번호", accessor: (r) => r.group.code },
        { header: "모임명", accessor: (r) => r.group.name },
        { header: "카테고리", accessor: (r) => r.group.category },
        { header: "성명", accessor: (r) => r.member.name },
        { header: "소속", accessor: (r) => r.member.affiliation },
        { header: "직급", accessor: (r) => r.member.position },
        { header: "직번", accessor: (r) => r.member.id_number },
        { header: "연락처", accessor: (r) => formatPhone(r.member.phone) },
        { header: "이메일", accessor: (r) => r.member.email },
        { header: "대표자여부", accessor: (r) => (r.member.is_leader ? "Y" : "N") },
        { header: "팀 상태", accessor: (r) => STUDY_STATUS_LABELS[r.group.status] },
      ],
      `연구모임참여자_${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  function exportOutputs() {
    exportRowsAsCsv(
      outputRows,
      [
        { header: "접수번호", accessor: (r) => r.group.code },
        { header: "모임명", accessor: (r) => r.group.name },
        { header: "카테고리", accessor: (r) => r.group.category },
        { header: "대표자", accessor: (r) => r.group.leader_name },
        { header: "산출물명", accessor: (r) => r.output.title },
        { header: "유형", accessor: (r) => r.output.output_type },
        { header: "링크", accessor: (r) => r.output.url },
        { header: "드라이브 업로드", accessor: (r) => (r.output.drive_uploaded ? "Y" : "N") },
        { header: "설명", accessor: (r) => r.output.description },
      ],
      `연구모임산출물_${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  function exportCompletion() {
    exportRowsAsCsv(
      completedMembers,
      [
        { header: "접수번호", accessor: (r) => r.group.code },
        { header: "모임명", accessor: (r) => r.group.name },
        { header: "교번", accessor: (r) => r.member.id_number },
        { header: "성명", accessor: (r) => r.member.name },
        { header: "소속", accessor: (r) => r.member.affiliation },
        { header: "직급", accessor: (r) => r.member.position },
        { header: "대표자여부", accessor: (r) => (r.member.is_leader ? "Y" : "N") },
        { header: "이수혜택", accessor: () => "교육·연구 학생지도 비용 30만 포인트" },
      ],
      `연구모임이수명단_${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  if (loading) {
    return (
      <p role="status" className="py-10 text-center text-sm text-slate-500">
        불러오는 중...
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-brand sm:text-2xl">연구모임 운영현황</h1>
          <p className="mt-1 text-sm text-slate-600">
            선발된 팀의 전문가 배정·일정·코칭·회의록·산출물·결과보고서 진척과 상태를 관리합니다. 모임명을
            눌러 행을 펼치면 「전문가 신청자」에 등록된 전문가를 드롭다운에서 배정하고 일정을 수정할 수 있으며,
            저장하면 대표자 화면과 전문가 「배정 팀 확인」에 바로 반영됩니다. &quot;미연결&quot; 팀은 전문가가
            조회할 수 없으니 다시 배정해 주세요.
            {round && ` 결과보고 마감 ${formatDate(round.report_due_at)}`}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            모집회차
            <select
              className={inputBaseClass}
              value={roundId}
              onChange={(e) => {
                setRoundId(e.target.value);
                setParticipantQuery("");
                setParticipantStatusFilter(ALL);
              }}
            >
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </label>
          <Button variant="outline" size="sm" onClick={exportProgress} disabled={groups.length === 0}>
            운영현황 CSV ({groups.length})
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

      {groups.length === 0 ? (
        <p role="status" className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          운영 중인 연구모임이 없습니다. 선발 확정 후 표시됩니다.
        </p>
      ) : (
        <>
          {/* 1) 진척 매트릭스 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-bold text-slate-800">팀별 진척</h2>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[1100px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                    <th scope="col" className="px-3 py-3 font-semibold">접수번호</th>
                    <th scope="col" className="px-3 py-3 font-semibold">모임명</th>
                    <th scope="col" className="px-3 py-3 font-semibold">대표자</th>
                    <th scope="col" className="px-3 py-3 font-semibold">배정 전문가</th>
                    <th scope="col" className="px-3 py-3 font-semibold">최종일정</th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">코칭</th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">회의록</th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">산출물</th>
                    <th scope="col" className="px-3 py-3 font-semibold">결과보고서</th>
                    <th scope="col" className="px-3 py-3 font-semibold">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => {
                    const meetingShort = g.meetings.length < STUDY_MEETING_TARGET_COUNT;
                    const reportDone = Boolean(g.report?.submitted_at);
                    const coachingDone = g.coachingSessions.filter((s) => s.status === "확정").length;
                    const expanded = expandedId === g.id;
                    // 연구모임 관리 목록과 같은 기준 — 팀 화면 'AI 전문가' 표기 우선
                    const { name: expertName, linked, individual } = studyGroupExpertDisplay(g);
                    return (
                      <Fragment key={g.id}>
                        <tr
                          className={clsx(
                            "border-b border-slate-100",
                            expanded ? "bg-brand/5" : "last:border-b-0"
                          )}
                        >
                          <td className="px-3 py-3 font-mono text-xs text-slate-600">{g.code}</td>
                          <td className="px-3 py-3 font-semibold text-slate-800">
                            <button
                              type="button"
                              className="flex items-start gap-1.5 text-left hover:text-brand"
                              aria-expanded={expanded}
                              onClick={() => {
                                setNotice(null);
                                setExpandedId(expanded ? null : g.id);
                              }}
                            >
                              <span aria-hidden="true" className="mt-0.5 text-xs text-slate-400">
                                {expanded ? "▾" : "▸"}
                              </span>
                              <span>{g.name}</span>
                            </button>
                          </td>
                          <td className="px-3 py-3 text-slate-700">{g.leader_name}</td>
                          <td className="px-3 py-3 text-slate-700">
                            {expertName ? (
                              <span className="flex flex-wrap items-center gap-1">
                                {expertName}
                                {linked ? (
                                  <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                                    등록
                                  </span>
                                ) : (
                                  !individual && (
                                    <span
                                      className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800"
                                      title="등록 전문가와 연결되지 않아 「배정 팀 확인」에서 조회되지 않습니다. 행을 펼쳐 드롭다운에서 다시 선택하세요."
                                    >
                                      미연결
                                    </span>
                                  )
                                )}
                              </span>
                            ) : (
                              <span className="text-amber-700">미배정</span>
                            )}
                          </td>
                          <td className="px-3 py-3 font-semibold">
                            {g.finalSchedule ? (
                              g.finalSchedule.published ? (
                                <span className="text-emerald-700">등록</span>
                              ) : (
                                <span className="text-slate-500">비공개</span>
                              )
                            ) : (
                              <span className="text-amber-700">미등록</span>
                            )}
                          </td>
                          <td
                            className={clsx(
                              "px-3 py-3 text-right font-semibold tabular-nums",
                              coachingDone < STUDY_COACHING_TARGET_COUNT
                                ? "text-amber-700"
                                : "text-emerald-700"
                            )}
                          >
                            {coachingDone}
                            <span className="ml-0.5 text-xs font-normal text-slate-400">
                              /{STUDY_COACHING_TARGET_COUNT}
                            </span>
                          </td>
                          <td
                            className={clsx(
                              "px-3 py-3 text-right tabular-nums font-semibold",
                              meetingShort ? "text-amber-700" : "text-emerald-700"
                            )}
                          >
                            {g.meetings.length}
                            <span className="ml-0.5 text-xs font-normal text-slate-400">
                              /{STUDY_MEETING_TARGET_COUNT}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                            {g.outputs.length}
                          </td>
                          <td
                            className={clsx(
                              "px-3 py-3 font-semibold",
                              reportDone ? "text-emerald-700" : "text-amber-700"
                            )}
                          >
                            {reportDone ? "제출" : "미제출"}
                          </td>
                          <td className="px-3 py-3">
                            <select
                              aria-label={`${g.code} 상태 변경`}
                              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                              value={g.status}
                              disabled={statusBusyId !== null}
                              onChange={(e) => void handleStatusChange(g, e.target.value)}
                            >
                              {OPERATING_STATUS_OPTIONS.map((status) => (
                                <option key={status} value={status}>
                                  {STUDY_STATUS_LABELS[status]}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="border-b border-slate-200">
                            <td colSpan={10} className="p-0">
                              <StudyProgressRowEditor
                                // 저장 후 재조회된 값으로 입력칸을 다시 채운다.
                                key={`${g.id}-${g.expert_id ?? ""}-${g.finalSchedule?.updated_at ?? ""}`}
                                group={g}
                                experts={experts}
                                onSaved={async (message) => {
                                  if (roundId) await load(roundId, { silent: true });
                                  setNotice(message);
                                }}
                                onOpenScheduleDetail={() => setScheduleEditId(g.id)}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* 1-2) 전체 참여자 현황 */}
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-base font-bold text-slate-800">
                참여자 현황 ({participantRows.length}명)
              </h2>
              <div className="flex flex-wrap items-end gap-2">
                <input
                  type="search"
                  className={inputBaseClass}
                  placeholder="성명·소속 검색"
                  aria-label="참여자 성명·소속 검색"
                  value={participantQuery}
                  onChange={(e) => setParticipantQuery(e.target.value)}
                />
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                  팀 상태
                  <select
                    className={inputBaseClass}
                    value={participantStatusFilter}
                    onChange={(e) => setParticipantStatusFilter(e.target.value)}
                  >
                    <option value={ALL}>전체</option>
                    {OPERATING_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {STUDY_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportParticipants}
                  disabled={participantRows.length === 0}
                >
                  참여자 현황 CSV
                </Button>
              </div>
            </div>

            {participantRows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                조건에 맞는 참여자가 없습니다.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                      <th scope="col" className="px-3 py-3 font-semibold">연번</th>
                      <th scope="col" className="px-3 py-3 font-semibold">접수번호</th>
                      <th scope="col" className="px-3 py-3 font-semibold">모임명</th>
                      <th scope="col" className="px-3 py-3 font-semibold">카테고리</th>
                      <th scope="col" className="px-3 py-3 font-semibold">성명</th>
                      <th scope="col" className="px-3 py-3 font-semibold">소속</th>
                      <th scope="col" className="px-3 py-3 font-semibold">직급</th>
                      <th scope="col" className="px-3 py-3 font-semibold">직번</th>
                      <th scope="col" className="px-3 py-3 font-semibold">연락처</th>
                      <th scope="col" className="px-3 py-3 font-semibold">이메일</th>
                      <th scope="col" className="px-3 py-3 font-semibold">대표자</th>
                      <th scope="col" className="px-3 py-3 font-semibold">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {participantRows.map(({ group, member }, i) => (
                      <tr key={member.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-500">{group.code}</td>
                        <td className="px-3 py-2 font-semibold text-slate-800">{group.name}</td>
                        <td className="px-3 py-2">{group.category}</td>
                        <td className="px-3 py-2 font-semibold">{member.name}</td>
                        <td className="px-3 py-2">{member.affiliation}</td>
                        <td className="px-3 py-2">{member.position}</td>
                        <td className="px-3 py-2">{member.id_number}</td>
                        <td className="px-3 py-2">{member.phone ? formatPhone(member.phone) : "—"}</td>
                        <td className="px-3 py-2 break-all">{member.email || "—"}</td>
                        <td className="px-3 py-2">
                          {member.is_leader && (
                            <span className="text-xs font-semibold text-brand">대표</span>
                          )}
                        </td>
                        <td className="px-3 py-2">{STUDY_STATUS_LABELS[group.status]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 2) 산출물 아카이브 */}
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-base font-bold text-slate-800">
                산출물 아카이브 ({outputRows.length})
              </h2>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                  유형
                  <select
                    className={inputBaseClass}
                    value={outputTypeFilter}
                    onChange={(e) => setOutputTypeFilter(e.target.value)}
                  >
                    <option value={ALL}>전체</option>
                    {STUDY_OUTPUT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportOutputs}
                  disabled={outputRows.length === 0}
                >
                  자료집용 CSV 내보내기
                </Button>
              </div>
            </div>

            {outputRows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                등록된 산출물이 없습니다.
              </p>
            ) : (
              <ul className="flex flex-col gap-2" role="list">
                {outputRows.map(({ group, output }) => (
                  <li
                    key={output.id}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-3"
                  >
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-mono text-xs text-slate-500">{group.code}</span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {output.output_type}
                      </span>
                      <span className="text-sm font-bold text-slate-800">{output.title}</span>
                      {output.drive_uploaded ? (
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                          드라이브 업로드 완료
                        </span>
                      ) : (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          드라이브 미업로드
                        </span>
                      )}
                    </div>
                    <a
                      href={output.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block break-all text-xs text-accent underline underline-offset-2"
                    >
                      {output.url}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 3) 이수혜택 지급 대상 */}
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-bold text-slate-800">
                이수 확정 명단 ({completedMembers.length}명)
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={exportCompletion}
                disabled={completedMembers.length === 0}
              >
                지급 대상 명단 CSV
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              위 표에서 상태를 &quot;이수완료&quot;로 바꾼 팀의 참여자 전원이 30만 포인트 지급 대상으로
              집계됩니다.
            </p>
          </section>
        </>
      )}

      {/* 최종 일정 전체 입력(0027) — 팀 구성·비고·공개 여부까지. 행 펼침의 일정 칸은 이 중 단계 일정만 다룬다 */}
      {scheduleTarget && (
        <StudyFinalScheduleModal
          key={scheduleTarget.id}
          group={scheduleTarget}
          onClose={() => setScheduleEditId(null)}
          onSaved={async (message) => {
            setScheduleEditId(null);
            setError(null);
            if (roundId) await load(roundId, { silent: true });
            setNotice(message);
          }}
        />
      )}
    </div>
  );
}
