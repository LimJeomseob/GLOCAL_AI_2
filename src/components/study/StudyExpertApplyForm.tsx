"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatDateTime, formatPhoneInput } from "@/lib/format";
import { studyExpertApplySchema } from "@/lib/studyValidation";
import { deriveStudyExpertWindow, submitStudy } from "@/lib/studyApi";
import {
  STUDY_CATEGORY_FALLBACK,
  STUDY_EXPERT_ACTIVITIES,
  STUDY_EXPERT_AVAILABILITY_LABEL,
  STUDY_EXPERT_CONSENT_ITEMS,
  STUDY_EXPERT_INTRO,
  STUDY_EXPERT_OVERVIEW,
  STUDY_EXPERT_SIGNATURE,
  STUDY_EXPERT_TITLE,
  STUDY_SIGNATURE_ADDRESSEE,
} from "@/lib/studyGroupConstants";
import type { StudyCategory, StudyRound } from "@/lib/studyTypes";

interface FormState {
  name: string;
  affiliation: string;
  position: string;
  idNumber: string;
  phone: string;
  email: string;
  categories: StudyCategory[];
  aiTools: string;
  availabilityConfirmed: boolean;
  consent: boolean;
}

const INITIAL_STATE: FormState = {
  name: "",
  affiliation: "",
  position: "",
  idNumber: "",
  phone: "",
  email: "",
  categories: [],
  aiTools: "",
  availabilityConfirmed: false,
  consent: false,
};

type FieldErrors = Partial<Record<keyof FormState | "roundId", string>>;

/**
 * 교내 AI활용 전문가 신청서 — 탭 7.
 *
 * 공문에 별도 서식이 없어 공문 기재사항(성명·소속·직급·직번·연락처·이메일)을
 * 입력 항목으로 삼고, 연구모임별 맞춤 배정을 위해
 * 지도 가능 카테고리와 주요 활용 AI 도구를 더 받는다.
 * 같은 직번·연락처로 다시 제출하면 기존 신청이 갱신된다(중복 접수 방지).
 */
