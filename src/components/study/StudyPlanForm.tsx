"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import { LongTextField } from "@/components/ui/LongTextField";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatDateTime } from "@/lib/format";
import { countChars } from "@/lib/studyValidation";
import { submitStudy } from "@/lib/studyApi";
import {
  STUDY_APPLY_SIGNATURE,
  STUDY_EDUCATION_MODES,
  STUDY_PLAN_MIN_CHARS,
  STUDY_PLAN_SECTIONS,
  STUDY_PLAN_WRITING_RULES,
  STUDY_PROGRESS_METHODS,
  STUDY_SIGNATURE_ADDRESSEE,
  STUDY_WORKSHOP_OPTIONS,
  STUDY_WORKSHOP_STEPS,
} from "@/lib/studyGroupConstants";
import type {
  StudyIdentity,
  StudyLookupResult,
  WorkshopPreference,
} from "@/lib/studyTypes";

type SectionKey = (typeof STUDY_PLAN_SECTIONS)[number]["key"];
type Sections = Record<SectionKey, string>;

const AUTOSAVE_INTERVAL_MS = 30_000;

function initialSections(group: StudyLookupResult): Sections {
  const plan = group.plan;
  return {
    section1Topic: plan?.section1Topic ?? "",
    section2Purpose: plan?.section2Purpose ?? "",
    section3Platform: plan?.section3Platform ?? "",
    section4Effect: plan?.section4Effect ?? "",
    section5Etc: plan?.section5Etc ?? "",
  };
}

/**
 * [서식 1] 계획서 (근거문서 8페이지) — 신청 위저드 2단계.
 *
 * 심사 100점 중 80점이 이 화면의 내용에서 결정되므로, 각 항목 옆에 배점을 명시하고
 * 9~10페이지의 작성 예시를 흐린 placeholder로 깔아 둔다(입력을 시작하면 사라지고
 * 저장값에는 섞이지 않는다).
 *
 * 5번 항목은 자유 서술로 두지 않고 워크숍 희망일을 날짜로 구조화해 받는다.
 * 구조화해 두면 10개 팀의 희망일을 관리자 화면에서 교차집계해 강사 배정안을 바로 뽑을 수 있다.
 */
