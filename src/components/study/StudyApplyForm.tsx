"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatDate, formatDateTime, formatPhoneInput } from "@/lib/format";
import { studyApplySchema, validateMembers, isMultiDepartment } from "@/lib/studyValidation";
import type { StudyEthicsPledge, StudyMemberInput } from "@/lib/studyValidation";
import { deriveStudyRoundWindow, submitStudy, writeStudyIdentity } from "@/lib/studyApi";
import {
  STUDY_APPLY_NOTES,
  STUDY_APPLY_SIGNATURE,
  STUDY_CONSENT_ITEMS,
  STUDY_SIGNATURE_ADDRESSEE,
} from "@/lib/studyGroupConstants";
import type { StudyRound } from "@/lib/studyTypes";

interface FormState {
  name: string;
  topic: string;
  category: string;
  leaderName: string;
  leaderAffiliation: string;
  leaderPosition: string;
  leaderIdNumber: string;
  leaderPhone: string;
  leaderEmail: string;
  hasNontenured: boolean;
  consent: boolean;
}

const INITIAL_STATE: FormState = {
  name: "",
  topic: "",
  category: "",
  leaderName: "",
  leaderAffiliation: "",
  leaderPosition: "",
  leaderIdNumber: "",
  leaderPhone: "",
  leaderEmail: "",
  hasNontenured: false,
  consent: false,
};

type FieldErrors = Partial<Record<keyof FormState | "roundId", string>>;

const EMPTY_MEMBER: StudyMemberInput = {
  idNumber: "",
  name: "",
  affiliation: "",
  position: "",
  isLeader: false,
};

/**
 * [서식 1] 신청서 (근거문서 7페이지) — 신청 위저드 1단계.
 *
 * 참여자 명단의 첫 행은 대표자로 고정해 자동 채운다. 서식에서 대표자와 참여자를 따로
 * 적게 되어 있어 두 곳의 이름이 어긋나는 사고가 잦은데, 시스템에서는 어긋날 수 없게 만든다.
 * 따라서 화면의 "참여자 추가"는 대표자를 뺀 나머지 인원을 다룬다.
 */
