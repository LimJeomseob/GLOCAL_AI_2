"use client";

import { inputBaseClass } from "@/components/ui/FormField";
import { formatDate } from "@/lib/format";
import { STUDY_WORKSHOP_OPTIONS, STUDY_WORKSHOP_STEPS } from "@/lib/studyGroupConstants";
import type { WorkshopPreference } from "@/lib/studyTypes";
import { formatWorkshopSlot, getWorkshopSlot, setWorkshopSlot } from "@/lib/workshopPref";

/**
 * 계획서 5번의 구조화 입력 — 단계(기획·제작·환류) × 안(1안·2안)의 희망일과 시작 시간.
 *
 * 대표자 화면(StudyPlanForm)·관리자 수정 모달(StudyGroupEditModal)·상세/심사 화면이 같은 표를 쓰도록
 * 한 곳에 모았다. 표기가 갈리면 담당자가 같은 데이터를 화면마다 다르게 읽게 된다.
 *
 * 시작 시간만 받고 종료는 단계별 3시간으로 계산해 보여 준다 — 종료까지 받으면 팀마다 길이가
 * 달라져 강사 배정 단위가 흔들린다.
 */
export function WorkshopPrefTable({
  value,
  onChange,
  readOnly = false,
  idPrefix = "workshop-pref",
}: {
  value: WorkshopPreference;
  onChange?: (next: WorkshopPreference) => void;
  readOnly?: boolean;
  idPrefix?: string;
}) {
  const editable = !readOnly && Boolean(onChange);

  function update(
    optionKey: string,
    stepKey: string,
    patch: { date?: string; time?: string }
  ) {
    onChange?.(setWorkshopSlot(value, optionKey, stepKey, patch));
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-2 pr-3 font-semibold">단계</th>
              {STUDY_WORKSHOP_OPTIONS.map((option) => (
                <th key={option.key} className="py-2 pr-3 font-semibold">
                  {option.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STUDY_WORKSHOP_STEPS.map((step) => (
              <tr key={step.key} className="border-b border-slate-100">
                <th
                  scope="row"
                  className="whitespace-nowrap py-3 pr-3 text-left align-middle font-medium text-slate-700"
                >
                  {step.order}차 {step.name}
                  <span className="ml-1 text-xs font-normal text-slate-400">({step.hours}시간)</span>
                </th>
                {STUDY_WORKSHOP_OPTIONS.map((option) => {
                  const slot = getWorkshopSlot(value, option.key, step.key);
                  return (
                    <td key={option.key} className="py-2 pr-3 align-middle">
                      {editable ? (
                        <div className="flex flex-col gap-1.5 sm:flex-row">
                          <input
                            id={`${idPrefix}-${option.key}-${step.key}-date`}
                            type="date"
                            aria-label={`${option.label} ${step.order}차 ${step.name} 희망일`}
                            className={inputBaseClass}
                            value={slot.date}
                            onChange={(e) =>
                              update(option.key, step.key, { date: e.target.value })
                            }
                          />
                          <input
                            id={`${idPrefix}-${option.key}-${step.key}-time`}
                            type="time"
                            step={600}
                            aria-label={`${option.label} ${step.order}차 ${step.name} 시작 시간`}
                            className={inputBaseClass}
                            value={slot.time}
                            onChange={(e) =>
                              update(option.key, step.key, { time: e.target.value })
                            }
                          />
                        </div>
                      ) : (
                        <span className="text-slate-700">
                          {formatWorkshopSlot(slot, step.hours, formatDate, "미입력")}
                          {slot.date && !slot.time && (
                            <span className="ml-1 text-xs text-amber-700">(시간 미입력)</span>
                          )}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          시작 시간만 적어 주세요. 종료 시간은 단계별 3시간 뒤로 계산됩니다(예: 14:00 → 14:00~17:00).
        </p>
      )}
    </div>
  );
}
