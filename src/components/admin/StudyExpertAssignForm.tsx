"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { inputBaseClass } from "@/components/ui/FormField";
import {
  assignStudyGroupExpertWithLabel,
  formatExpertLabel,
  type StudyExpertChoice,
} from "@/lib/studyAdmin";
import type { StudyExpertApplication, StudyGroupWithRelations } from "@/lib/studyTypes";

const MANUAL = "__manual__";
const NONE = "";

/** 현재 배정 상태를 select 값으로 — 교내 연결이 있으면 그 전문가, 표기만 있으면 직접 입력 */
function initialChoice(group: StudyGroupWithRelations): string {
  if (group.expert_id) return group.expert_id;
  if (group.finalSchedule?.expert_label) return MANUAL;
  return NONE;
}

/**
 * 전문가 배정 폼 — 연구모임 관리 상세 팝업과 운영현황 행 펼침이 함께 쓴다.
 * 선택지(교내 선정 전문가 · 직접 입력 · 미배정)와 저장 경로(assignStudyGroupExpertWithLabel)가
 * 같으므로 어느 화면에서 배정해도 두 화면과 대표자·전문가 화면이 같은 값을 본다.
 * 부모는 저장 후 목록을 다시 읽고, key로 이 폼을 새 값으로 다시 채운다.
 */
export function StudyExpertAssignForm({
  group,
  experts,
  disabled = false,
  onSaved,
}: {
  group: StudyGroupWithRelations;
  /** 배정 후보 — 이 회차에서 선정된 교내 전문가 */
  experts: StudyExpertApplication[];
  disabled?: boolean;
  /** 저장 성공 후 목록을 다시 읽는다. message는 상단 안내 문구. */
  onSaved: (message: string) => Promise<void>;
}) {
  const [choice, setChoice] = useState<string>(() => initialChoice(group));
  const [manualLabel, setManualLabel] = useState<string>(() =>
    group.expert_id ? "" : (group.finalSchedule?.expert_label ?? "")
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectId = useId();

  const listedExpert = experts.find((e) => e.id === choice) ?? null;
  // 선정 목록에서 빠진(상태가 바뀐) 교내 전문가가 배정돼 있으면 선택지에 남겨 현재 값을 보여 준다.
  const orphanExpert =
    group.expert && !experts.some((e) => e.id === group.expert!.id) ? group.expert : null;

  async function save() {
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

    setBusy(true);
    const message = await assignStudyGroupExpertWithLabel(group, next);
    setBusy(false);
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

  const locked = busy || disabled;

  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label htmlFor={selectId} className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
          AI 전문가 배정
          <select
            id={selectId}
            className={`${inputBaseClass} min-w-[16rem]`}
            value={choice}
            disabled={locked}
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
        <Button size="sm" onClick={() => void save()} disabled={locked}>
          {busy ? "저장 중..." : "배정 저장"}
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
    </div>
  );
}