export function StudyApplyForm({
  round,
  ethicsPledges,
}: {
  round: StudyRound;
  /** 윤리교육 게이트에서 작성한 8대 핵심원칙 실천 다짐(3개 이상) — 신청서와 함께 저장 */
  ethicsPledges: StudyEthicsPledge[];
}) {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  // 최소 인원(대표자 포함 min)을 채우도록 대표자 외 (min-1)행을 미리 깔아 둔다.
  const [members, setMembers] = useState<StudyMemberInput[]>(
    Array.from({ length: Math.max(round.min_team_size - 1, 0) }, () => ({ ...EMPTY_MEMBER }))
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [memberError, setMemberError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ code: string } | null>(null);
  const confirmTitleId = useId();

  const window_ = deriveStudyRoundWindow(round);
  const categories = round.categories ?? [];

  /** 대표자를 0번 행으로 포함한 최종 명단 — 검증·표시·제출이 모두 이 값을 쓴다. */
  const leaderRow: StudyMemberInput = {
    idNumber: form.leaderIdNumber,
    name: form.leaderName,
    affiliation: form.leaderAffiliation,
    position: form.leaderPosition,
    isLeader: true,
  };
  const allMembers = [leaderRow, ...members];
  const multiDept = isMultiDepartment(allMembers);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateMember(index: number, key: keyof StudyMemberInput, value: string) {
    setMembers((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [key]: value } : m))
    );
  }

  function addMember() {
    if (allMembers.length >= round.max_team_size) return;
    setMembers((prev) => [...prev, { ...EMPTY_MEMBER }]);
  }

  function removeMember(index: number) {
    setMembers((prev) => prev.filter((_, i) => i !== index));
  }

  function validate(): boolean {
    setSubmitError(null);

    const parsed = studyApplySchema.safeParse({ ...form, roundId: round.id });
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      setMemberError(null);
      return false;
    }
    setErrors({});

    const memberMessage = validateMembers(allMembers, round.min_team_size, round.max_team_size);
    setMemberError(memberMessage);
    return memberMessage === null;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (validate()) setConfirmOpen(true);
  }

  async function handleConfirm() {
    setSubmitting(true);
    setSubmitError(null);

    const parsed = studyApplySchema.safeParse({ ...form, roundId: round.id });
    if (!parsed.success) {
      setSubmitting(false);
      setConfirmOpen(false);
      return;
    }

    const { data, error } = await submitStudy<{ groupId: string; code: string }>({
      kind: "apply",
      roundId: round.id,
      name: parsed.data.name,
      topic: parsed.data.topic,
      category: parsed.data.category,
      leaderName: parsed.data.leaderName,
      leaderAffiliation: parsed.data.leaderAffiliation,
      leaderPosition: parsed.data.leaderPosition,
      leaderIdNumber: parsed.data.leaderIdNumber,
      // phoneSchema가 010-####-####로 정규화한 값을 보낸다(본인확인 매칭 기준과 동일)
      leaderPhone: parsed.data.leaderPhone,
      leaderEmail: parsed.data.leaderEmail,
      hasNontenured: parsed.data.hasNontenured,
      members: allMembers.map((m) => ({
        idNumber: m.idNumber.trim(),
        name: m.name.trim(),
        affiliation: m.affiliation.trim(),
        position: m.position.trim(),
        isLeader: m.isLeader,
      })),
      ethicsPledges,
      consent: true,
    });

    setSubmitting(false);
    setConfirmOpen(false);

    if (error || !data) {
      setSubmitError(error ?? "저장 중 오류가 발생했습니다.");
      return;
    }

    // 탭 3에서 본인확인을 다시 입력하지 않도록 신원을 넘긴다(탭 종료 시 소멸).
    writeStudyIdentity({
      leaderName: parsed.data.leaderName,
      leaderPhone: parsed.data.leaderPhone,
    });
    setResult({ code: data.code });
  }

  if (result) {
    return (
      <div role="status" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-10">
        <h1 className="text-xl font-bold text-brand sm:text-2xl">신청서가 저장되었습니다</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
          접수번호는 <strong className="font-mono text-brand">{result.code}</strong> 입니다.
        </p>
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          아직 접수가 완료되지 않았습니다. <strong>연구계획서</strong>를 작성해 제출해야 심사 대상이
          됩니다.
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link href="/plan">
            <Button variant="primary" size="lg" className="w-full sm:w-auto">
              연구계획서 작성하기
            </Button>
          </Link>
          <Link href="/lookup">
            <Button variant="outline" size="lg" className="w-full sm:w-auto">
              내 연구모임 보기
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-brand sm:text-2xl">연구모임 신청</h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          [서식 1] 신청서 항목입니다. 저장한 뒤 이어서 연구계획서를 작성하면 접수가 완료됩니다.
        </p>
      </div>

      {window_.isNotYetOpen && (
        <div role="status" className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800">
          아직 신청 기간이 아닙니다. {formatDateTime(round.apply_open_at)}부터 신청할 수 있습니다.
        </div>
      )}
      {window_.isClosed && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          신청이 마감되었습니다. ({formatDateTime(round.apply_close_at)} 마감)
        </div>
      )}

      <ul className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-relaxed text-slate-700">
        {STUDY_APPLY_NOTES.map((note) => (
          <li key={note}>· {note}</li>
        ))}
      </ul>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-8"
      >
        <FormField label="모임명" required error={errors.name}>
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

        <FormField label="주제" required error={errors.topic}>
          {(inputProps) => (
            <input
              {...inputProps}
              type="text"
              className={inputBaseClass}
              value={form.topic}
              placeholder="예: 전공 밀착형 학습 지원 모델 설계 및 다양한 강의법 적용 연구"
              onChange={(e) => updateField("topic", e.target.value)}
            />
          )}
        </FormField>

        <FormField
          label="수준별 카테고리"
          required
          error={errors.category}
          hint="선택한 수준에 맞춰 계획서를 작성하고 맞춤형 강의가 배정됩니다."
        >
          {(inputProps) => (
            <select
              {...inputProps}
              className={inputBaseClass}
              value={form.category}
              onChange={(e) => updateField("category", e.target.value)}
            >
              <option value="">카테고리를 선택해 주세요</option>
              {categories.map((c) => (
                <option key={c.key} value={c.key}>
                  [{c.key}] {c.label}
                </option>
              ))}
            </select>
          )}
        </FormField>

        {form.category && (
          <p className="-mt-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600 sm:text-sm">
            {categories.find((c) => c.key === form.category)?.guide}
          </p>
        )}

        <fieldset className="rounded-xl border border-slate-200 p-4 sm:p-5">
          <legend className="px-2 text-sm font-bold text-slate-800">대표자</legend>
          <div className="flex flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="소속" required error={errors.leaderAffiliation}>
                {(inputProps) => (
                  <input
                    {...inputProps}
                    type="text"
                    className={inputBaseClass}
                    value={form.leaderAffiliation}
                    placeholder="예: 경상국립대학교 OO학과"
                    onChange={(e) => updateField("leaderAffiliation", e.target.value)}
                  />
                )}
              </FormField>
              <FormField label="직급" required error={errors.leaderPosition}>
                {(inputProps) => (
                  <input
                    {...inputProps}
                    type="text"
                    className={inputBaseClass}
                    value={form.leaderPosition}
                    placeholder="예: 부교수"
                    onChange={(e) => updateField("leaderPosition", e.target.value)}
                  />
                )}
              </FormField>
              <FormField label="성명" required error={errors.leaderName}>
                {(inputProps) => (
                  <input
                    {...inputProps}
                    type="text"
                    className={inputBaseClass}
                    value={form.leaderName}
                    autoComplete="name"
                    onChange={(e) => updateField("leaderName", e.target.value)}
                  />
                )}
              </FormField>
              <FormField label="직(학)번" required error={errors.leaderIdNumber}>
                {(inputProps) => (
                  <input
                    {...inputProps}
                    type="text"
                    className={inputBaseClass}
                    value={form.leaderIdNumber}
                    onChange={(e) => updateField("leaderIdNumber", e.target.value)}
                  />
                )}
              </FormField>
              <FormField
                label="연락처"
                required
                error={errors.leaderPhone}
                hint="이 연락처로 계획서·결과보고서 화면을 여는 본인확인을 합니다."
              >
                {(inputProps) => (
                  <input
                    {...inputProps}
                    type="tel"
                    className={inputBaseClass}
                    value={form.leaderPhone}
                    autoComplete="tel"
                    placeholder="010-1234-5678"
                    onChange={(e) => updateField("leaderPhone", formatPhoneInput(e.target.value))}
                  />
                )}
              </FormField>
              <FormField
                label="이메일"
                required
                error={errors.leaderEmail}
                hint="심사 결과를 이 주소로 안내합니다."
              >
                {(inputProps) => (
                  <input
                    {...inputProps}
                    type="email"
                    className={inputBaseClass}
                    value={form.leaderEmail}
                    autoComplete="email"
                    placeholder="example@gnu.ac.kr"
                    onChange={(e) => updateField("leaderEmail", e.target.value)}
                  />
                )}
              </FormField>
            </div>
          </div>
        </fieldset>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <strong className="text-slate-800">연구기간</strong> ·{" "}
          {formatDate(round.period_start)} ~ {formatDate(round.period_end)}
          <span className="ml-2 text-xs text-slate-500">(모집회차 공통 · 수정 불가)</span>
        </div>

        <fieldset className="rounded-xl border border-slate-200 p-4 sm:p-5">
          <legend className="px-2 text-sm font-bold text-slate-800">
            참여자 ({allMembers.length}명 / {round.min_team_size}~{round.max_team_size}명)
          </legend>

          <p className="mb-4 text-xs leading-relaxed text-slate-500">
            대표자는 첫 행에 자동으로 포함됩니다. 나머지 참여자를 추가해 주세요.
            {multiDept && (
              <span className="ml-1 font-semibold text-amber-700">
                복수 학과로 구성되어 가산점 대상입니다.
              </span>
            )}
          </p>

          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-brand/30 bg-brand/5 px-4 py-3 text-sm">
              <span className="mr-2 rounded bg-brand px-2 py-0.5 text-xs font-bold text-white">
                대표자
              </span>
              {form.leaderName || form.leaderAffiliation ? (
                <span className="text-slate-700">
                  {[form.leaderIdNumber, form.leaderName, form.leaderAffiliation, form.leaderPosition]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              ) : (
                <span className="text-slate-400">위 대표자 정보를 입력하면 자동으로 채워집니다.</span>
              )}
            </div>

            {members.map((member, index) => (
              <div
                key={index}
                className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
              >
                <FormField label={`직번 ${index + 2}`}>
                  {(inputProps) => (
                    <input
                      {...inputProps}
                      type="text"
                      className={inputBaseClass}
                      value={member.idNumber}
                      onChange={(e) => updateMember(index, "idNumber", e.target.value)}
                    />
                  )}
                </FormField>
                <FormField label="성명">
                  {(inputProps) => (
                    <input
                      {...inputProps}
                      type="text"
                      className={inputBaseClass}
                      value={member.name}
                      onChange={(e) => updateMember(index, "name", e.target.value)}
                    />
                  )}
                </FormField>
                <FormField label="소속">
                  {(inputProps) => (
                    <input
                      {...inputProps}
                      type="text"
                      className={inputBaseClass}
                      value={member.affiliation}
                      onChange={(e) => updateMember(index, "affiliation", e.target.value)}
                    />
                  )}
                </FormField>
                <FormField label="직급">
                  {(inputProps) => (
                    <input
                      {...inputProps}
                      type="text"
                      className={inputBaseClass}
                      value={member.position}
                      onChange={(e) => updateMember(index, "position", e.target.value)}
                    />
                  )}
                </FormField>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMember(index)}
                    aria-label={`참여자 ${index + 2}행 삭제`}
                  >
                    삭제
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addMember}
              disabled={allMembers.length >= round.max_team_size}
            >
              참여자 추가
            </Button>
          </div>

          {memberError && (
            <p role="alert" className="mt-3 text-sm font-medium text-red-600">
              {memberError}
            </p>
          )}
        </fieldset>

        <FormField label="비전임 교원 포함 여부">
          {(inputProps) => (
            <label htmlFor={inputProps.id} className="flex items-start gap-2 text-sm text-slate-700">
              <input
                {...inputProps}
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-accent focus:ring-accent"
                checked={form.hasNontenured}
                onChange={(e) => updateField("hasNontenured", e.target.checked)}
              />
              <span>비전임 교원이 포함된 모임입니다. (포함 가능)</span>
            </label>
          )}
        </FormField>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-sm font-bold text-slate-800">개인정보 수집·이용 동의</h2>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-slate-600">
            {STUDY_CONSENT_ITEMS.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>

          <FormField label="동의 여부" required error={errors.consent}>
            {(inputProps) => (
              <label
                htmlFor={inputProps.id}
                className="mt-1 flex items-start gap-2 text-sm font-medium text-slate-800"
              >
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
          저장하고 계획서 작성하기
        </Button>
      </form>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} titleId={confirmTitleId}>
        <h2 id={confirmTitleId} className="text-lg font-bold text-brand">
          신청서 제출 확인
        </h2>

        <dl className="mt-4 space-y-2 text-sm text-slate-700">
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 font-semibold text-slate-500">모임명</dt>
            <dd>{form.name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 font-semibold text-slate-500">주제</dt>
            <dd>{form.topic}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 font-semibold text-slate-500">카테고리</dt>
            <dd>[{form.category}]</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 font-semibold text-slate-500">참여인원</dt>
            <dd>
              {allMembers.length}명{multiDept && " · 복수 학과(가산점 대상)"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 font-semibold text-slate-500">윤리교육</dt>
            <dd>이수 · 핵심원칙 {ethicsPledges.length}개 실천 다짐 작성</dd>
          </div>
        </dl>

        {/* 서식 원문의 서명란을 그대로 보여주고 전자 동의로 갈음한다. */}
        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-center text-sm leading-relaxed text-slate-700">
          <p>{STUDY_APPLY_SIGNATURE}</p>
          <p className="mt-3">
            대표자 <strong>{form.leaderName}</strong>{" "}
            <span className="text-slate-500">(서명 또는 인)</span>
          </p>
          <p className="mt-2 font-semibold text-slate-800">{STUDY_SIGNATURE_ADDRESSEE}</p>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>
            돌아가기
          </Button>
          <Button variant="primary" onClick={handleConfirm} disabled={submitting}>
            {submitting ? "저장 중..." : "확인하고 저장"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
