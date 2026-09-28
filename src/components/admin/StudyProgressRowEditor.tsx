"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { inputBaseClass } from "@/components/ui/FormField";
import { formatDateTime } from "@/lib/format";
import {
  assignStudyGroupExpertWithLabel,
  formatExpertLabel,
  toFinalScheduleInput,
  upsertStudyFinalSchedule,
  type StudyExpertChoice,
} from "@/lib/studyAdmin";
import { STUDY_WORKSHOP_STEPS } from "@/lib/studyGroupConstants";
import {
  studyFinalScheduleTeamSchema,
  type StudyFinalScheduleTeamInput,
} from "@/lib/studyValidation";
import type { StudyExpertApplication, StudyGroupWithRelations } from "@/lib/studyTypes";

const MANUAL = "__manual__";
const NONE = "";

type WhenKey = "step1When" | "step2When" | "step3When";
type DetailKey = "step1Detail" | "step2Detail" | "step3Detail";

/** 현재 배정 상태를 select 값으로 — 교내 연결이 있으면 그 전문가, 표기만 있으면 직접 입력 */
function initialChoice(group: StudyGroupWithRelations): string {
  if (group.expert_id) return group.expert_id;
  if (group.finalSchedule?.expert_label) return MANUAL;
  return NONE;
}

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
 *  · 전문가: assignStudyGroupExpertWithLabel — 교내 연결(expert_id)과 팀 화면 'AI 전문가' 표기를 함께 갱신
 *  · 일정: study_final_schedules 단계 항목 — 대표자 '내 연구모임'·전문가 「배정 팀 확인」에 그대로 보인다
 */
export function StudyProgressRowEditor({
  group,
  experts,
  onSaved,
}: {
  group: StudyGroupWithRelations;
  /** 배정 후보 — 이 회차에서 선정된 교내 전문가 */
  experts: StudyExpertApplication[];
  /** 저장 성공 후 목록을 다시 읽는다. message는 상단 안내 문구. */
  onSaved: (message: string) => Promise<void>;
}) {
  const [choice, setChoice] = useState<string>(() => initialChoice(group));
  const [manualLabel, setManualLabel] = useState<string>(() =>
    group.expert_id ? "" : (group.finalSchedule?.expert_label ?? "")
  );
  const [steps, setSteps] = useState<StudyFinalScheduleTeamInput>(() => initialSteps(group));
  const [busy, setBusy] = useState<"expert" | "schedule" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectId = useId();

  const listedExpert = experts.find((e) => e.id === choice) ?? null;
  // 선정 목록에서 빠진(상태가 바뀐) 교내 전문가가 배정돼 있으면 선택지에 남겨 현재 값을 보여 준다.
  const orphanExpert =
    group.expert && !experts.some((e) => e.id === group.expert!.id) ? group.expert : null;

  async function saveExpert() {
    setError(null);
    let next: StudyExpertChoice;
    if (choice === MANUAL) {
      if (!manualLabel.trim()) {
        setError("직접 입력할 전문가 이름·소속을 적어 주세요.");
        return;
      }
      if (manualLabel.trim().length > 500) {
        setError("AI 전문가는 500자 이내로 입력해 주세요.");
        return;
      }
      next = { kind: "manual", label: manualLabel };
    } else if (choice === NONE) {
      next = { kind: "none" };
    } else {
      const expert = listedExpert ?? (orphanExpert?.id === choice ? orphanExpert : null);
      if (!expert) {
        setError("선택한 전문가를 찾을 수 없습니다. 새로고침해 주세요.");
        return;
      }
      next = { kind: "listed", expert };
    }

    setBusy("expert");
    const message = await assignStudyGroupExpertWithLabel(group, next);
    setBusy(null);
    if (message) {
      setError(message);
      return;
    }
    await onSaved(
      next.kind === "none"
        ? `${group.code} 전문가 배정을 해제했습니다.`
        : `${group.code} 전문가를 배정했습니다. 대표자·전문가 화면에 반영됩니다.`
    );
  }

  async function saveSchedule() {
    setError(null);
    const parsed = studyFinalScheduleTeamSchema.safeParse(steps);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setBusy("schedule");
    const message = await upsertStudyFinalSchedule(group.id, {
      ...toFinalScheduleInput(group.finalSchedule),
      ...parsed.data,
    });
    setBusy(null);
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
          이 팀의 최종 일정은 비공개 상태입니다. 「연구모임 관리」 상세 팝업에서 공개로 바꿔야 대표자·전문가
          화면에 보입니다.
        </p>
      )}

      {/* 전문가 배정 */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label htmlFor={selectId} className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
            AI 전문가 배정
            <select
              id={selectId}
              className={`${inputBaseClass} min-w-[16rem]`}
              value={choice}
              disabled={busy !== null}
              onChange={(e) => setChoice(e.target.value)}
            >
              <option value={NONE}>미배정</option>
              {experts.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({[e.affiliation, e.position].filter(Boolean).join(" ")}) · 교내
                </option>
              ))}
              {orphanExpert && (
                <option value={orphanExpert.id}>{orphanExpert.name} · 교내(선정 해제됨)</option>
              )}
              <option value={MANUAL}>직접 입력 (외부 전문가)</option>
            </select>
          </label>
          <Button size="sm" onClick={() => void saveExpert()} disabled={busy !== null}>
            {busy === "expert" ? "저장 중..." : "배정 저장"}
          </Button>
        </div>

        {choice === MANUAL && (
          <label className="mt-3 flex flex-col gap-1 text-xs font-semibold text-slate-700">
            전문가 이름 · 소속
            <textarea
              rows={2}
              className={`${inputBaseClass} resize-y leading-relaxed`}
              value={manualLabel}
              placeholder={"예: 박용규\n(Vessl 이사)"}
              onChange={(e) => setManualLabel(e.target.value)}
            />
          </label>
        )}

        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          {choice === MANUAL
            ? "외부 전문가는 대표자 화면의 'AI 전문가' 표기만 바뀝니다. 전문가용 「배정 팀 확인」에는 나타나지 않습니다."
            : listedExpert
              ? `대표자 화면에 "${formatExpertLabel(listedExpert).replace("\n", " ")}"로 표시되고, 이 전문가의 「배정 팀 확인」에 팀이 나타납니다.`
              : experts.length === 0
                ? "이 회차에 선정된 교내 전문가가 없습니다. 「전문가 신청자」에서 선정하거나 '직접 입력'을 쓰세요."
                : "선정된 교내 전문가를 고르거나, 목록에 없으면 '직접 입력'을 쓰세요."}
        </p>
      </section>

      {/* 3단계 일정 */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-slate-700">팀별 일정 (기획 · 제작 · 환류)</h3>
          <Button size="sm" onClick={() => void saveSchedule()} disabled={busy !== null}>
            {busy === "schedule" ? "저장 중..." : "일정 저장"}
          </Button>
        </div>

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
    </div>
  );
}