export function StudyPlanForm({
  group,
  identity,
  refresh,
}: {
  group: StudyLookupResult;
  identity: StudyIdentity;
  refresh: () => Promise<void>;
}) {
  const [sections, setSections] = useState<Sections>(() => initialSections(group));
  const [workshopPref, setWorkshopPref] = useState<WorkshopPreference>(
    () => group.plan?.workshopPref ?? {}
  );
  const [progressMethod, setProgressMethod] = useState<string>(group.progressMethod ?? "");
  const [educationMode, setEducationMode] = useState<string>(group.educationMode ?? "");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(group.plan?.submittedAt ?? null);
  const dirtyRef = useRef(false);
  const confirmTitleId = useId();

  const locked = group.status !== "draft";
  const charCount = countChars(...Object.values(sections));
  const meetsLength = charCount >= STUDY_PLAN_MIN_CHARS;

  const buildPayload = useCallback(
    (submit: boolean) => ({
      kind: "plan" as const,
      groupId: group.groupId,
      ...identity,
      ...sections,
      workshopPref,
      progressMethod: progressMethod || null,
      educationMode: educationMode || null,
      submit,
    }),
    [group.groupId, identity, sections, workshopPref, progressMethod, educationMode]
  );

  const save = useCallback(
    async (submit: boolean, { silent = false } = {}) => {
      setSaving(true);
      if (!silent) setMessage(null);

      const { error } = await submitStudy(buildPayload(submit));
      setSaving(false);

      if (error) {
        setMessage({ type: "error", text: error });
        return false;
      }

      dirtyRef.current = false;
      setLastSavedAt(new Date().toISOString());
      if (!silent) {
        setMessage({
          type: "success",
          text: submit ? "계획서를 제출했습니다." : "임시저장했습니다.",
        });
      }
      if (submit) await refresh();
      return true;
    },
    [buildPayload, refresh]
  );

  // 장문 작성 중 세션 만료·실수로 인한 유실을 막는 자동 임시저장.
  // 변경이 있을 때만 호출하므로 가만히 두면 네트워크 요청이 나가지 않는다.
  useEffect(() => {
    if (locked) return;
    const timer = window.setInterval(() => {
      if (dirtyRef.current && !saving) void save(false, { silent: true });
    }, AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [locked, saving, save]);

  function updateSection(key: SectionKey, value: string) {
    dirtyRef.current = true;
    setSections((prev) => ({ ...prev, [key]: value }));
  }

  function updateWorkshopPref(optionKey: string, stepKey: string, value: string) {
    dirtyRef.current = true;
    setWorkshopPref((prev) => ({
      ...prev,
      [optionKey]: { ...(prev[optionKey] ?? {}), [stepKey]: value },
    }));
  }

  if (locked) {
    return (
      <div className="flex flex-col gap-5">
        <div
          role="status"
          className="rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-900"
        >
          계획서가 제출되어 수정할 수 없습니다.
          {group.plan?.submittedAt && ` (제출: ${formatDateTime(group.plan.submittedAt)})`}
          <p className="mt-1 font-normal">
            수정이 필요하면 AI융합원으로 문의해 주세요. 진행 상황은 &quot;내 연구모임&quot; 탭에서
            확인할 수 있습니다.
          </p>
        </div>

        <div className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-8">
          {STUDY_PLAN_SECTIONS.map((section) => (
            <div key={section.key}>
              <h3 className="text-sm font-bold text-slate-800">
                {section.no}. {section.title}
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {sections[section.key] || <span className="text-slate-400">(작성 내용 없음)</span>}
              </p>
            </div>
          ))}
        </div>

        <Link href="/lookup">
          <Button variant="outline" size="lg" className="w-full sm:w-auto">
            내 연구모임 보기
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 작성요령 — 근거문서 8페이지 상단 원문 */}
      <section className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
        <h2 className="text-sm font-bold text-slate-800">작성요령</h2>
        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
          {STUDY_PLAN_WRITING_RULES.map((rule) => (
            <li key={rule}>· {rule}</li>
          ))}
        </ul>
        {/* 교육과정 3단계 — 5번 항목·워크숍 희망일 작성 시 각 단계가 무엇인지 같은 화면에서 보게 한다 */}
        <h3 className="mt-4 text-sm font-bold text-slate-800">
          교육과정 3단계 — 기획 → 제작 → 환류 (5번 항목 · 워크숍 희망일 작성 참고)
        </h3>
        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
          {STUDY_WORKSHOP_STEPS.map((step) => (
            <li key={step.key}>
              · <strong className="text-slate-700">{step.name}({step.hours}H)</strong>: {step.detail}
            </li>
          ))}
        </ul>
        <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-500">
          서체·줄간격은 제출본 PDF를 만들 때 서식(굴림 12pt · 줄간격 160%)으로 자동 적용되므로
          화면에서는 신경 쓰지 않으셔도 됩니다. &quot;1페이지 이상&quot; 기준만
          <strong className="text-slate-700"> 공백 제외 {STUDY_PLAN_MIN_CHARS.toLocaleString()}자</strong>로
          환산해 확인합니다.
        </p>
      </section>

      {/* 분량 진척 */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card">
        <div className="flex items-baseline gap-2 text-sm">
          <span className="font-semibold text-slate-700">전체 분량</span>
          <span className={meetsLength ? "font-bold tabular-nums text-emerald-700" : "font-bold tabular-nums text-amber-700"}>
            {charCount.toLocaleString()}자
          </span>
          <span className="text-xs text-slate-400">
            / {STUDY_PLAN_MIN_CHARS.toLocaleString()}자 이상
          </span>
        </div>
        {lastSavedAt && (
          <span className="text-xs text-slate-400">
            마지막 저장 {formatDateTime(lastSavedAt)}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-8">
        {STUDY_PLAN_SECTIONS.map((section) => (
          <LongTextField
            key={section.key}
            label={`${section.no}. ${section.title}`}
            required
            hint={section.hint}
            scoreNote={section.scoreNote}
            example={section.example}
            rows={section.key === "section5Etc" ? 5 : 9}
            value={sections[section.key]}
            onChange={(value) => updateSection(section.key, value)}
          />
        ))}

        {/* 5번의 구조화 부분 — 자유 서술과 별개로 날짜를 받아 강사 배정에 그대로 쓴다 */}
        <fieldset className="rounded-xl border border-slate-200 p-4 sm:p-5">
          <legend className="px-2 text-sm font-bold text-slate-800">단계별 워크숍 희망일</legend>
          <p className="mb-4 text-xs leading-relaxed text-slate-500">
            1안과 2안을 모두 적어 주세요. 팀별 희망일을 모아 강사 일정을 배정합니다.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
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
                    <th scope="row" className="py-3 pr-3 text-left align-middle font-medium text-slate-700">
                      {step.order}차 {step.name}
                      <span className="ml-1 text-xs font-normal text-slate-400">({step.hours}시간)</span>
                    </th>
                    {STUDY_WORKSHOP_OPTIONS.map((option) => (
                      <td key={option.key} className="py-2 pr-3">
                        <input
                          type="date"
                          aria-label={`${option.label} ${step.order}차 ${step.name} 희망일`}
                          className={inputBaseClass}
                          value={workshopPref[option.key]?.[step.key] ?? ""}
                          onChange={(e) => updateWorkshopPref(option.key, step.key, e.target.value)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="진행방법 (택1)" hint="연구과제를 어떤 방식으로 해결할지 선택해 주세요.">
            {(inputProps) => (
              <select
                {...inputProps}
                className={inputBaseClass}
                value={progressMethod}
                onChange={(e) => {
                  dirtyRef.current = true;
                  setProgressMethod(e.target.value);
                }}
              >
                <option value="">선택해 주세요</option>
                {STUDY_PROGRESS_METHODS.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <FormField label="교육형태" hint="블렌디드 러닝 — 대면/비대면 중 선택">
            {(inputProps) => (
              <select
                {...inputProps}
                className={inputBaseClass}
                value={educationMode}
                onChange={(e) => {
                  dirtyRef.current = true;
                  setEducationMode(e.target.value);
                }}
              >
                <option value="">선택해 주세요</option>
                {STUDY_EDUCATION_MODES.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        </div>

        {message && (
          <p
            role={message.type === "error" ? "alert" : "status"}
            className={
              message.type === "error"
                ? "rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
                : "rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
            }
          >
            {message.text}
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => void save(false)}
            disabled={saving}
          >
            {saving ? "저장 중..." : "임시저장"}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="lg"
            className="w-full sm:flex-1"
            onClick={() => setConfirmOpen(true)}
            disabled={saving || !meetsLength}
          >
            계획서 제출하기
          </Button>
        </div>

        {!meetsLength && (
          <p className="text-center text-xs text-slate-500">
            제출하려면 {(STUDY_PLAN_MIN_CHARS - charCount).toLocaleString()}자를 더 작성해 주세요.
          </p>
        )}
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} titleId={confirmTitleId}>
        <h2 id={confirmTitleId} className="text-lg font-bold text-brand">
          계획서 제출 확인
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          제출하면 접수가 완료되며, <strong>이후에는 대표자도 수정할 수 없습니다.</strong> 내용을 한 번
          더 확인해 주세요.
        </p>

        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-center text-sm leading-relaxed text-slate-700">
          <p>{STUDY_APPLY_SIGNATURE}</p>
          <p className="mt-3">
            대표자 <strong>{group.leaderName}</strong>{" "}
            <span className="text-slate-500">(서명 또는 인)</span>
          </p>
          <p className="mt-2 font-semibold text-slate-800">{STUDY_SIGNATURE_ADDRESSEE}</p>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={saving}>
            더 작성하기
          </Button>
          <Button
            variant="primary"
            onClick={async () => {
              const ok = await save(true);
              if (ok) setConfirmOpen(false);
            }}
            disabled={saving}
          >
            {saving ? "제출 중..." : "제출하기"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
