"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import { formatPhoneInput } from "@/lib/format";
import { studyExpertAdminSchema } from "@/lib/studyValidation";
import {
  createStudyExpertApplication,
  updateStudyExpertApplication,
} from "@/lib/studyAdmin";
import { STUDY_CATEGORY_FALLBACK } from "@/lib/studyGroupConstants";
import {
  STUDY_EXPERT_STATUSES,
  STUDY_EXPERT_STATUS_LABELS,
  type StudyCategory,
  type StudyExpertApplication,
  type StudyExpertStatus,
  type StudyRound,
} from "@/lib/studyTypes";

interface FormState {
  name: string;
  affiliation: string;
  position: string;
  idNumber: string;
  phone: string;
  email: string;
  isNontenured: boolean;
  categories: StudyCategory[];
  aiTools: string;
  experience: string;
  status: StudyExpertStatus;
  note: string;
}

type FieldErrors = Partial<Record<keyof FormState | "roundId", string>>;

function initialForm(row: StudyExpertApplication | null): FormState {
  return {
    name: row?.name ?? "",
    affiliation: row?.affiliation ?? "",
    position: row?.position ?? "",
    idNumber: row?.id_number ?? "",
    phone: row?.phone ?? "",
    email: row?.email ?? "",
    isNontenured: row?.is_nontenured ?? false,
    categories: row?.categories ?? [],
    aiTools: row?.ai_tools ?? "",
    experience: row?.experience ?? "",
    status: row?.status ?? "submitted",
    note: row?.note ?? "",
  };
}

interface ExpertApplicationFormModalProps {
  mode: "create" | "edit";
  round: StudyRound;
  /** 수정 모드의 대상 행 */
  initial?: StudyExpertApplication | null;
  onClose: () => void;
  onSaved: (row: StudyExpertApplication) => void;
}

/**
 * 관리자 전용 전문가 신청 등록·수정 화면.
 *
 * 공개 재제출은 신청 구간 안에서 `submitted` 상태일 때만 되므로, 마감 후의 정정과 오프라인·유선
 * 접수의 소급 등록은 이 경로로 처리한다. 검증 규칙은 공개 신청 스키마를 상속한 studyExpertAdminSchema다.
 * 교원 구분·경험은 공개 폼에서 빠진 항목이지만 관리자 표·엑셀이 계속 쓰므로 여기서 입력받는다.
 */
