import clsx from "clsx";
import type { StudyLookupFinalScheduleStep } from "@/lib/studyTypes";

/**
 * 팀별 최종 일정(0027)의 3단계 표 — 대표자 '내 연구모임'과 전문가 「배정 팀 확인」이 함께 쓴다.
 * 두 화면이 같은 데이터(study-lookup·study-expert-lookup의 finalSchedule)를 같은 모양으로 보여 주게 한다.
 */
export function FinalScheduleTable({ steps }: { steps: StudyLookupFinalScheduleStep[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
            <th scope="col" className="px-3 py-2 font-semibold">단계</th>
            <th scope="col" className="px-3 py-2 font-semibold">일자 및 시간</th>
            <th scope="col" className="px-3 py-2 font-semibold">세부내용</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step) => (
            <tr key={step.no} className="border-b border-slate-100 last:border-b-0">
              <td className="whitespace-nowrap px-3 py-2 align-top font-semibold text-brand">
                {step.no}차 · {step.label}
              </td>
              <td
                className={clsx(
                  "whitespace-pre-line px-3 py-2 align-top tabular-nums",
                  step.when ? "font-medium text-slate-800" : "text-amber-700"
                )}
              >
                {step.when || "미정"}
              </td>
              <td className="whitespace-pre-line px-3 py-2 align-top text-slate-600">{step.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
