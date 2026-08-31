"use client";

import Link from "next/link";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { formatDate, formatDateTime } from "@/lib/format";
import { deriveNextStep } from "@/lib/studyApi";
import { STUDY_MEETING_TARGET_COUNT } from "@/lib/studyGroupConstants";
import { STUDY_STATUS_LABELS, type StudyGroupStatus, type StudyLookupResult } from "@/lib/studyTypes";

/** 타임라인에 표시할 정상 경로. 미선발·취소는 분기이므로 별도 처리한다. */
const TIMELINE: StudyGroupStatus[] = [
  "draft",
  "submitted",
  "under_review",
  "selected",
  "in_progress",
  "report_submitted",
  "completed",
];

function timelineIndex(status: StudyGroupStatus): number {
  const index = TIMELINE.indexOf(status);
  if (index >= 0) return index;
  // rejected는 심사(under_review)까지 진행된 것으로 본다.
  if (status === "rejected") return TIMELINE.indexOf("under_review");
  return 0;
}

/**
 * 탭 6. '내 연구모임' 본문.
 *
 * 화면의 목적은 "지금 무엇을 해야 하는가" 하나를 분명히 하는 것이다.
 * 운영개요 ③단계 「운영 안내(시스템 안내)」가 이 화면으로 충족된다.
 */
export function StudyGroupSummary({ group }: { group: StudyLookupResult }) {
  const next = deriveNextStep(group);
  const currentIndex = timelineIndex(group.status);
  const isRejected = group.status === "rejected";
  const isCancelled = group.status === "cancelled";

  const planDone = Boolean(group.plan?.submittedAt);
  const reportDone = Boolean(group.report?.submittedAt);

  return (
    <div className="flex flex-col gap-6">
      {/* 다음 할 일 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">다음 할 일</h2>
        <p className="mt-2 text-lg font-bold text-brand">{next.label}</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{next.description}</p>
        {next.href && (
          <Link href={next.href} className="mt-4 inline-block">
            <Button variant="primary" size="lg">
              {next.label}
            </Button>
          </Link>
        )}
      </section>

      {/* 진행 상태 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <h2 className="text-sm font-bold text-slate-800">진행 상태</h2>

        {isCancelled ? (
          <p className="mt-3 text-sm text-slate-500">취소된 신청입니다.</p>
        ) : (
          <ol className="mt-4 flex flex-col gap-0 border-l-2 border-slate-200" role="list">
            {TIMELINE.map((status, index) => {
              // 미선발이면 '선발' 이후 단계는 회색으로 남긴다.
              const reached = isRejected ? index <= currentIndex : index <= currentIndex;
              const isCurrent = status === group.status;
              const label =
                isRejected && status === "selected" ? "미선발" : STUDY_STATUS_LABELS[status];

              return (
                <li key={status} className="relative py-2 pl-6">
                  <span
                    aria-hidden="true"
                    className={clsx(
                      "absolute -left-[5px] top-4 h-2 w-2 rounded-full",
                      isRejected && status === "selected"
                        ? "bg-rose-500"
                        : reached
                        ? "bg-accent"
                        : "bg-slate-300"
                    )}
                  />
                  <span
                    className={clsx(
                      "text-sm",
                      isCurrent ? "font-bold text-brand" : reached ? "text-slate-700" : "text-slate-400"
                    )}
                  >
                    {label}
                    {isCurrent && <span className="ml-2 text-xs font-normal text-accent">현재</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {group.totalScore !== null && (
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            심사 결과 · 총점{" "}
            <strong className="tabular-nums text-brand">{group.totalScore}</strong>점
            {group.rank !== null && (
              <>
                {" "}
                · 순위 <strong className="tabular-nums text-brand">{group.rank}</strong>위
              </>
            )}
          </p>
        )}
      </section>

      {/* 제출 현황 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <h2 className="text-sm font-bold text-slate-800">제출 현황</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <dt className="text-xs font-semibold text-slate-500">연구계획서</dt>
            <dd className={clsx("mt-1 text-sm font-bold", planDone ? "text-emerald-700" : "text-amber-700")}>
              {planDone ? "제출 완료" : "미제출"}
            </dd>
            {group.plan?.submittedAt && (
              <dd className="mt-1 text-xs text-slate-500">{formatDateTime(group.plan.submittedAt)}</dd>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <dt className="text-xs font-semibold text-slate-500">회의록</dt>
            <dd className="mt-1 text-sm font-bold tabular-nums text-slate-800">
              {group.meetings.length}건
              <span className="ml-1 text-xs font-normal text-slate-400">
                / 권장 {STUDY_MEETING_TARGET_COUNT}회
              </span>
            </dd>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <dt className="text-xs font-semibold text-slate-500">결과보고서</dt>
            <dd className={clsx("mt-1 text-sm font-bold", reportDone ? "text-emerald-700" : "text-amber-700")}>
              {reportDone ? "제출 완료" : "미제출"}
            </dd>
            {group.report?.submittedAt && (
              <dd className="mt-1 text-xs text-slate-500">{formatDateTime(group.report.submittedAt)}</dd>
            )}
          </div>
        </dl>

        {group.round && (
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            연구기간 {formatDate(group.round.periodStart)} ~ {formatDate(group.round.periodEnd)} · 결과보고서
            제출 마감 {formatDateTime(group.round.reportDueAt)}
          </p>
        )}
      </section>

      {/* 참여자 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <h2 className="text-sm font-bold text-slate-800">참여자 ({group.memberCount}명)</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th scope="col" className="py-2 pr-3 font-semibold">직번</th>
                <th scope="col" className="py-2 pr-3 font-semibold">성명</th>
                <th scope="col" className="py-2 pr-3 font-semibold">소속</th>
                <th scope="col" className="py-2 font-semibold">직급</th>
              </tr>
            </thead>
            <tbody>
              {group.members.map((member) => (
                <tr key={member.id} className="border-b border-slate-100 text-slate-700">
                  <td className="py-2 pr-3 tabular-nums">{member.idNumber}</td>
                  <td className="py-2 pr-3">
                    {member.name}
                    {member.isLeader && (
                      <span className="ml-1 rounded bg-brand/10 px-1.5 py-0.5 text-xs font-semibold text-brand">
                        대표
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3">{member.affiliation}</td>
                  <td className="py-2">{member.position}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 산출물 */}
      {group.outputs.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
          <h2 className="text-sm font-bold text-slate-800">등록한 산출물 ({group.outputs.length}건)</h2>
          <ul className="mt-4 flex flex-col gap-3" role="list">
            {group.outputs.map((output) => (
              <li key={output.id} className="rounded-lg border border-slate-200 px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {output.outputType}
                  </span>
                  <span className="text-sm font-bold text-slate-800">{output.title}</span>
                  {output.driveUploaded && (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      드라이브 업로드 완료
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
                {output.description && (
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{output.description}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
