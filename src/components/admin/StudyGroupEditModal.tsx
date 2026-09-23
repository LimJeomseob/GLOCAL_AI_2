"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import { WorkshopPrefTable } from "@/components/study/WorkshopPrefTable";
import { formatPhoneInput } from "@/lib/format";
import {
  countChars,
  isMultiDepartment,
  studyGroupAdminSchema,
  studyPlanAdminSchema,
  studyEthicsPledgeSchema,
  validateMembers,
} from "@/lib/studyValidation";
import type { StudyMemberInput } from "@/lib/studyValidation";
import {
  replaceStudyGroupMembers,
  updateStudyGroupDetails,
  upsertStudyGroupPlan,
} from "@/lib/studyAdmin";
import {
  STUDY_EDUCATION_MODES,
  STUDY_ETHICS_PRINCIPLES,
  STUDY_PLAN_SECTIONS,
  STUDY_PROGRESS_METHODS,
} from "@/lib/studyGroupConstants";
import type {
  StudyEducationMode,
  StudyEthicsPledgeRecord,
  StudyGroupWithRelations,
  StudyProgressMethod,
  StudyRound,
  WorkshopPreference,
} from "@/lib/studyTypes";

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
  progressMethod: string;
  educationMode: string;
}

type SectionKey = (typeof STUDY_PLAN_SECTIONS)[number]["key"];
type Sections = Record<SectionKey, string>;

type FieldErrors = Partial<Record<keyof FormState, string>>;

const EMPTY_MEMBER: StudyMemberInput = {
  idNumber: "",
  name: "",
  affiliation: "",
  position: "",
  isLeader: false,
};

function initialForm(group: StudyGroupWithRelations): FormState {
  return {
    name: group.name,
    topic: group.topic,
    category: group.category,
    leaderName: group.leader_name,
    leaderAffiliation: group.leader_affiliation,
    leaderPosition: group.leader_position,
    leaderIdNumber: group.leader_id_number,
    leaderPhone: group.leader_phone,
    leaderEmail: group.leader_email,
    hasNontenured: group.has_nontenured,
    progressMethod: group.progress_method ?? "",
    educationMode: group.education_mode ?? "",
  };
}

/** 대표자 행은 폼 상단에서 따로 다루므로 참여자 목록에서 걷어낸다(공개 신청 폼과 같은 규칙). */
function initialMembers(group: StudyGroupWithRelations): StudyMemberInput[] {
  return [...group.members]
    .sort((a, b) => a.sort_order - b.sort_order)
    .filter((m) => !m.is_leader && m.id_number !== group.leader_id_number)
    .map((m) => ({
      idNumber: m.id_number,
      name: m.name,
      affiliation: m.affiliation,
      position: m.position,
      isLeader: false,
    }));
}

function initialSections(group: StudyGroupWithRelations): Sections {
  const plan = group.plan;
  return {
    section1Topic: plan?.section1_topic ?? "",
    section2Purpose: plan?.section2_purpose ?? "",
    section3Platform: plan?.section3_platform ?? "",
    section4Effect: plan?.section4_effect ?? "",
    section5Etc: plan?.section5_etc ?? "",
  };
}

interface StudyGroupEditModalProps {
  group: StudyGroupWithRelations;
  round: StudyRound;
  onClose: () => void;
  /** 저장 성공 후 호출 — 목록을 다시 불러와 트리거가 재계산한 인원·복수학과를 반영한다. */
  onSaved: () => void | Promise<void>;
}

/**
 * 관리자 전용 연구모임 편집 화면.
 *
 * 공개 경로(study-submit `apply-edit`)는 심사 착수 전·신청 마감 전에만 열리므로, 담당자가 접수 후
 * 발견한 오탈자·참여자 교체·계획서 누락을 고칠 방법이 Supabase 대시보드밖에 없었다. 관리자는 RLS와
 * 트리거 예외로 이미 쓰기 권한이 있으므로 Edge Function을 늘리지 않고 테이블을 직접 갱신한다.
 *
 * 항목·검증 규칙은 공개 신청 폼(StudyApplyForm)·계획서(StudyPlanForm)·윤리 게이트(StudyEthicsGate)와
 * 같은 스키마를 쓰되, 담당자가 깨진 데이터를 복구할 수 있도록 인원 상·하한만 경고로 낮춘다.
 */