export function ExpertApplicationFormModal({
  mode,
  round,
  initial = null,
  onClose,
  onSaved,
}: ExpertApplicationFormModalProps) {
  const [form, setForm] = useState<FormState>(() => initialForm(initial));
  const [offlineConfirmed, setOfflineConfirmed] = useState(mode === "edit");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const titleId = useId();
  const confirmId = useId();
  const categories = round.categories?.length ? round.categories : STUDY_CATEGORY_FALLBACK;

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleCategory(key: StudyCategory) {
    setForm((prev) => ({
      ...prev,
      categories: prev.categories.includes(key)
        ? prev.categories.filter((c) => c !== key)
        : [...prev.categories, key],
    }));
  }

  async function handleSave() {
    setSaveError(null);

    if (mode === "create" && !offlineConfirmed) {
      setSaveError("오프라인 확인 항목에 체크해 주세요.");
      return;
    }

    const parsed = studyExpertAdminSchema.safeParse({ ...form, roundId: round.id });
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});

    // 화면 클릭 순서가 아니라 카테고리 정의 순서로 저장한다(목록·엑셀 정렬을 일정하게).
    const orderedCategories = categories
      .map((c) => c.key)
      .filter((key) => parsed.data.categories.includes(key)) as StudyCategory[];

    const payload = {
      name: parsed.data.name,
      affiliation: parsed.data.affiliation,
      position: parsed.data.position,
      id_number: parsed.data.idNumber,
      phone: parsed.data.phone,
      email: parsed.data.email,
      is_nontenured: parsed.data.isNontenured,
      experience: parsed.data.experience,
      categories: orderedCategories,
      ai_tools: parsed.data.aiTools,
      status: parsed.data.status,
      note: parsed.data.note,
    };

    setSaving(true);

    if (mode === "create") {
      const { row, error } = await createStudyExpertApplication(round.id, payload);
      setSaving(false);
      if (error || !row) {
        setSaveError(error ?? "등록에 실패했습니다.");
        return;
      }
      onSaved(row);
      return;
    }

    if (!initial) {
      setSaving(false);
      setSaveError("수정 대상을 찾을 수 없습니다.");
      return;
    }

    const message = await updateStudyExpertApplication(initial.id, payload);
    setSaving(false);
    if (message) {
      setSaveError(message);
      return;
    }
    onSaved({ ...initial, ...payload });
  }

  return (
    <Modal open onClose={onClose} titleId={titleId} size="lg">
      <h2 id={titleId} className="text-lg font-bold text-brand">
        {mode === "create" ? "전문가 신청자 추가" : `${initial?.code} · 신청 내용 수정`}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        {mode === "create"
          ? `${round.title} 회차로 등록합니다. 접수번호는 저장할 때 자동으로 채번됩니다.`
          : "신청자가 직접 고칠 수 없는 접수 건을 관리자가 정정합니다."}
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
          <legend className="px-2 text-sm font-bold text-slate-800">신청자</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="성명" required error={errors.name}>
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="text"
                  className={inputBaseClass}
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                />
              )}
            </FormField>
            <FormField label="직번" required error={errors.idNumber}>
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="text"
                  className={inputBaseClass}
                  value={form.idNumber}
                  onChange={(e) => updateField("idNumber", e.target.value)}
                />
              )}
            </FormField>
            <FormField label="소속" required error={errors.affiliation}>
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="text"
                  className={inputBaseClass}
                  value={form.affiliation}
                  placeholder="예: 경상국립대학교 OO학과"
                  onChange={(e) => updateField("affiliation", e.target.value)}
                />
              )}
            </FormField>
            <FormField label="직급" required error={errors.position}>
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="text"
                  className={inputBaseClass}
                  value={form.position}
                  onChange={(e) => updateField("position", e.target.value)}
                />
              )}
            </FormField>
            <FormField label="연락처" required error={errors.phone}>
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="tel"
                  className={inputBaseClass}
                  value={form.phone}
                  placeholder="010-1234-5678"
                  onChange={(e) => updateField("phone", formatPhoneInput(e.target.value))}
                />
              )}
            </FormField>
            <FormField label="이메일" required error={errors.email}>
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="email"
                  className={inputBaseClass}
                  value={form.email}
                  placeholder="example@gnu.ac.kr"
                  onChange={(e) => updateField("email", e.target.value)}
                />
              )}
            </FormField>
            <FormField label="교원 구분">
              {(inputProps) => (
                <select
                  {...inputProps}
                  className={inputBaseClass}
                  value={form.isNontenured ? "nontenured" : "tenured"}
                  onChange={(e) => updateField("isNontenured", e.target.value === "nontenured")}
                >
                  <option value="tenured">전임</option>
                  <option value="nontenured">비전임</option>
                </select>
              )}
            </FormField>
            <FormField label="상태" error={errors.status}>
              {(inputProps) => (
                <select
                  {...inputProps}
                  className={inputBaseClass}
                  value={form.status}
                  onChange={(e) => updateField("status", e.target.value as StudyExpertStatus)}
                >
                  {STUDY_EXPERT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STUDY_EXPERT_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          </div>
        </fieldset>

        <fieldset className="rounded-xl border border-slate-200 p-4">
          <legend className="px-2 text-sm font-bold text-slate-800">전문 분야</legend>

          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-semibold text-slate-800">
              지도 가능 카테고리
              <span className="ml-1 text-red-600" aria-hidden="true">
                *
              </span>
            </p>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              {categories.map((c) => {
                const checked = form.categories.includes(c.key);
                return (
                  <label
                    key={c.key}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm transition-colors ${
                      checked ? "border-accent bg-accent/5" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-accent focus:ring-accent"
                      checked={checked}
                      onChange={() => toggleCategory(c.key)}
                    />
                    <span>
                      <span className="font-semibold text-slate-800">[{c.key}]</span>{" "}
                      <span className="text-slate-700">{c.label}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {errors.categories && (
              <p role="alert" className="text-xs font-medium text-red-600">
                {errors.categories}
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-4">
            <FormField label="주요 활용 AI 도구" error={errors.aiTools}>
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="text"
                  className={inputBaseClass}
                  value={form.aiTools}
                  placeholder="예: ChatGPT(GPTs), NotebookLM, Claude"
                  onChange={(e) => updateField("aiTools", e.target.value)}
                />
              )}
            </FormField>
            <FormField
              label="생성형 AI 활용 교수법 또는 연구 경험"
              error={errors.experience}
              hint="선택 항목. 현재 공개 신청 화면에서는 받지 않는 항목입니다."
            >
              {(inputProps) => (
                <textarea
                  {...inputProps}
                  rows={4}
                  className={`${inputBaseClass} resize-y leading-relaxed`}
                  value={form.experience}
                  onChange={(e) => updateField("experience", e.target.value)}
                />
              )}
            </FormField>
          </div>
        </fieldset>

        <FormField
          label="관리자 메모"
          error={errors.note}
          hint="배정 연구모임, 연락 결과 등. 신청자에게는 보이지 않습니다."
        >
          {(inputProps) => (
            <textarea
              {...inputProps}
              rows={3}
              className={`${inputBaseClass} resize-y`}
              value={form.note}
              onChange={(e) => updateField("note", e.target.value)}
            />
          )}
        </FormField>

        {mode === "create" && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <label htmlFor={confirmId} className="flex items-start gap-2 text-sm font-medium text-slate-800">
              <input
                id={confirmId}
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-accent focus:ring-accent"
                checked={offlineConfirmed}
                onChange={(e) => setOfflineConfirmed(e.target.checked)}
              />
              <span>
                신청자에게 운영기간 중 코칭 3회 참여 가능 여부와 개인정보 수집·이용 동의를
                오프라인으로 확인했습니다. (필수)
              </span>
            </label>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onClose} disabled={saving}>
          취소
        </Button>
        <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>
          {saving ? "저장 중..." : mode === "create" ? "등록" : "저장"}
        </Button>
      </div>
    </Modal>
  );
}
