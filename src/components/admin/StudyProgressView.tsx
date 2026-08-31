"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { inputBaseClass } from "@/components/ui/FormField";
import { StudyStatusBadge } from "@/components/study/StudyStatusBadge";
import { exportRowsAsCsv } from "@/lib/csv";
import { formatDate } from "@/lib/format";
import { fetchStudyGroups, fetchStudyRounds } from "@/lib/studyAdmin";
import { STUDY_MEETING_TARGET_COUNT } from "@/lib/studyGroupConstants";
import { STUDY_OUTPUT_TYPES, type StudyGroupWithRelations, type StudyRound } from "@/lib/studyTypes";

const ALL = "__all__";

/** 운영 단계에 들어선 팀만 진척 관리 대상이다. */
const OPERATING = new Set(["selected", "in_progress", "report_submitted", "completed"]);

/**
 * 관리자 탭 C. 연구모임 운영현황.
 *
 * 세 가지를 한 화면에서 처리한다.
 *  1) 팀별 진척 매트릭스 — 미제출 팀을 눈에 띄게 해 독려 대상을 바로 고른다
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
      const all = await fetchStudyGroups(id);
      setGroups(all.filter((g) => OPERATING.has(g.status)));
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
            선발된 팀의 회의록·산출물·결과보고서 제출 진척을 확인합니다.
            {round && ` 결과보고 마감 ${formatDate(round.report_due_at)}`}
          </p>
        </div>
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
      </div>

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
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                    <th scope="col" className="px-3 py-3 font-semibold">접수번호</th>
                    <th scope="col" className="px-3 py-3 font-semibold">모임명</th>
                    <th scope="col" className="px-3 py-3 font-semibold">대표자</th>
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
                    return (
                      <tr key={g.id} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-3 py-3 font-mono text-xs text-slate-600">{g.code}</td>
                        <td className="px-3 py-3 font-semibold text-slate-800">{g.name}</td>
                        <td className="px-3 py-3 text-slate-700">{g.leader_name}</td>
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
                          <StudyStatusBadge status={g.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
              상태를 &quot;이수완료&quot;로 바꾼 팀의 참여자 전원이 30만 포인트 지급 대상으로 집계됩니다.
              상태 변경은 「연구모임 관리」 탭에서 합니다.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