export function StudyGroupEditModal({ group, round, onClose, onSaved }: StudyGroupEditModalProps) {
  const [form, setForm] = useState<FormState>(() => initialForm(group));
  const [members, setMembers] = useState<StudyMemberInput[]>(() => initialMembers(group));
  const [pledges, setPledges] = useState<Map<number, string>>(
    () => new Map((group.ethics_pledges ?? []).map((p) => [p.no, p.pledge]))
  );
  const [sections, setSections] = useState<Sections>(() => initialSections(group));
  const [workshopPref, setWorkshopPref] = useState<WorkshopPreference>(
    () => group.plan?.workshop_pref ?? {}
  );

  const [errors, setErrors] = useState<FieldErrors>({});
  const [memberError, setMemberError] = useState<string | null>(null);
  const [pledgeErrors, setPledgeErrors] = useState<Record<number, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const titleId = useId();
  const categories = round.categories ?? [];

  /** 대표자를 0번 행으로 포함한 최종 명단 — 검증·저장이 모두 이 값을 쓴다. */
  const leaderRow: StudyMemberInput = {
    idNumber: form.leaderIdNumber,
    name: form.leaderName,
    affiliation: form.leaderAffiliation,
    position: form.leaderPosition,
    isLeader: true,
  };
  const allMembers = [leaderRow, ...members];
  const multiDept = isMultiDepartment(allMembers);
  const charCount = countChars(...Object.values(sections));
  const outOfRange =
    allMembers.length < round.min_team_size || allMembers.length > round.max_team_size;

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateMember(index: number, key: keyof StudyMemberInput, value: string) {
    setMembers((prev) => prev.map((m, i) => (i === index ? { ...m, [key]: value } : m)));
  }

  function togglePrinciple(no: number, checked: boolean) {
    setPledges((prev) => {
      const next = new Map(prev);
      if (checked) next.set(no, next.get(no) ?? "");
      else next.delete(no);
      return next;
    });
  }

  /**
   * 저장 전 검증. 인원 상·하한만 경고로 처리하고 나머지(빈 칸·직번 중복)는 막는다 —
   * validateMembers는 인원 검사를 먼저 반환하므로 상·하한을 풀어서 호출한다.
   */
  function validate(): { pledges: StudyEthicsPledgeRecord[] } | null {
    setSaveError(null);

    const parsed = studyGroupAdminSchema.safeParse({
      ...form,
      progressMethod: form.progressMethod || null,
      educationMode: form.educationMode || null,
    });

    const nextErrors: FieldErrors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormState;
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
    }
    setErrors(nextErrors);

    const memberMessage = validateMembers(allMembers, 1, Number.MAX_SAFE_INTEGER);
    setMemberError(memberMessage);

    const nextPledgeErrors: Record<number, string> = {};
    const pledgeRecords: StudyEthicsPledgeRecord[] = [];
    for (const principle of STUDY_ETHICS_PRINCIPLES) {
      if (!pledges.has(principle.no)) continue;
      const result = studyEthicsPledgeSchema.safeParse({
        no: principle.no,
        title: principle.title,
        pledge: pledges.get(principle.no) ?? "",
      });
      if (!result.success) nextPledgeErrors[principle.no] = result.error.issues[0].message;
      else pledgeRecords.push(result.data);
    }
    setPledgeErrors(nextPledgeErrors);

    const planParsed = studyPlanAdminSchema.safeParse({ ...sections, workshopPref });
    if (!planParsed.success) {
      setSaveError(planParsed.error.issues[0].message);
      return null;
    }

    if (
      !parsed.success ||
      memberMessage !== null ||
      Object.keys(nextPledgeErrors).length > 0
    ) {
      return null;
    }

    return { pledges: pledgeRecords };
  }

  async function handleSave() {
    const validated = validate();
    if (!validated) return;

    // 관리자는 DB 트리거의 팀 규모 검사에서 제외되므로 화면이 마지막 확인을 받는다.
    if (
      outOfRange &&
      !window.confirm(
        `참여자가 ${allMembers.length}명으로 회차 기준(${round.min_team_size}~${round.max_team_size}명)을 벗어납니다.\n` +
          "관리자 권한으로 그대로 저장할까요?"
      )
    ) {
      return;
    }

    setSaving(true);
    setSaveError(null);

    const detailsMessage = await updateStudyGroupDetails(group.id, {
      name: form.name.trim(),
      topic: form.topic.trim(),
      category: form.category,
      leader_name: form.leaderName.trim(),
      leader_affiliation: form.leaderAffiliation.trim(),
      leader_position: form.leaderPosition.trim(),
      leader_id_number: form.leaderIdNumber.trim(),
      leader_phone: form.leaderPhone.trim(),
      leader_email: form.leaderEmail.trim(),
      has_nontenured: form.hasNontenured,
      progress_method: (form.progressMethod || null) as StudyProgressMethod | null,
      education_mode: (form.educationMode || null) as StudyEducationMode | null,
      ethics_pledges: validated.pledges,
    });
    if (detailsMessage) {
      setSaving(false);
      setSaveError(`신청서 저장 실패: ${detailsMessage}`);
      return;
    }

    const memberMessage = await replaceStudyGroupMembers(
      group.id,
      group.members,
      allMembers
    );
    if (memberMessage) {
      setSaving(false);
      setSaveError(`참여자 저장 실패: ${memberMessage}`);
      return;
    }

    const planMessage = await upsertStudyGroupPlan(group.id, { ...sections, workshopPref });
    if (planMessage) {
      setSaving(false);
      setSaveError(`계획서 저장 실패: ${planMessage}`);
      return;
    }

    setSaving(false);
    await onSaved();
  }

  return (
    <Modal open onClose={onClose} titleId={titleId} size="lg">
      <h2 id={titleId} className="text-lg font-bold text-brand">
        {group.code} · 신청 내용 수정
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        접수번호·상태·복수학과 판정은 목록과 상세 화면의 선택 항목에서 바꿉니다. 인원과 복수학과
        여부는 참여자 명단을 저장하면 자동으로 다시 계산됩니다.
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
        {/* 1. 기본 정보 */}
        <fieldset className="rounded-xl border border-slate-200 p-4">
          <legend className="px-2 text-sm font-bold text-slate-800">기본 정보</legend>
          <div className="flex flex-col gap-4">
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
                  onChange={(e) => updateField("topic", e.target.value)}
                />
              )}
            </FormField>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="수준별 카테고리" required error={errors.category}>
                {(inputProps) => (
                  <select
                    {...inputProps}
                    className={inputBaseClass}
                    value={form.category}
                    onChange={(e) => updateField("category", e.target.value)}
                  >
                    <option value="">선택</option>
                    {categories.map((c) => (
                      <option key={c.key} value={c.key}>
                        [{c.key}] {c.label}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
              <FormField label="진행방법">
                {(inputProps) => (
                  <select
                    {...inputProps}
                    className={inputBaseClass}
                    value={form.progressMethod}
                    onChange={(e) => updateField("progressMethod", e.target.value)}
                  >
                    <option value="">미선택</option>
                    {STUDY_PROGRESS_METHODS.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.key}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
              <FormField label="교육형태">
                {(inputProps) => (
                  <select
                    {...inputProps}
                    className={inputBaseClass}
                    value={form.educationMode}
                    onChange={(e) => updateField("educationMode", e.target.value)}
                  >
                    <option value="">미선택</option>
                    {STUDY_EDUCATION_MODES.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.key}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
            </div>
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
                  <span>비전임 교원이 포함된 모임입니다.</span>
                </label>
              )}
            </FormField>
          </div>
        </fieldset>

        {/* 2. 대표자 */}
        <fieldset className="rounded-xl border border-slate-200 p-4">
          <legend className="px-2 text-sm font-bold text-slate-800">대표자</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="성명" required error={errors.leaderName}>
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="text"
                  className={inputBaseClass}
                  value={form.leaderName}
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
            <FormField label="소속" required error={errors.leaderAffiliation}>
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="text"
                  className={inputBaseClass}
                  value={form.leaderAffiliation}
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
                  onChange={(e) => updateField("leaderPosition", e.target.value)}
                />
              )}
            </FormField>
            <FormField
              label="연락처"
              required
              error={errors.leaderPhone}
              hint="대표자 본인확인(내 연구모임 조회)의 기준값입니다."
            >
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="tel"
                  className={inputBaseClass}
                  value={form.leaderPhone}
                  placeholder="010-1234-5678"
                  onChange={(e) => updateField("leaderPhone", formatPhoneInput(e.target.value))}
                />
              )}
            </FormField>
            <FormField label="이메일" required error={errors.leaderEmail}>
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="email"
                  className={inputBaseClass}
                  value={form.leaderEmail}
                  onChange={(e) => updateField("leaderEmail", e.target.value)}
                />
              )}
            </FormField>
          </div>
        </fieldset>

        {/* 3. 참여자 */}
        <fieldset className="rounded-xl border border-slate-200 p-4">
          <legend className="px-2 text-sm font-bold text-slate-800">
            참여자 ({allMembers.length}명 / 기준 {round.min_team_size}~{round.max_team_size}명)
          </legend>
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            대표자는 첫 행에 자동으로 포함됩니다. 저장 시 자동 판정:{" "}
            <strong className={multiDept ? "text-amber-700" : "text-slate-700"}>
              {multiDept ? "복수 학과" : "단일 학과"}
            </strong>
            {typeof group.multi_dept_override === "boolean" &&
              " (현재 관리자 수동 보정값이 우선 적용됩니다)"}
          </p>

          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-brand/30 bg-brand/5 px-4 py-3 text-sm">
              <span className="mr-2 rounded bg-brand px-2 py-0.5 text-xs font-bold text-white">
                대표자
              </span>
              <span className="text-slate-700">
                {[form.leaderIdNumber, form.leaderName, form.leaderAffiliation, form.leaderPosition]
                  .filter(Boolean)
                  .join(" · ") || "위 대표자 정보를 입력하면 자동으로 채워집니다."}
              </span>
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
                    onClick={() => setMembers((prev) => prev.filter((_, i) => i !== index))}
                    aria-label={`참여자 ${index + 2}행 삭제`}
                  >
                    삭제
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMembers((prev) => [...prev, { ...EMPTY_MEMBER }])}
            >
              참여자 추가
            </Button>
          </div>

          {memberError && (
            <p role="alert" className="mt-3 text-sm font-medium text-red-600">
              {memberError}
            </p>
          )}
          {!memberError && outOfRange && (
            <p role="status" className="mt-3 text-sm font-medium text-amber-700">
              회차 기준 인원({round.min_team_size}~{round.max_team_size}명)을 벗어납니다. 저장 시 한 번 더
              확인합니다.
            </p>
          )}
        </fieldset>

        {/* 4. AI 윤리교육 실천 다짐 */}
        <fieldset className="rounded-xl border border-slate-200 p-4">
          <legend className="px-2 text-sm font-bold text-slate-800">
            AI 윤리교육 실천 다짐 ({pledges.size}개 선택)
          </legend>
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            신청자는 3개 이상을 작성해야 하지만, 관리자 정정에는 개수를 강제하지 않습니다.
            (원칙당 10자 이상)
          </p>
          <ul className="flex flex-col gap-2">
            {STUDY_ETHICS_PRINCIPLES.map((principle) => {
              const selected = pledges.has(principle.no);
              const checkboxId = `admin-ethics-${group.id}-${principle.no}`;
              const pledgeId = `admin-ethics-pledge-${group.id}-${principle.no}`;
              const pledgeError = pledgeErrors[principle.no];
              return (
                <li
                  key={principle.no}
                  className={`rounded-lg border p-3 ${
                    selected ? "border-brand/40 bg-brand/5" : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <label htmlFor={checkboxId} className="flex items-start gap-2">
                    <input
                      id={checkboxId}
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-accent focus:ring-accent"
                      checked={selected}
                      onChange={(e) => togglePrinciple(principle.no, e.target.checked)}
                    />
                    <span className="text-sm font-semibold text-slate-800">
                      {principle.no}. {principle.title}
                    </span>
                  </label>
                  {selected && (
                    <div className="mt-2 pl-6">
                      <label htmlFor={pledgeId} className="sr-only">
                        {principle.title} 실천 다짐
                      </label>
                      <textarea
                        id={pledgeId}
                        rows={2}
                        className={`${inputBaseClass} resize-y`}
                        value={pledges.get(principle.no) ?? ""}
                        aria-invalid={Boolean(pledgeError)}
                        onChange={(e) =>
                          setPledges((prev) => new Map(prev).set(principle.no, e.target.value))
                        }
                      />
                      {pledgeError && (
                        <p role="alert" className="mt-1 text-xs font-medium text-red-600">
                          {pledgeError}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>

        {/* 5. 연구계획서 */}
        <fieldset className="rounded-xl border border-slate-200 p-4">
          <legend className="px-2 text-sm font-bold text-slate-800">
            연구계획서 (공백 제외 {charCount.toLocaleString()}자)
          </legend>
          {!group.plan && (
            <p className="mb-3 text-xs font-medium text-amber-700">
              저장된 계획서가 없습니다. 내용을 입력해 저장하면 미제출 상태로 새로 만들어집니다.
            </p>
          )}
          <div className="flex flex-col gap-4">
            {STUDY_PLAN_SECTIONS.map((section) => {
              const fieldId = `admin-plan-${group.id}-${section.key}`;
              return (
                <div key={section.key} className="flex flex-col gap-1.5">
                  <label htmlFor={fieldId} className="text-sm font-semibold text-slate-800">
                    {section.no}. {section.title}
                  </label>
                  <textarea
                    id={fieldId}
                    rows={section.key === "section5Etc" ? 4 : 6}
                    className={`${inputBaseClass} resize-y leading-relaxed`}
                    value={sections[section.key]}
                    onChange={(e) =>
                      setSections((prev) => ({ ...prev, [section.key]: e.target.value }))
                    }
                  />
                </div>
              );
            })}

            <div>
              <p className="text-sm font-semibold text-slate-800">단계별 워크숍 희망일·시작 시간</p>
              <div className="mt-2">
                <WorkshopPrefTable
                  value={workshopPref}
                  onChange={setWorkshopPref}
                  idPrefix={`admin-workshop-${group.id}`}
                />
              </div>
            </div>
          </div>
        </fieldset>
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onClose} disabled={saving}>
          취소
        </Button>
        <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>
          {saving ? "저장 중..." : "저장"}
        </Button>
      </div>
    </Modal>
  );
}