export function StudyExpertApplyForm({ round }: { round: StudyRound }) {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ code: string; updated: boolean } | null>(null);
  const confirmTitleId = useId();

  const window_ = deriveStudyExpertWindow(round);
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

  function validate(): boolean {
    setSubmitError(null);

    const parsed = studyExpertApplySchema.safeParse({ ...form, roundId: round.id });
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return false;
    }
    setErrors({});
    return true;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (validate()) setConfirmOpen(true);
  }

  async function handleConfirm() {
    setSubmitting(true);
    setSubmitError(null);

    const parsed = studyExpertApplySchema.safeParse({ ...form, roundId: round.id });
    if (!parsed.success) {
      setSubmitting(false);
      setConfirmOpen(false);
      return;
    }

    const { data, error } = await submitStudy<{ applicationId: string; code: string; updated: boolean }>({
      kind: "expert-apply",
      roundId: round.id,
      name: parsed.data.name,
      affiliation: parsed.data.affiliation,
      position: parsed.data.position,
      idNumber: parsed.data.idNumber,
      // phoneSchema가 010-####-####로 정규화한 값을 보낸다(재제출 본인확인 기준과 동일)
      phone: parsed.data.phone,
      email: parsed.data.email,
      // 화면 순서가 아니라 카테고리 정의 순서로 보낸다(관리자 화면·엑셀에서 정렬이 일정하도록)
      categories: categories.map((c) => c.key).filter((k) => parsed.data.categories.includes(k)),
      aiTools: parsed.data.aiTools,
      availabilityConfirmed: true,
      consent: true,
    });

    setSubmitting(false);
    setConfirmOpen(false);

    if (error || !data) {
      setSubmitError(error ?? "저장 중 오류가 발생했습니다.");
      return;
    }

    setResult({ code: data.code, updated: Boolean(data.updated) });
  }

  if (result) {
    return (
      <div role="status" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-10">
        <h1 className="text-xl font-bold text-brand sm:text-2xl">
          {result.updated ? "전문가 신청이 갱신되었습니다" : "전문가 신청이 접수되었습니다"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
          접수번호는 <strong className="font-mono text-brand">{result.code}</strong> 입니다.
        </p>
        <ul className="mt-4 space-y-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
          <li>· 선정 결과는 입력하신 이메일로 안내드립니다.</li>
          <li>· 신청 내용을 고치려면 신청기간 내에 같은 직번·연락처로 다시 제출해 주세요. 기존 신청이 갱신됩니다.</li>
          <li>· 그 밖의 문의는 AI융합원으로 연락해 주세요.</li>
        </ul>
        <div className="mt-6">
          <Link href="/">
            <Button variant="outline" size="lg" className="w-full sm:w-auto">
              사업안내로 이동
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-brand sm:text-2xl">{STUDY_EXPERT_TITLE}</h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">{STUDY_EXPERT_INTRO}</p>
      </div>

      {!window_.isAvailable && (
        <div role="status" className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
          현재 모집 중인 전문가 공고가 없습니다.
        </div>
      )}
      {window_.isNotYetOpen && round.expert_apply_open_at && (
        <div role="status" className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800">
          아직 신청 기간이 아닙니다. {formatDateTime(round.expert_apply_open_at)}부터 신청할 수 있습니다.
        </div>
      )}
      {window_.isClosed && round.expert_apply_close_at && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          신청이 마감되었습니다. ({formatDateTime(round.expert_apply_close_at)} 마감)
        </div>
      )}

      {/* 공문 요약 — 신청자가 역할·기간·지원사항을 알고 신청하게 한다 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        <h2 className="text-sm font-bold text-slate-800">모집 개요</h2>
        <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          {STUDY_EXPERT_OVERVIEW.map((item) => (
            <div key={item.label} className="contents">
              <dt className="font-semibold text-slate-500">{item.label}</dt>
              <dd className="text-slate-700">{item.value}</dd>
            </div>
          ))}
        </dl>

        <h3 className="mt-5 text-sm font-bold text-slate-800">활동내용</h3>
        <ol className="mt-2 grid gap-2 sm:grid-cols-3" role="list">
          {STUDY_EXPERT_ACTIVITIES.map((activity, index) => (
            <li key={activity.step} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <span className="text-xs font-bold text-accent">
                {index + 1}) {activity.step}
              </span>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">{activity.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-8"
      >
        <fieldset className="rounded-xl border border-slate-200 p-4 sm:p-5">
          <legend className="px-2 text-sm font-bold text-slate-800">신청자</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="성명" required error={errors.name}>
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="text"
                  className={inputBaseClass}
                  value={form.name}
                  autoComplete="name"
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
                  placeholder="예: 부교수"
                  onChange={(e) => updateField("position", e.target.value)}
                />
              )}
            </FormField>
            <FormField
              label="연락처"
              required
              error={errors.phone}
              hint="같은 직번·연락처로 다시 제출하면 기존 신청이 갱신됩니다."
            >
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="tel"
                  className={inputBaseClass}
                  value={form.phone}
                  autoComplete="tel"
                  placeholder="010-1234-5678"
                  onChange={(e) => updateField("phone", formatPhoneInput(e.target.value))}
                />
              )}
            </FormField>
            <FormField label="이메일" required error={errors.email} hint="선정 결과를 이 주소로 안내합니다.">
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="email"
                  className={inputBaseClass}
                  value={form.email}
                  autoComplete="email"
                  placeholder="example@gnu.ac.kr"
                  onChange={(e) => updateField("email", e.target.value)}
                />
              )}
            </FormField>
          </div>
        </fieldset>

        <fieldset className="rounded-xl border border-slate-200 p-4 sm:p-5">
          <legend className="px-2 text-sm font-bold text-slate-800">전문 분야</legend>

          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-semibold text-slate-800">
              지도 가능 카테고리
              <span className="ml-1 text-red-600" aria-hidden="true">*</span>
              <span className="sr-only">(필수)</span>
            </p>
            <p className="text-xs text-slate-500">
              연구모임은 수준별 카테고리로 구성됩니다. 코칭할 수 있는 수준을 모두 선택해 주세요. 배정 시 참고합니다.
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
                      <span className="mt-0.5 block text-xs text-slate-500">{c.guide}</span>
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

          <div className="mt-5">
            <FormField
              label="주요 활용 AI 도구"
              error={errors.aiTools}
              hint="선택 항목. 연구모임의 활용 계획과 맞춰 배정하는 데 참고합니다."
            >
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="text"
                  className={inputBaseClass}
                  value={form.aiTools}
                  placeholder="예: ChatGPT(GPTs), NotebookLM, Claude, Cursor, n8n"
                  onChange={(e) => updateField("aiTools", e.target.value)}
                />
              )}
            </FormField>
          </div>
        </fieldset>

        <FormField label="활동 가능 확인" required error={errors.availabilityConfirmed}>
          {(inputProps) => (
            <label htmlFor={inputProps.id} className="flex items-start gap-2 text-sm text-slate-700">
              <input
                {...inputProps}
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-accent focus:ring-accent"
                checked={form.availabilityConfirmed}
                onChange={(e) => updateField("availabilityConfirmed", e.target.checked)}
              />
              <span>{STUDY_EXPERT_AVAILABILITY_LABEL}</span>
            </label>
          )}
        </FormField>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-sm font-bold text-slate-800">개인정보 수집·이용 동의</h2>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-slate-600">
            {STUDY_EXPERT_CONSENT_ITEMS.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>

          <FormField label="동의 여부" required error={errors.consent}>
            {(inputProps) => (
              <label htmlFor={inputProps.id} className="mt-1 flex items-start gap-2 text-sm font-medium text-slate-800">
                <input
                  {...inputProps}
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-accent focus:ring-accent"
                  checked={form.consent}
                  onChange={(e) => updateField("consent", e.target.checked)}
                />
                <span>개인정보 수집·이용에 동의합니다. (필수)</span>
              </label>
            )}
          </FormField>
        </div>

        {submitError && (
          <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {submitError}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          disabled={submitting || !window_.isOpen}
        >
          전문가 신청하기
        </Button>
      </form>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} titleId={confirmTitleId}>
        <h2 id={confirmTitleId} className="text-lg font-bold text-brand">
          전문가 신청 확인
        </h2>

        <dl className="mt-4 space-y-2 text-sm text-slate-700">
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 font-semibold text-slate-500">성명</dt>
            <dd>{form.name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 font-semibold text-slate-500">소속·직급</dt>
            <dd>
              {form.affiliation} · {form.position}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 font-semibold text-slate-500">연락처</dt>
            <dd>{form.phone}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 font-semibold text-slate-500">지도 카테고리</dt>
            <dd>{categories.filter((c) => form.categories.includes(c.key)).map((c) => c.key).join(", ")}</dd>
          </div>
        </dl>

        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-center text-sm leading-relaxed text-slate-700">
          <p>{STUDY_EXPERT_SIGNATURE}</p>
          <p className="mt-3">
            신청인 <strong>{form.name}</strong> <span className="text-slate-500">(서명 또는 인)</span>
          </p>
          <p className="mt-2 font-semibold text-slate-800">{STUDY_SIGNATURE_ADDRESSEE}</p>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>
            돌아가기
          </Button>
          <Button variant="primary" onClick={handleConfirm} disabled={submitting}>
            {submitting ? "저장 중..." : "확인하고 신청"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
