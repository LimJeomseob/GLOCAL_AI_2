"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import {
  assignStudyGroupExpert,
  deleteStudyFinalSchedule,
  upsertStudyFinalSchedule,
} from "@/lib/studyAdmin";
import { STUDY_WORKSHOP_STEPS } from "@/lib/studyGroupConstants";
import { studyFinalScheduleSchema, type StudyFinalScheduleInput } from "@/lib/studyValidation";
import type { StudyGroupWithRelations } from "@/lib/studyTypes";

interface FormState {
  teamNo: string;
  composition: string;
  expertLabel: string;
  step1When: string;
  step1Detail: string;
  step2When: string;
  step2Detail: string;
  step3When: string;
  step3Detail: string;
  note: string;
  published: boolean;
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

type StepWhenKey = "step1When" | "step2When" | "step3When";
type StepDetailKey = "step1Detail" | "step2Detail" | "step3Detail";

function initialForm(group: StudyGroupWithRelations): FormState {
  const s = group.finalSchedule;
  return {
    teamNo: s?.team_no != null ? String(s.team_no) : "",
    composition: s?.composition ?? "",
    expertLabel: s?.expert_label ?? "",
    step1When: s?.step1_when ?? "",
    step1Detail: s?.step1_detail ?? "",
    step2When: s?.step2_when ?? "",
    step2Detail: s?.step2_detail ?? "",
    step3When: s?.step3_when ?? "",
    step3Detail: s?.step3_detail ?? "",
    note: s?.note ?? "",
    published: s?.published ?? true,
  };
}

interface StudyFinalScheduleModalProps {
  group: StudyGroupWithRelations;
  onClose: () => void;
  /** 저장·삭제 성공 후 호출 — 목록을 다시 불러온다. */
  onSaved: (message: string) => void | Promise<void>;
}

/**
 * 팀별 최종 일정 · 전문가 배정 결과 입력(0027).
 *
 * AI융합원이 확정한 공지 표(팀 구성 · 배정 AI 전문가 · 기획/제작/환류 일시와 세부내용)를
 * 팀당 1행으로 저장한다. 일시는 "미정", "2안 10.21(수)"처럼 원문 서식을 그대로 두는 자유 텍스트라
 * 날짜 입력기를 쓰지 않는다. 저장하면 대표자가 '내 연구모임'에서 자기 팀 것만 본다.
 */
export function StudyFinalScheduleModal({ group, onClose, onSaved }: StudyFinalScheduleModalProps) {
  const [form, setForm] = useState<FormState>(() => initialForm(group));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const titleId = useId();

  const exists = Boolean(group.finalSchedule);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): StudyFinalScheduleInput | null {
    const teamNoRaw = form.teamNo.trim();
    const parsed = studyFinalScheduleSchema.safeParse({
      ...form,
      teamNo: teamNoRaw === "" ? null : Number(teamNoRaw),
    });

    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormState;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return null;
    }
    setErrors({});
    return parsed.data;
  }

  async function handleSave() {
    setSaveError(null);
    const input = validate();
    if (!input) return;

    setBusy(true);
    const message = await upsertStudyFinalSchedule(group.id, input);
    // 'AI 전문가' 표기를 교내 전문가가 아닌 사람으로 바꾸면 교내 연결(expert_id)을 푼다 —
    // 두 값이 어긋나면 운영현황·연구모임 관리·전문가 「배정 팀 확인」이 서로 다른 전문가를 보인다.
    const unlink =
      !message &&
      group.expert !== null &&
      input.expertLabel.split("\n")[0].trim() !== group.expert.name.trim();
    const unlinkError = unlink ? await assignStudyGroupExpert(group.id, null) : null;
    setBusy(false);

    if (message) {
      setSaveError(`저장 실패: ${message}`);
      return;
    }
    if (unlinkError) {
      setSaveError(`일정은 저장했지만 교내 전문가 연결 해제 실패: ${unlinkError}`);
      return;
    }
    await onSaved(
      unlink
        ? `${group.code} 최종 일정을 저장했습니다. AI 전문가 표기가 바뀌어 교내 전문가(${group.expert!.name}) 연결을 해제했습니다.`
        : `${group.code} 최종 일정을 저장했습니다.`
    );
  }

  async function handleDelete() {
    if (!window.confirm("이 팀의 최종 일정 공지를 삭제할까요? 대표자 화면에서 섹션이 사라집니다.")) {
      return;
    }
    setSaveError(null);
    setBusy(true);
    const message = await deleteStudyFinalSchedule(group.id);
    setBusy(false);

    if (message) {
      setSaveError(`삭제 실패: ${message}`);
      return;
    }
    await onSaved(`${group.code} 최종 일정을 삭제했습니다.`);
  }

  return (
    <Modal open onClose={onClose} titleId={titleId} size="lg">
      <h2 id={titleId} className="text-lg font-bold text-brand">
        {group.code} · 최종 일정 · 전문가 배정 결과
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        {group.name} · 대표자 {group.leader_name}. 일시는 확정표 원문 그대로 적어 주세요(예: 미정,
        10.20(화) / 2안 10.21(수)). 저장하면 대표자가 「내 연구모임」에서 자기 팀 일정만 확인합니다.
      </p>

      {saveError && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {saveError}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-5">
        <fieldset className="rounded-xl border border-slate-200 p-4">
          <legend className="px-2 text-sm font-bold text-slate-800">팀 · 전문가</legend>
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <FormField label="팀 번호" error={errors.teamNo} hint="공지 표의 번호(1~10)">
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={99}
                  className={inputBaseClass}
                  value={form.teamNo}
                  onChange={(e) => updateField("teamNo", e.target.value)}
                />
              )}
            </FormField>
            <FormField
              label="구성"
              error={errors.composition}
              hint="예: 팀장 OOO 등 5명 / (고급 1, 실시간 비대면) — 줄바꿈 가능"
            >
              {(inputProps) => (
                <textarea
                  {...inputProps}
                  rows={2}
                  className={`${inputBaseClass} resize-y leading-relaxed`}
                  value={form.composition}
                  onChange={(e) => updateField("composition", e.target.value)}
                />
              )}
            </FormField>
          </div>
          <div className="mt-4">
            <FormField
              label="AI 전문가"
              error={errors.expertLabel}
              hint={
                group.expert
                  ? `현재 교내 전문가 ${group.expert.name} 연결됨 — 첫 줄 이름을 바꾸면 교내 연결이 해제됩니다. 교내 전문가 변경은 '배정 전문가'에서 하세요.`
                  : "예: OOO / (소속·직위) — 외부 전문가도 그대로 적습니다. 개별 학습 팀은 '개별 학습'"
              }
            >
              {(inputProps) => (
                <textarea
                  {...inputProps}
                  rows={2}
                  className={`${inputBaseClass} resize-y leading-relaxed`}
                  value={form.expertLabel}
                  onChange={(e) => updateField("expertLabel", e.target.value)}
                />
              )}
            </FormField>
          </div>
        </fieldset>

        {STUDY_WORKSHOP_STEPS.map((step) => {
          const whenKey = `step${step.order}When` as StepWhenKey;
          const detailKey = `step${step.order}Detail` as StepDetailKey;
          return (
            <fieldset key={step.key} className="rounded-xl border border-slate-200 p-4">
              <legend className="px-2 text-sm font-bold text-slate-800">
                {step.order}차 · {step.name}
                <span className="ml-2 text-xs font-normal text-slate-500">{step.detail}</span>
              </legend>
              <div className="flex flex-col gap-4">
                <FormField label="일자 및 시간" error={errors[whenKey]}>
                  {(inputProps) => (
                    <textarea
                      {...inputProps}
                      rows={2}
                      className={`${inputBaseClass} resize-y leading-relaxed`}
                      value={form[whenKey]}
                      onChange={(e) => updateField(whenKey, e.target.value)}
                    />
                  )}
                </FormField>
                <FormField label="세부내용" error={errors[detailKey]}>
                  {(inputProps) => (
                    <textarea
                      {...inputProps}
                      rows={2}
                      className={`${inputBaseClass} resize-y leading-relaxed`}
                      value={form[detailKey]}
                      onChange={(e) => updateField(detailKey, e.target.value)}
                    />
                  )}
                </FormField>
              </div>
            </fieldset>
          );
        })}

        <fieldset className="rounded-xl border border-slate-200 p-4">
          <legend className="px-2 text-sm font-bold text-slate-800">비고 · 공개</legend>
          <FormField label="비고" error={errors.note}>
            {(inputProps) => (
              <textarea
                {...inputProps}
                rows={2}
                className={`${inputBaseClass} resize-y leading-relaxed`}
                value={form.note}
                onChange={(e) => updateField("note", e.target.value)}
              />
            )}
          </FormField>
          <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.published}
              onChange={(e) => updateField("published", e.target.checked)}
            />
            <span>
              대표자 화면에 공개
              <span className="block text-xs text-slate-500">
                끄면 저장은 되지만 「내 연구모임」에는 표시되지 않습니다(입력 중일 때).
              </span>
            </span>
          </label>
        </fieldset>
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between">
        <div>
          {exists && (
            <Button
              variant="ghost"
              className="text-red-600 hover:bg-red-50"
              onClick={() => void handleDelete()}
              disabled={busy}
            >
              삭제
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button variant="primary" onClick={() => void handleSave()} disabled={busy}>
            {busy ? "저장 중..." : "저장"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
