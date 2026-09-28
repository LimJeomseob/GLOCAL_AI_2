"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { inputBaseClass } from "@/components/ui/FormField";
import { StudyExpertAssignForm } from "@/components/admin/StudyExpertAssignForm";
import { formatDate, formatDateTime } from "@/lib/format";
import { toFinalScheduleInput, upsertStudyFinalSchedule } from "@/lib/studyAdmin";
import { STUDY_WORKSHOP_STEPS, studyCoachingSessionLabel } from "@/lib/studyGroupConstants";
import {
  studyFinalScheduleTeamSchema,
  type StudyFinalScheduleTeamInput,
} from "@/lib/studyValidation";
import type { StudyExpertApplication, StudyGroupWithRelations } from "@/lib/studyTypes";

type WhenKey = "step1When" | "step2When" | "step3When";
type DetailKey = "step1Detail" | "step2Detail" | "step3Detail";

function initialSteps(group: StudyGroupWithRelations): StudyFinalScheduleTeamInput {
  const input = toFinalScheduleInput(group.finalSchedule);
  return {
    step1When: input.step1When,
    step1Detail: input.step1Detail,
    step2When: input.step2When,
    step2Detail: input.step2Detail,
    step3When: input.step3When,
    step3Detail: input.step3Detail,
  };
}

/**
 * 운영현황 행 펼침 — 전문가 배정과 3단계 일정을 그 자리에서 고친다.
 *
 * 저장은 모두 대표자·전문가 화면이 읽는 같은 데이터로 간다.
 *  · 전문가: StudyExpertAssignForm — 연구모임 관리 상세 팝업과 같은 폼·저장 경로
 *  · 일정: study_final_schedules 단계 항목 — 대표자 '내 연구모임'·전문가 「배정 팀 확인」에 그대로 보인다
 */
export function StudyProgressRowEditor({
  group,
  experts,
  onSaved,
  onOpenScheduleDetail,
}: {
  group: StudyGroupWithRelations;
  /** 배정 후보 — 이 회차 등록 전문가(미선정·취소 제외) */
  experts: StudyExpertApplication[];
  /** 저장 성공 후 목록을 다시 읽는다. message는 상단 안내 문구. */
  onSaved: (message: string) => Promise<void>;
  /** 팀 구성·비고·공개 여부까지 포함한 최종 일정 전체 폼을 연다. */
  onOpenScheduleDetail: () => void;
}) {
  const [steps, setSteps] = useState<StudyFinalScheduleTeamInput>(() => initialSteps(group));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveSchedule() {
    setError(null);
    const parsed = studyFinalScheduleTeamSchema.safeParse(steps);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setBusy(true);
    const message = await upsertStudyFinalSchedule(group.id, {
      ...toFinalScheduleInput(group.finalSchedule),
      ...parsed.data,
    });
    setBusy(false);
    if (message) {
      setError(`일정 저장 실패: ${message}`);
      return;
    }
    await onSaved(`${group.code} 일정을 저장했습니다. 대표자·전문가 화면에 반영됩니다.`);
  }

  const schedule = group.finalSchedule;

  return (
    <div className="flex flex-col gap-4 bg-slate-50 px-4 py-4">
      {error && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      {schedule && !schedule.published && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          이 팀의 최종 일정은 비공개 상태입니다. 아래 「일정 상세 입력」에서 공개로 바꿔야 대표자·전문가
          화면에 보입니다.
        </p>
      )}

      {/* 전문가 배정 — 연구모임 관리 상세 팝업과 같은 폼 */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <StudyExpertAssignForm group={group} experts={experts} disabled={busy} onSaved={onSaved} />
      </section>

      {/* 3단계 일정 */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-slate-700">
            팀별 일정 (기획 · 제작 · 환류)
            {schedule?.team_no != null && (
              <span className="ml-2 font-normal text-slate-500">{schedule.team_no}팀</span>
            )}
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onOpenScheduleDetail} disabled={busy}>
              일정 상세 입력
            </Button>
            <Button size="sm" onClick={() => void saveSchedule()} disabled={busy}>
              {busy ? "저장 중..." : "일정 저장"}
            </Button>
          </div>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          팀 구성·비고·공개 여부·삭제는 「일정 상세 입력」에서 다룹니다.
        </p>

        <div className="mt-3 flex flex-col gap-3">
          {STUDY_WORKSHOP_STEPS.map((step) => {
            const whenKey = `step${step.order}When` as WhenKey;
            const detailKey = `step${step.order}Detail` as DetailKey;
            return (
              <div key={step.key} className="grid gap-2 sm:grid-cols-[5rem_14rem_1fr] sm:items-start">
                <span className="pt-2 text-xs font-bold text-brand">
                  {step.order}차 · {step.name}
                </span>
                <textarea
                  rows={2}
                  aria-label={`${step.name} 일자 및 시간`}
                  className={`${inputBaseClass} resize-y text-sm leading-relaxed`}
                  value={steps[whenKey]}
                  placeholder="일자 및 시간 (예: 10.14(수) 16:00~19:00)"
                  onChange={(e) => setSteps((p) => ({ ...p, [whenKey]: e.target.value }))}
                />
                <textarea
                  rows={2}
                  aria-label={`${step.name} 세부내용`}
                  className={`${inputBaseClass} resize-y text-sm leading-relaxed`}
                  value={steps[detailKey]}
                  placeholder="세부내용"
                  onChange={(e) => setSteps((p) => ({ ...p, [detailKey]: e.target.value }))}
                />
              </div>
            );
          })}
        </div>

        {schedule?.updated_by && (
          <p className="mt-3 text-xs text-slate-400">
            마지막 수정 {schedule.updated_by} · {formatDateTime(schedule.updated_at)}
          </p>
        )}
      </section>

      {/* 코칭 조율 내역(0026) — 팀·전문가가 잡은 일정과 메모. 관리자는 조회만 한다 */}
      {(group.coachingSessions.length > 0 || group.coachingMemos.length > 0) && (
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
      )}
    </div>
  );
}
