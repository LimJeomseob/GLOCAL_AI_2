"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import { formatPhoneInput } from "@/lib/format";
import { submitStudy } from "@/lib/studyApi";
import { studyMemberSchema, validateMembers } from "@/lib/studyValidation";
import type { StudyMemberInput } from "@/lib/studyValidation";
import type { StudyIdentity, StudyLookupResult } from "@/lib/studyTypes";

const EMPTY_MEMBER: StudyMemberInput = {
  idNumber: "",
  name: "",
  affiliation: "",
  position: "",
  phone: "",
  email: "",
  isLeader: false,
};

/** 대표자 행은 서버가 대표자 항목으로 다시 만들므로 편집 목록에서 뺀다. */
function initialMembers(group: StudyLookupResult): StudyMemberInput[] {
  return [...group.members]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((m) => !m.isLeader && m.idNumber !== group.leaderIdNumber)
    .map((m) => ({
      idNumber: m.idNumber,
      name: m.name,
      affiliation: m.affiliation,
      position: m.position,
      phone: m.phone ?? "",
      email: m.email ?? "",
      isLeader: false,
    }));
}

/**
 * 참여자 명단 수정 — 선발 이후(selected·in_progress) '내 연구모임'에서 대표자가 팀원을 고친다.
 *
 * 신청서 전체 수정은 심사 착수 전에 닫히지만, 운영 중에도 팀원 교체나 연락처·이메일 보완
 * (0025 이전 접수분은 빈 값)이 필요하다. 대표자 행은 신청서의 대표자 항목을 그대로 쓰고,
 * 저장하면 대표자 연락처·이메일도 명단에 함께 채워진다.
 */
export function StudyMembersEditForm({
  group,
  identity,
  onSaved,
  onCancel,
}: {
  group: StudyLookupResult;
  identity: StudyIdentity;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [members, setMembers] = useState<StudyMemberInput[]>(() => initialMembers(group));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const minSize = group.round?.minTeamSize ?? 1;
  const maxSize = group.round?.maxTeamSize ?? 20;

  const leaderRow: StudyMemberInput = {
    idNumber: group.leaderIdNumber,
    name: group.leaderName,
    affiliation: group.leaderAffiliation,
    position: group.leaderPosition,
    phone: identity.leaderPhone,
    email: group.leaderEmail,
    isLeader: true,
  };
  const allMembers = [leaderRow, ...members];

  function updateMember(index: number, key: keyof StudyMemberInput, value: string) {
    setMembers((prev) => prev.map((m, i) => (i === index ? { ...m, [key]: value } : m)));
  }

  function addMember() {
    if (allMembers.length >= maxSize) return;
    setMembers((prev) => [...prev, { ...EMPTY_MEMBER }]);
  }

  function removeMember(index: number) {
    setMembers((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const message = validateMembers(allMembers, minSize, maxSize);
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    setSaving(true);

    // validateMembers를 통과했으므로 parse가 던지지 않는다. 연락처는 010-####-####로 정규화된다.
    const payload = members.map((m) => {
      const row = studyMemberSchema.parse(m);
      return {
        idNumber: row.idNumber,
        name: row.name,
        affiliation: row.affiliation,
        position: row.position,
        phone: row.phone,
        email: row.email,
        isLeader: false,
      };
    });

    const { error: submitError } = await submitStudy(
      { kind: "members-edit", groupId: group.groupId, ...identity, members: payload },
      "참여자 저장 중 오류가 발생했습니다."
    );
    setSaving(false);

    if (submitError) {
      setError(submitError);
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
        <h2 className="text-base font-bold text-slate-800">
          참여자 수정 ({allMembers.length}명 / {minSize}~{maxSize}명)
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          팀원을 추가·삭제하거나 소속·직급·연락처·이메일을 고칠 수 있습니다. 대표자 정보는 신청서의
          대표자 항목을 그대로 사용합니다.
        </p>
      </div>

      <div className="rounded-lg border border-brand/30 bg-brand/5 px-4 py-3 text-sm">
        <span className="mr-2 rounded bg-brand px-2 py-0.5 text-xs font-bold text-white">대표자</span>
        <span className="text-slate-700">
          {[leaderRow.idNumber, leaderRow.name, leaderRow.affiliation, leaderRow.position, leaderRow.phone, leaderRow.email]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {members.map((member, index) => (
          <div key={index} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-3">
            <FormField label={`직(학)번 ${index + 2}`}>
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
                  placeholder="예: 경상국립대학교 OO학과"
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
            <FormField label="연락처">
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="tel"
                  className={inputBaseClass}
                  value={member.phone}
                  placeholder="010-1234-5678"
                  onChange={(e) => updateMember(index, "phone", formatPhoneInput(e.target.value))}
                />
              )}
            </FormField>
            <FormField label="이메일">
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="email"
                  className={inputBaseClass}
                  value={member.email}
                  placeholder="example@gnu.ac.kr"
                  onChange={(e) => updateMember(index, "email", e.target.value)}
                />
              )}
            </FormField>
            <div className="flex justify-end sm:col-span-3">
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

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addMember}
          disabled={allMembers.length >= maxSize}
        >
          참여자 추가
        </Button>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          취소
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "저장 중..." : "참여자 저장"}
        </Button>
      </div>
    </form>
  );
}
