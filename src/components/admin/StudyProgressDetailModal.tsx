"use client";

import { useEffect, useId, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { StudyCoachingHistory } from "@/components/admin/StudyCoachingHistory";
import { formatDate, formatDateTime } from "@/lib/format";
import { fetchStudyMeetingsByGroup } from "@/lib/studyAdmin";
import {
  STUDY_COACHING_TARGET_COUNT,
  STUDY_MEETING_TARGET_COUNT,
  STUDY_REPORT_SECTIONS,
  type StudyReportSectionDef,
} from "@/lib/studyGroupConstants";
import type { StudyGroupWithRelations, StudyMeeting, StudyReport } from "@/lib/studyTypes";

export type StudyProgressDetailTab = "coaching" | "meetings" | "report";

/** 결과보고서 섹션 정의(camelCase key) → study_reports 컬럼 */
const REPORT_SECTION_COLUMNS: Record<StudyReportSectionDef["key"], keyof StudyReport> = {
  section1Background: "section1_background",
  section2TopicPurpose: "section2_topic_purpose",
  section3Operation: "section3_operation",
  section4ResultUse: "section4_result_use",
  section5EffectSuggestion: "section5_effect_suggestion",
};

function timeRange(start: string | null, end: string | null): string {
  if (!start) return "";
  return ` ${start.slice(0, 5)}${end ? `~${end.slice(0, 5)}` : ""}`;
}

/**
 * 운영현황 팀별 진척의 코칭·회의록·결과보고서 칸을 누르면 여는 읽기 전용 상세.
 * 코칭·결과보고서는 목록 조회 결과를 그대로 쓰고, 회의록은 본문이 필요해 열 때 따로 읽는다.
 */
export function StudyProgressDetailModal({
  group,
  tab,
  onTabChange,
  onClose,
}: {
  group: StudyGroupWithRelations;
  tab: StudyProgressDetailTab;
  onTabChange: (tab: StudyProgressDetailTab) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const coachingDone = group.coachingSessions.filter((s) => s.status === "확정").length;
  const reportDone = Boolean(group.report?.submitted_at);

  const tabs: { key: StudyProgressDetailTab; label: string }[] = [
    { key: "coaching", label: `코칭 (확정 ${coachingDone}/${STUDY_COACHING_TARGET_COUNT})` },
    { key: "meetings", label: `회의록 (${group.meetings.length}/${STUDY_MEETING_TARGET_COUNT})` },
    { key: "report", label: `결과보고서 (${reportDone ? "제출" : "미제출"})` },
  ];

  return (
    <Modal open onClose={onClose} titleId={titleId} size="lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={titleId} className="text-lg font-bold text-brand">
            {group.code} · {group.name}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            [{group.category}] · 대표자 {group.leader_name} ({group.leader_affiliation},{" "}
            {group.leader_position})
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>
          닫기
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => onTabChange(t.key)}
            className={clsx(
              "rounded-full px-3 py-1.5 text-xs font-semibold",
              tab === t.key
                ? "bg-brand text-white"
                : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "coaching" && (
          <StudyCoachingHistory group={group} emptyText="조율된 코칭 일정이 아직 없습니다." />
        )}
        {tab === "meetings" && <MeetingsPanel groupId={group.id} />}
        {tab === "report" && <ReportPanel report={group.report} />}
      </div>
    </Modal>
  );
}

function MeetingsPanel({ groupId }: { groupId: string }) {
  const [rows, setRows] = useState<StudyMeeting[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setRows(null);
    setError(null);
    fetchStudyMeetingsByGroup(groupId)
      .then((data) => {
        if (active) setRows(data);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "회의록을 불러오지 못했습니다.");
      });
    return () => {
      active = false;
    };
  }, [groupId]);

  if (error) {
    return (
      <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
        {error}
      </p>
    );
  }

  if (!rows) {
    return (
      <p role="status" className="py-8 text-center text-sm text-slate-500">
        회의록을 불러오는 중...
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
        제출된 회의록이 없습니다.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3" role="list">
      {rows.map((m, i) => (
        <li key={m.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-baseline gap-2">
            {/* 최신순으로 보여 주되 차수는 오래된 순으로 매긴다 */}
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              제{rows.length - i}차
            </span>
            <span className="text-sm font-bold text-slate-800">{m.subject}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {formatDate(m.met_at)}
            {timeRange(m.start_time, m.end_time)}
            {m.location && ` · ${m.location}`}
            {m.author_name && ` · 작성 ${m.author_name}`}
          </p>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {m.content || "(내용 없음)"}
          </p>
        </li>
      ))}
    </ul>
  );
}

function ReportPanel({ report }: { report: StudyReport | null }) {
  if (!report) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
        결과보고서가 아직 작성되지 않았습니다.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        {report.submitted_at ? (
          <span className="rounded bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
            제출 {formatDateTime(report.submitted_at)}
          </span>
        ) : (
          <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
            임시저장(미제출)
          </span>
        )}
        {(report.actual_period_start || report.actual_period_end) && (
          <span>
            실제 운영기간{" "}
            {report.actual_period_start ? formatDate(report.actual_period_start) : "?"} ~{" "}
            {report.actual_period_end ? formatDate(report.actual_period_end) : "?"}
          </span>
        )}
        <span className="text-slate-400">· {report.char_count.toLocaleString()}자</span>
      </div>

      {STUDY_REPORT_SECTIONS.map((section) => {
        const body = String(report[REPORT_SECTION_COLUMNS[section.key]] ?? "");
        return (
          <section key={section.key} className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-bold text-slate-800">
              {section.no}. {section.title}
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {body.trim() ? body : <span className="text-slate-400">(작성 안 함)</span>}
            </p>
          </section>
        );
      })}
    </div>
  );
}
