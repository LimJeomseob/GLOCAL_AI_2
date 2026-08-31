import type { Metadata } from "next";
import Link from "next/link";
import { StudyRoundNotice } from "@/components/study/StudyRoundNotice";
import {
  STUDY_APPLY_NOTES,
  STUDY_BENEFIT,
  STUDY_CATEGORY_FALLBACK,
  STUDY_CRITERIA_FALLBACK,
  STUDY_EDUCATION_MODES,
  STUDY_EXPECTED_EFFECTS,
  STUDY_FLOW_STEPS,
  STUDY_GUIDELINE_FOOTNOTE,
  STUDY_GUIDELINE_INTRO,
  STUDY_GUIDELINE_ROWS,
  STUDY_HOST,
  STUDY_PROGRAM_NAME,
  STUDY_PROGRESS_METHODS,
  STUDY_PURPOSES,
  STUDY_RESEARCH_TOPIC,
  STUDY_REVIEW_NOTE,
  STUDY_SCHEDULE,
  STUDY_SUPPORTS,
  STUDY_WORKSHOP_STEPS,
} from "@/lib/studyGroupConstants";

export const metadata: Metadata = {
  title: `${STUDY_PROGRAM_NAME} | 글로컬 AI 동행 포털`,
  description:
    "경상국립대학교 글로컬대학30 사업 「2026학년도 2학기 AI 활용 연구모임」 신청·운영 안내. 신청기간 2026. 9. 7. ~ 9. 18., 10개팀 최대 50명 선발.",
};

/**
 * 탭 1. 사업안내 (근거문서 1~6페이지, 예산 항목 제외).
 *
 * 심사기준을 신청 전에 공개하는 것이 이 화면의 핵심이다 — 신청자가 배점을 알고
 * 계획서를 쓰게 하는 것이 계획서 품질을 올리는 가장 값싼 방법이기 때문.
 */
