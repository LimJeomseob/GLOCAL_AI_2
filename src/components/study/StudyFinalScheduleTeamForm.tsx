"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import { submitStudy } from "@/lib/studyApi";
import {
  studyFinalScheduleTeamSchema,
  type StudyFinalScheduleTeamInput,
} from "@/lib/studyValidation";
import type { StudyIdentity, StudyLookupFinalSchedule, StudyLookupResult } from "@/lib/studyTypes";

type FormState = StudyFinalScheduleTeamInput;
type FieldErrors = Partial<Record<keyof FormState, string>>;

type WhenKey = "step1When" | "step2When" | "step3When";
type DetailKey = "step1Detail" | "step2Detail" | "step3Detail";

function initialForm(schedule: StudyLookupFinalSchedule): FormState {
  const step = (no: number) => schedule.steps.find((s) => s.no === no);
  return {
    step1When: step(1)?.when ?? "",
    step1Detail: step(1)?.detail ?? "",
    step2When: step(2)?.when ?? "",
    step2Detail: step(2)?.detail ?? "",
    step3When: step(3)?.when ?? "",
    step3Detail: step(3)?.detail ?? "",
  };
}

/**
 * 팀별 최종 일정 수정(대표자) — '내 연구모임'의 「팀별 최종 일정 · 전문가 배정 결과」를 고친다.
 *
 * 고칠 수 있는 것은 3단계(기획·제작·환류)의 일자·시간과 세부내용뿐이다. 팀 구성·AI 전문가는
 * AI융합원이 배정한 값이라 읽기 전용으로 보여 준다. 저장하면 관리자 화면에 "팀 대표자 OOO"가
 * 마지막 수정자로 남는다.
 */
export function StudyFinalScheduleTeamForm({
  group,
  schedule,
  identity,
  onSaved,
  onCancel,
}: {
  group: StudyLookupResult;
  schedule: StudyLookupFinalSchedule;
  identity: StudyIdentity;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => initialForm(schedule));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updateField(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveError(null);

    const parsed = studyFinalScheduleTeamSchema.safeParse(form);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormState;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});

    setSaving(true);
    const { error } = await submitStudy(
      { kind: "final-schedule-save", groupId: group.groupId, ...identity, ...parsed.data },
      "일정 저장 중 오류가 발생했습니다."
    );
    setSaving(false);

    if (error) {
      setSaveError(error);
      return;
    }
    await onSaved();
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6"
    >
      <div>
        <h2 className="text-base font-bold text-slate-800">최종 일정 수정</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          3단계(기획·제작·환류)의 일자·시간과 세부내용을 고칠 수 있습니다. 일시는 자유롭게 적어 주세요(예:
          10.14(수) 16:00~19:00, 미정). 저장한 내용은 AI융합원에도 함께 보입니다.
        </p>
      </div>

      <dl className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold text-slate-500">팀 · 구성</dt>
          <dd className="mt-0.5 whitespace-pre-line text-slate-700">
            {schedule.teamNo != null && `${schedule.teamNo}팀 · `}
            {schedule.composition || "–"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-slate-500">AI 전문가</dt>
          <dd className="mt-0.5 whitespace-pre-line text-slate-700">{schedule.expertLabel || "–"}</dd>
        </div>
        <p className="text-xs text-slate-500 sm:col-span-2">
          팀 구성·AI 전문가 변경은 AI융합원으로 문의해 주세요.
        </p>
      </dl>

      {schedule.steps.map((step) => {
        const whenKey = `step${step.no}When` as WhenKey;
        const detailKey = `step${step.no}Detail` as DetailKey;
        return (
          <fieldset key={step.no} className="rounded-xl border border-slate-200 p-4">
            <legend className="px-2 text-sm font-bold text-brand">
              {step.no}차 · {step.label}
            </legend>
            <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
              <FormField label="일자 및 시간" error={errors[whenKey]}>
                {(inputProps) => (
                  <textarea
                    {...inputProps}
                    rows={2}
                    className={`${inputBaseClass} resize-y leading-relaxed`}
                    value={form[whenKey]}
                    placeholder="예: 10.14(수) 16:00~19:00"
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

      {saveError && (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {saveError}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          취소
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "저장 중..." : "일정 저장"}
        </Button>
      </div>
    </form>
  );
}
