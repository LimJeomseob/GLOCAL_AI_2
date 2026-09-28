"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { inputBaseClass } from "@/components/ui/FormField";
import {
  STUDY_INDIVIDUAL_LEARNING_LABEL,
  assignStudyGroupExpertWithLabel,
  formatExpertLabel,
  studyGroupExpertDisplay,
  type StudyExpertChoice,
} from "@/lib/studyAdmin";
import { STUDY_EXPERT_STATUS_LABELS, type StudyExpertApplication, type StudyGroupWithRelations } from "@/lib/studyTypes";

const INDIVIDUAL = "__individual__";
const NONE = "";

/** 현재 배정 상태를 select 값으로 — 연결된 전문가, 개별 학습, 그 밖(미배정·예전 자유 텍스트)은 미배정 */
function initialChoice(group: StudyGroupWithRelations): string {
  if (group.expert_id) return group.expert_id;
  if (studyGroupExpertDisplay(group).individual) return INDIVIDUAL;
  return NONE;
}

/**
 * 전문가 배정 폼(운영현황 행 펼침).
 * 관리자가 「전문가 신청자」에 등록된 전문가를 드롭다운에서 직접 고르는 수동 배정만 둔다 —
 * 자유 텍스트로 적으면 전문가 연결(expert_id)이 없어 그 전문가가 「배정 팀 확인」을 쓸 수 없기 때문이다.
 * 부모는 저장 후 목록을 다시 읽고, key로 이 폼을 새 값으로 다시 채운다.
 */
export function StudyExpertAssignForm({
  group,
  experts,
  disabled = false,
  onSaved,
}: {
  group: StudyGroupWithRelations;
  /** 배정 후보 — 이 회차 등록 전문가(미선정·취소 제외, isStudyExpertCandidate) */
  experts: StudyExpertApplication[];
  disabled?: boolean;
  /** 저장 성공 후 목록을 다시 읽는다. message는 상단 안내 문구. */
  onSaved: (message: string) => Promise<void>;
}) {
  const [choice, setChoice] = useState<string>(() => initialChoice(group));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectId = useId();

  const listedExpert = experts.find((e) => e.id === choice) ?? null;
  // 후보에서 빠진(미선정·취소로 바뀐) 전문가가 연결돼 있으면 선택지에 남겨 현재 값을 보여 준다.
  const orphanExpert =
    group.expert && !experts.some((e) => e.id === group.expert!.id) ? group.expert : null;
  const display = studyGroupExpertDisplay(group);
  // 예전 자유 텍스트 배정(0028 시드·폐지된 '직접 입력') — 표기는 있는데 연결이 없다.
  const unlinkedLabel = !display.linked && !display.individual && display.name ? display.name : null;

  async function save() {
    setError(null);
    let next: StudyExpertChoice;
    if (choice === NONE) {
      next = { kind: "none" };
    } else if (choice === INDIVIDUAL) {
      next = { kind: "individual" };
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
        : next.kind === "individual"
          ? `${group.code}을(를) 개별 학습 팀으로 저장했습니다.`
          : `${group.code}에 ${next.expert.name} 전문가를 배정했습니다. 「배정 팀 확인」에서 조회할 수 있습니다.`
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

      {unlinkedLabel && (
        <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          현재 표기: <strong>{unlinkedLabel}</strong> — 등록 전문가와 연결되지 않아 이 전문가는 「배정 팀 확인」을 쓸 수
          없습니다. 목록에서 전문가를 선택해 저장하세요.
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
                {e.name} ({[e.affiliation, e.position].filter(Boolean).join(" ")})
                {e.status !== "selected" && ` · ${STUDY_EXPERT_STATUS_LABELS[e.status]} → 배정 시 선정`}
              </option>
            ))}
            {orphanExpert && (
              <option value={orphanExpert.id}>
                {orphanExpert.name} · {STUDY_EXPERT_STATUS_LABELS[orphanExpert.status]}(후보 제외됨)
              </option>
            )}
            <option value={INDIVIDUAL}>{STUDY_INDIVIDUAL_LEARNING_LABEL} (전문가 없음)</option>
          </select>
        </label>
        <Button size="sm" onClick={() => void save()} disabled={locked}>
          {busy ? "저장 중..." : "배정 저장"}
        </Button>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        {listedExpert
          ? `대표자 화면에 "${formatExpertLabel(listedExpert).replace("\n", " ")}"로 표시되고, 이 전문가의 「배정 팀 확인」에 팀이 나타납니다.` +
            (listedExpert.status !== "selected" ? " 저장하면 전문가 상태가 '선정'으로 바뀝니다." : "")
          : choice === INDIVIDUAL
            ? `대표자 화면에 "${STUDY_INDIVIDUAL_LEARNING_LABEL}"로 표시됩니다.`
            : experts.length === 0
              ? "이 회차에 등록된 전문가가 없습니다. 「전문가 신청자」 탭에서 전문가(외부 전문가 포함)를 먼저 등록하세요."
              : "「전문가 신청자」에 등록된 전문가 중에서 고르세요. 목록에 없으면 그 탭에서 먼저 등록합니다."}
      </p>
    </div>
  );
}
