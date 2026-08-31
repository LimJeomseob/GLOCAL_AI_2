"use client";

import { useEffect, useId, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { StudyStatusBadge } from "@/components/study/StudyStatusBadge";
import { formatDate, formatDateTime } from "@/lib/format";
import { fetchStudyMeetings } from "@/lib/studyAdmin";
import type { StudyGroupWithRelations, StudyMeeting, StudyReport } from "@/lib/studyTypes";

export type SubmissionTab = "meetings" | "report" | "outputs";

/**
 * 운영현황 표에서 연 제출물 열람 창.
 *
 * 결과보고서·산출물은 목록 조회(fetchStudyGroups)에 이미 전문이 실려 있어 추가 조회가 없고,
 * 회의록만 본문이 빠져 있어 창을 열 때 지연 조회한다.
 *
 * 세 패널을 모두 DOM에 두고 비활성 탭은 hidden으로만 감춘다 — 인쇄 시 @media print 규칙이
 * 이를 되살려 한 번에 세 항목이 모두 출력되게 하기 위함이다.
 */
export function StudySubmissionModal({
  group,
  initialTab,
  onClose,
}: {
  group: StudyGroupWithRelations | null;
  initialTab: SubmissionTab;
  onClose: () => void;
}) {
  const titleId = useId();
  const [tab, setTab] = useState<SubmissionTab>(initialTab);
  const [meetings, setMeetings] = useState<StudyMeeting[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupId = group?.id ?? null;

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab, groupId]);

  useEffect(() => {
    if (!groupId) {
      setMeetings([]);
      setError(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await fetchStudyMeetings(groupId);
        if (active) setMeetings(data);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "회의록을 불러오지 못했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [groupId]);

  const TABS: { key: SubmissionTab; label: string }[] = [
    { key: "meetings", label: `회의록 (${group?.meetings.length ?? 0})` },
    { key: "report", label: "결과보고서" },
    { key: "outputs", label: `산출물 (${group?.outputs.length ?? 0})` },
  ];

  return (
    <Modal open={Boolean(group)} onClose={onClose} titleId={titleId} size="wide" printable>
      {group && (
        <>
          <h2 id={titleId} className="text-lg font-bold text-brand">
            {group.code} · {group.name}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StudyStatusBadge status={group.status} />
            <span className="text-xs text-slate-500">
              [{group.category}] · 대표자 {group.leader_name} ({group.leader_affiliation} ·{" "}
              {group.leader_position}) · 참여 {group.member_count}명
            </span>
          </div>

          <div
            role="tablist"
            aria-label="제출물 종류"
            data-print-hide
            className="mt-5 flex gap-1 border-b border-slate-200"
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                aria-controls={`${titleId}-${t.key}`}
                onClick={() => setTab(t.key)}
                className={clsx(
                  "-mb-px border-b-[3px] px-4 py-2 text-sm font-semibold transition-colors",
                  tab === t.key
                    ? "border-accent text-brand"
                    : "border-transparent text-slate-500 hover:text-brand"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <section
            id={`${titleId}-meetings`}
            role="tabpanel"
            hidden={tab !== "meetings"}
            data-print-show
            className="mt-5"
          >
            <h3 className="text-sm font-bold text-slate-800 print:mt-4">회의록</h3>
            {loading ? (
              <p role="status" className="mt-2 text-sm text-slate-500">
                불러오는 중...
              </p>
            ) : error ? (
              <p
                role="alert"
                className="mt-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
              >
                {error}
              </p>
            ) : meetings.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">등록된 회의록이 없습니다.</p>
            ) : (
              <ol className="mt-2 flex flex-col gap-3" role="list">
                {meetings.map((m, index) => (
                  <li key={m.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-sm font-bold text-slate-800">
                      <span className="mr-2 text-xs font-semibold text-slate-400">
                        {index + 1}회차
                      </span>
                      {m.subject}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(m.met_at)}
                      {m.start_time && ` · ${m.start_time.slice(0, 5)}`}
                      {m.end_time && `~${m.end_time.slice(0, 5)}`}
                      {m.location && ` · ${m.location}`}
                      {m.author_name && ` · 작성 ${m.author_name}`}
                    </p>
                    {m.content ? (
                      <p className="mt-3 whitespace-pre-wrap border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-700">
                        {m.content}
                      </p>
                    ) : (
                      <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-400">
                        (본문 없음)
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section
            id={`${titleId}-report`}
            role="tabpanel"
            hidden={tab !== "report"}
            data-print-show
            className="mt-5"
          >
            <ReportPanel report={group.report} />
          </section>

          <section
            id={`${titleId}-outputs`}
            role="tabpanel"
            hidden={tab !== "outputs"}
            data-print-show
            className="mt-5"
          >
            <h3 className="text-sm font-bold text-slate-800 print:mt-4">산출물</h3>
            {group.outputs.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">등록된 산출물이 없습니다.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2" role="list">
                {group.outputs.map((o) => (
                  <li key={o.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {o.output_type}
                      </span>
                      <span className="text-sm font-bold text-slate-800">{o.title}</span>
                      {o.drive_uploaded ? (
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
                      href={o.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block break-all text-xs text-accent underline underline-offset-2"
                    >
                      {o.url}
                    </a>
                    {o.description && (
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">{o.description}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div data-print-hide className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => window.print()}>
              인쇄
            </Button>
            <Button variant="outline" onClick={onClose}>
              닫기
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

/** 결과보고서 5개 항목. 목록 조회에 전문이 이미 실려 있어 추가 조회가 없다. */
function ReportPanel({ report }: { report: StudyReport | null }) {
  if (!report) {
    return (
      <>
        <h3 className="text-sm font-bold text-slate-800 print:mt-4">결과보고서</h3>
        <p className="mt-2 text-sm text-slate-500">제출된 결과보고서가 없습니다.</p>
      </>
    );
  }

  const sections: [string, string][] = [
    ["1. 연구모임의 구성 배경", report.section1_background],
    ["2. 연구모임의 연구 주제 및 목적", report.section2_topic_purpose],
    ["3. 연구모임의 운영 및 연구 내용", report.section3_operation],
    ["4. 연구모임 결과 및 활용 방안", report.section4_result_use],
    ["5. AI 활용 연구모임의 효과 및 제언", report.section5_effect_suggestion],
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-slate-800 print:mt-4">결과보고서</h3>
        {!report.submitted_at && (
          <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
            임시저장 (미제출)
          </span>
        )}
      </div>

      {(report.actual_period_start || report.actual_period_end) && (
        <p className="mt-2 text-xs text-slate-500">
          실제 수행기간 {report.actual_period_start ?? "-"} ~ {report.actual_period_end ?? "-"}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-4">
        {sections.map(([title, body]) => (
          <div key={title}>
            <p className="text-xs font-semibold text-slate-500">{title}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {body || "(작성 없음)"}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-slate-400">
        공백 제외 {report.char_count.toLocaleString()}자
        {report.submitted_at && ` · 제출 ${formatDateTime(report.submitted_at)}`}
      </p>
    </>
  );
}
