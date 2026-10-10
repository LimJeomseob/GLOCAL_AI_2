"use client";

import { formatDate } from "@/lib/format";
import { studyCoachingSessionLabel } from "@/lib/studyGroupConstants";
import type { StudyGroupWithRelations } from "@/lib/studyTypes";

/**
 * 코칭 조율 내역(0026) — 팀·전문가가 잡은 일정과 메모. 관리자는 조회만 한다.
 * 운영현황 행 펼침과 상세 모달이 함께 쓴다. emptyText가 없으면 0건일 때 아무것도 그리지 않는다.
 */
export function StudyCoachingHistory({
  group,
  emptyText,
}: {
  group: StudyGroupWithRelations;
  emptyText?: string;
}) {
  const hasHistory = group.coachingSessions.length > 0 || group.coachingMemos.length > 0;

  if (!hasHistory) {
    if (!emptyText) return null;
    return (
      <div className="flex flex-col gap-2">
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
          {emptyText}
        </p>
        {group.expert && (
          <p className="text-xs text-slate-500">
            배정 전문가: {group.expert.name} · {group.expert.phone} · {group.expert.email}
          </p>
        )}
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-xs font-bold text-slate-700">코칭 조율 내역</h3>
      {group.coachingSessions.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-xs text-slate-600" role="list">
          {group.coachingSessions.map((s) => (
            <li key={s.id}>
              <span className="font-semibold text-slate-700">
                {studyCoachingSessionLabel(s.session_no)}
              </span>{" "}
              {formatDate(s.met_at)}
              {s.start_time && ` ${s.start_time.slice(0, 5)}`}
              {s.end_time && `~${s.end_time.slice(0, 5)}`}
              {s.location && ` · ${s.location}`}
              <span className={s.status === "확정" ? "ml-2 font-bold text-brand" : "ml-2 text-slate-500"}>
                {s.status}
              </span>
              {s.expert_note && <span className="ml-2 text-slate-400">({s.expert_note})</span>}
            </li>
          ))}
        </ul>
      )}
      {group.coachingMemos.length > 0 && (
        <div className="mt-3 border-t border-slate-200 pt-2">
          <p className="text-xs font-semibold text-slate-700">조율 메모</p>
          <ul className="mt-1 flex flex-col gap-1 text-xs text-slate-600" role="list">
            {group.coachingMemos.map((m) => (
              <li key={m.id}>
                <span className="font-semibold text-slate-500">
                  {m.author_role}
                  {m.author_name && ` ${m.author_name}`}
                </span>{" "}
                {m.body}
              </li>
            ))}
          </ul>
        </div>
      )}
      {group.expert && (
        <p className="mt-2 text-xs text-slate-500">
          배정 전문가 연락처: {group.expert.phone} · {group.expert.email}
        </p>
      )}
    </section>
  );
}