export default function StudyIntroPage() {
  const totalScore = STUDY_CRITERIA_FALLBACK.reduce((sum, c) => sum + c.max, 0);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">
          글로컬대학30 · {STUDY_HOST}
        </p>
        <h1 className="text-2xl font-bold leading-tight text-brand sm:text-3xl">
          {STUDY_PROGRAM_NAME}
        </h1>
        <p className="text-sm text-slate-600 sm:text-base">
          연구주제 · <strong className="text-slate-800">{STUDY_RESEARCH_TOPIC}</strong>
        </p>
        <StudyRoundNotice />
      </header>

      {/* 목적 */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-brand sm:text-xl">목적</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {STUDY_PURPOSES.map((purpose) => (
            <div key={purpose.target} className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
              <span className="inline-flex rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-bold text-brand">
                {purpose.target}
              </span>
              <p className="mt-3 text-sm leading-relaxed text-slate-700">{purpose.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 운영개요 5단계 */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-brand sm:text-xl">운영개요</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" role="list">
          {STUDY_FLOW_STEPS.map((step) => {
            const card = (
              <div className="flex h-full flex-col rounded-xl border border-slate-200 border-t-2 border-t-accent bg-white p-4 shadow-card transition-colors hover:border-accent">
                <span className="text-xs font-bold tabular-nums text-accent">{step.no}</span>
                <span className="mt-1.5 text-sm font-bold leading-snug text-slate-800">{step.title}</span>
                <span className="mt-1 text-xs font-medium text-brand">{step.channel}</span>
                <span className="mt-2 text-xs leading-relaxed text-slate-500">{step.detail}</span>
              </div>
            );
            return (
              <li key={step.no}>
                {step.href ? (
                  <Link href={step.href} className="block h-full">
                    {card}
                  </Link>
                ) : (
                  card
                )}
              </li>
            );
          })}
        </ol>
        <p className="text-xs text-slate-500">* {STUDY_REVIEW_NOTE}</p>
      </section>

      {/* 신청 안내 */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-brand sm:text-xl">연구모임 신청</h2>
        <ul className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm leading-relaxed text-slate-700 shadow-card">
          {STUDY_APPLY_NOTES.map((note) => (
            <li key={note}>· {note}</li>
          ))}
        </ul>
      </section>

      {/* 수준별 카테고리 */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-brand sm:text-xl">수준별 카테고리</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {STUDY_CATEGORY_FALLBACK.map((category) => (
            <div key={category.key} className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
              <span className="inline-flex rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-bold text-accent">
                {category.key}
              </span>
              <h3 className="mt-3 text-sm font-bold text-slate-800">{category.label}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{category.guide}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 심사기준 — 신청 전에 공개한다 */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-brand sm:text-xl">계획서 심사기준</h2>
        <p className="text-sm text-slate-600">
          선발 10개팀 최대 50명. 과다 신청 시 AI 전문가 3인의 서면심사로 선발합니다.
          <strong className="text-slate-800"> 배점을 미리 확인하고 계획서를 작성해 주세요.</strong>
        </p>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th scope="col" className="px-4 py-3 font-semibold">연번</th>
                <th scope="col" className="px-4 py-3 font-semibold">심사기준</th>
                <th scope="col" className="px-4 py-3 font-semibold">주요내용</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">배점(점)</th>
              </tr>
            </thead>
            <tbody>
              {STUDY_CRITERIA_FALLBACK.map((criterion, index) => {
                // 근거문서 연번이 1·2·4·5(3번 결번)이므로 원문 연번을 그대로 쓰되,
                // 같은 연번이 이어지면 첫 행에만 표기해 표를 원본과 같은 모양으로 만든다.
                const isFirstOfGroup =
                  index === 0 || STUDY_CRITERIA_FALLBACK[index - 1].no !== criterion.no;
                return (
                  <tr key={criterion.code} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-4 py-3 align-top tabular-nums text-slate-700">
                      {isFirstOfGroup ? criterion.no : ""}
                    </td>
                    <td className="px-4 py-3 align-top font-medium text-slate-800">
                      {isFirstOfGroup ? criterion.group : ""}
                    </td>
                    <td className="px-4 py-3 align-top text-slate-600">{criterion.label}</td>
                    <td className="px-4 py-3 text-right align-top font-semibold tabular-nums text-slate-800">
                      {criterion.max}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-bold text-slate-800">
                <td className="px-4 py-3" colSpan={3}>
                  총점
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{totalScore}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* 운영 안내 */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-brand sm:text-xl">연구모임 운영</h2>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
          <h3 className="text-sm font-bold text-slate-800">진행방법 (아래 중 택1)</h3>
          <ul className="mt-2 space-y-1 text-sm leading-relaxed text-slate-600">
            {STUDY_PROGRESS_METHODS.map((method) => (
              <li key={method.key}>· {method.label}</li>
            ))}
          </ul>

          <h3 className="mt-5 text-sm font-bold text-slate-800">지원사항</h3>
          <ul className="mt-2 space-y-1 text-sm leading-relaxed text-slate-600">
            {STUDY_SUPPORTS.map((support) => (
              <li key={support}>· {support}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            교육형태 ·{" "}
            {STUDY_EDUCATION_MODES.map((m) => m.label).join(" / ")} 중 연구모임이 선택
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
          <h3 className="text-sm font-bold text-slate-800">교육과정 — 기획 → 제작 → 환류</h3>
          <ol className="mt-3 grid gap-3 sm:grid-cols-3" role="list">
            {STUDY_WORKSHOP_STEPS.map((step) => (
              <li key={step.key} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <span className="text-xs font-bold text-accent">
                  {step.order}차 · {step.name} ({step.hours}시간)
                </span>
                <p className="mt-2 text-sm font-medium leading-snug text-slate-800">{step.detail}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{step.sub}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 추진일정 */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-brand sm:text-xl">추진일정</h2>
        <ol className="flex flex-col border-l-2 border-slate-200 pl-0" role="list">
          {STUDY_SCHEDULE.map((item) => (
            <li key={item.period} className="relative py-2 pl-6">
              <span
                aria-hidden="true"
                className="absolute -left-[5px] top-4 h-2 w-2 rounded-full bg-accent"
              />
              <span className="block text-xs font-semibold tabular-nums text-accent">{item.period}</span>
              <span className="block text-sm text-slate-700">{item.label}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* 이수혜택 */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-brand sm:text-xl">이수혜택</h2>
        <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-900">
          {STUDY_BENEFIT}
        </p>

        <details className="rounded-xl border border-slate-200 bg-white shadow-card">
          <summary className="cursor-pointer px-5 py-4 text-sm font-bold text-slate-800">
            [붙임] 교육·연구 및 학생지도 비용 지급 지침
          </summary>
          <div className="border-t border-slate-200 px-5 py-4">
            <p className="text-xs leading-relaxed text-slate-600">{STUDY_GUIDELINE_INTRO}</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <caption className="sr-only">자율선택지표별 지급기준 및 지급액 (연 80만 포인트 한도)</caption>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                    <th scope="col" className="px-3 py-2 font-semibold">항목</th>
                    <th scope="col" className="px-3 py-2 font-semibold">지급기준</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">지급액(원)</th>
                    <th scope="col" className="px-3 py-2 font-semibold">비고</th>
                  </tr>
                </thead>
                <tbody>
                  {STUDY_GUIDELINE_ROWS.map((row) => (
                    <tr key={row.item} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-3 py-2 align-top font-medium text-slate-800">{row.item}</td>
                      <td className="px-3 py-2 align-top text-xs text-slate-600">{row.basis}</td>
                      <td className="whitespace-pre-line px-3 py-2 text-right align-top tabular-nums text-slate-800">
                        {row.amount}
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-slate-500">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-slate-500">{STUDY_GUIDELINE_FOOTNOTE}</p>
          </div>
        </details>
      </section>

      {/* 기대효과 */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-brand sm:text-xl">기대효과</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {STUDY_EXPECTED_EFFECTS.map((effect) => (
            <div key={effect.target} className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
              <span className="inline-flex rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-bold text-brand">
                {effect.target}
              </span>
              <p className="mt-3 text-sm leading-relaxed text-slate-700">{effect.text}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center sm:flex-row sm:justify-center">
        <Link href="/study/apply">
          <span className="inline-flex w-full items-center justify-center rounded-lg bg-accent px-8 py-4 text-base font-bold text-white shadow-card transition-colors hover:bg-brand sm:w-auto sm:text-lg">
            연구모임 신청하기
          </span>
        </Link>
        <Link href="/study/lookup">
          <span className="inline-flex w-full items-center justify-center rounded-lg border-2 border-brand bg-white px-8 py-4 text-base font-bold text-brand shadow-card transition-colors hover:bg-brand/5 sm:w-auto sm:text-lg">
            내 연구모임 조회
          </span>
        </Link>
      </div>
    </div>
  );
}
