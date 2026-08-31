"use client";

import { useCallback, useId, useRef, useState } from "react";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import { LongTextField } from "@/components/ui/LongTextField";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatDate, formatDateTime } from "@/lib/format";
import { countChars, studyOutputSchema } from "@/lib/studyValidation";
import type { StudyOutputInput } from "@/lib/studyValidation";
import { canSubmitOperationDocs, submitStudy } from "@/lib/studyApi";
import {
  STUDY_OUTPUT_NOTICE,
  STUDY_REPORT_MIN_CHARS,
  STUDY_REPORT_SECTIONS,
  STUDY_REPORT_SIGNATURE,
  STUDY_REPORT_WRITING_RULES,
  STUDY_SIGNATURE_ADDRESSEE,
} from "@/lib/studyGroupConstants";
import { STUDY_OUTPUT_TYPES } from "@/lib/studyTypes";
import type { StudyIdentity, StudyLookupResult } from "@/lib/studyTypes";

type SectionKey = (typeof STUDY_REPORT_SECTIONS)[number]["key"];
type Sections = Record<SectionKey, string>;

const EMPTY_OUTPUT: StudyOutputInput = {
  title: "",
  outputType: "GPTs",
  url: "",
  driveUploaded: false,
  description: "",
};

function initialSections(group: StudyLookupResult): Sections {
  const r = group.report;
  return {
    section1Background: r?.section1Background ?? "",
    section2TopicPurpose: r?.section2TopicPurpose ?? "",
    section3Operation: r?.section3Operation ?? "",
    section4ResultUse: r?.section4ResultUse ?? "",
    section5EffectSuggestion: r?.section5EffectSuggestion ?? "",
  };
}

/**
 * [서식 2] 결과보고서 (근거문서 11~12페이지).
 *
 * 표지는 신청서에서 자동 승계하고(모임명·주제·대표자·참여자), 본문 5개 항목과
 * 6번 「산출물 제작 결과」만 입력받는다. 6번은 자유 텍스트가 아니라 링크 레코드로 받는데,
 * 이 목록이 사업 종료 후 자료집·동영상 제작의 원장이 되기 때문이다.
 *
 * 서식 1은 참여자 열이 "직번", 서식 2는 "교번"이다. DB 컬럼은 id_number 하나로 통일하고
 * 화면 라벨만 서식에 맞춰 "교번"으로 표기한다.
 */
export function StudyReportForm({
  group,
  identity,
  refresh,
}: {
  group: StudyLookupResult;
  identity: StudyIdentity;
  refresh: () => Promise<void>;
}) {
  const [sections, setSections] = useState<Sections>(() => initialSections(group));
  const [outputs, setOutputs] = useState<StudyOutputInput[]>(() =>
    group.outputs.length > 0
      ? group.outputs.map((o) => ({
          title: o.title,
          outputType: o.outputType,
          url: o.url,
          driveUploaded: o.driveUploaded,
          description: o.description,
        }))
      : [{ ...EMPTY_OUTPUT }]
  );
  const [periodStart, setPeriodStart] = useState(
    group.report?.actualPeriodStart ?? group.periodStart
  );
  const [periodEnd, setPeriodEnd] = useState(group.report?.actualPeriodEnd ?? group.periodEnd);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [outputError, setOutputError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const confirmTitleId = useId();

  const open = canSubmitOperationDocs(group.status);
  const charCount = countChars(...Object.values(sections));
  const meetsLength = charCount >= STUDY_REPORT_MIN_CHARS;

  const validOutputs = outputs.filter((o) => o.title.trim() || o.url.trim());

  const save = useCallback(
    async (submit: boolean) => {
      setMessage(null);
      setOutputError(null);

      if (submit) {
        if (validOutputs.length === 0) {
          setOutputError("산출물을 1건 이상 등록해 주세요.");
          return false;
        }
        for (const [index, output] of validOutputs.entries()) {
          const parsed = studyOutputSchema.safeParse(output);
          if (!parsed.success) {
            setOutputError(`산출물 ${index + 1}: ${parsed.error.issues[0].message}`);
            return false;
          }
        }
      }

      setSaving(true);
      const { error } = await submitStudy({
        kind: "report",
        groupId: group.groupId,
        ...identity,
        actualPeriodStart: periodStart || null,
        actualPeriodEnd: periodEnd || null,
        ...sections,
        outputs: validOutputs,
        submit,
      });
      setSaving(false);

      if (error) {
        setMessage({ type: "error", text: error });
        return false;
      }

      dirtyRef.current = false;
      setLastSavedAt(new Date().toISOString());
      setMessage({
        type: "success",
        text: submit ? "결과보고서를 제출했습니다." : "임시저장했습니다.",
      });
      if (submit) await refresh();
      return true;
    },
    [group.groupId, identity, periodStart, periodEnd, sections, validOutputs, refresh]
  );

  function updateSection(key: SectionKey, value: string) {
    dirtyRef.current = true;
    setSections((prev) => ({ ...prev, [key]: value }));
  }

  function updateOutput<K extends keyof StudyOutputInput>(
    index: number,
    key: K,
    value: StudyOutputInput[K]
  ) {
    dirtyRef.current = true;
    setOutputs((prev) => prev.map((o, i) => (i === index ? { ...o, [key]: value } : o)));
  }

  if (!open) {
    const submitted = group.status === "report_submitted" || group.status === "completed";
    return (
      <div
        role="status"
        className={
          submitted
            ? "rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-sm text-emerald-900"
            : "rounded-xl border border-slate-300 bg-slate-50 px-5 py-4 text-sm text-slate-700"
        }
      >
        {submitted ? (
          <>
            결과보고서가 제출되었습니다.
            {group.report?.submittedAt && ` (제출: ${formatDateTime(group.report.submittedAt)})`}
            <p className="mt-1">AI융합원 검토 후 이수가 확정되며, 이수혜택은 별도 안내에 따라 지급됩니다.</p>
          </>
        ) : (
          "선발된 연구모임만 결과보고서를 제출할 수 있습니다. 심사 결과는 「내 연구모임」 탭에서 확인해 주세요."
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 표지 — 신청서에서 자동 승계 */}
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-card">
        <h2 className="text-sm font-bold text-slate-800">표지 (신청서에서 자동 승계)</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 font-semibold text-slate-500">모임명</dt>
            <dd className="text-slate-800">{group.name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 font-semibold text-slate-500">주제</dt>
            <dd className="text-slate-800">{group.topic}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 font-semibold text-slate-500">대표자</dt>
            <dd className="text-slate-800">
              {group.leaderName} · {group.leaderAffiliation} · {group.leaderPosition}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 font-semibold text-slate-500">참여인원</dt>
            <dd className="text-slate-800">{group.memberCount}명</dd>
          </div>
        </dl>

        {group.members.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  {/* 서식 2의 열 이름은 "교번"이다(서식 1은 "직번") */}
                  <th className="py-2 pr-3 font-semibold">교번</th>
                  <th className="py-2 pr-3 font-semibold">성명</th>
                  <th className="py-2 pr-3 font-semibold">소속</th>
                  <th className="py-2 font-semibold">직급</th>
                </tr>
              </thead>
              <tbody>
                {group.members.map((m) => (
                  <tr key={m.id} className="border-b border-slate-100 text-slate-700">
                    <td className="py-2 pr-3 tabular-nums">{m.idNumber}</td>
                    <td className="py-2 pr-3">
                      {m.name}
                      {m.isLeader && (
                        <span className="ml-1 rounded bg-brand/10 px-1.5 py-0.5 text-xs font-semibold text-brand">
                          대표
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{m.affiliation}</td>
                    <td className="py-2">{m.position}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FormField label="실제 수행기간 시작">
            {(inputProps) => (
              <input
                {...inputProps}
                type="date"
                className={inputBaseClass}
                value={periodStart}
                onChange={(e) => {
                  dirtyRef.current = true;
                  setPeriodStart(e.target.value);
                }}
              />
            )}
          </FormField>
          <FormField label="실제 수행기간 종료">
            {(inputProps) => (
              <input
                {...inputProps}
                type="date"
                className={inputBaseClass}
                value={periodEnd}
                onChange={(e) => {
                  dirtyRef.current = true;
                  setPeriodEnd(e.target.value);
                }}
              />
            )}
          </FormField>
        </div>

        <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <strong className="text-slate-700">첨부서류</strong> · 회의록(별첨4) — 제출하신 회의록{" "}
          <strong>{group.meetings.length}건</strong>이 자동으로 첨부됩니다.
        </p>
      </section>

      {/* 작성요령 — 근거문서 12페이지 상단 원문 */}
      <section className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
        <h2 className="text-sm font-bold text-slate-800">작성요령</h2>
        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
          {STUDY_REPORT_WRITING_RULES.map((rule) => (
            <li key={rule}>· {rule}</li>
          ))}
        </ul>
        <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-500">
          &quot;최소 3장(표지 제외) 이상&quot; 기준을
          <strong className="text-slate-700"> 공백 제외 {STUDY_REPORT_MIN_CHARS.toLocaleString()}자</strong>로
          환산해 확인합니다.
        </p>
      </section>

      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card">
        <div className="flex items-baseline gap-2 text-sm">
          <span className="font-semibold text-slate-700">전체 분량</span>
          <span className={meetsLength ? "font-bold tabular-nums text-emerald-700" : "font-bold tabular-nums text-amber-700"}>
            {charCount.toLocaleString()}자
          </span>
          <span className="text-xs text-slate-400">
            / {STUDY_REPORT_MIN_CHARS.toLocaleString()}자 이상
          </span>
        </div>
        {lastSavedAt && <span className="text-xs text-slate-400">마지막 저장 {formatDateTime(lastSavedAt)}</span>}
      </div>

      <div className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-8">
        {STUDY_REPORT_SECTIONS.map((section) => (
          <div key={section.key} className="flex flex-col gap-2">
            {/* 계획 대비 실적을 대조해 쓰도록 계획서·회의록을 옆에 띄운다 */}
            {section.reference === "plan1" && group.plan?.section1Topic && (
              <details className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm">
                <summary className="cursor-pointer font-semibold text-slate-700">
                  계획서에 적었던 주제·목적 보기
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                  {group.plan.section1Topic}
                  {"\n\n"}
                  {group.plan.section2Purpose}
                </p>
              </details>
            )}
            {section.reference === "meetings" && group.meetings.length > 0 && (
              <details className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm">
                <summary className="cursor-pointer font-semibold text-slate-700">
                  제출한 회의록 {group.meetings.length}건 보기
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-slate-600" role="list">
                  {group.meetings.map((m) => (
                    <li key={m.id}>
                      · {formatDate(m.metAt)} — {m.subject}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <LongTextField
              label={`${section.no}. ${section.title}`}
              required
              hint={section.hint}
              rows={9}
              value={sections[section.key]}
              onChange={(value) => updateSection(section.key, value)}
            />
          </div>
        ))}

        {/* 6. 산출물 제작 결과 — 구조화 입력 */}
        <fieldset className="rounded-xl border border-slate-200 p-4 sm:p-5">
          <legend className="px-2 text-sm font-bold text-slate-800">6. 산출물 제작 결과</legend>
          <p className="mb-4 text-xs leading-relaxed text-amber-800">{STUDY_OUTPUT_NOTICE}</p>

          <div className="flex flex-col gap-4">
            {outputs.map((output, index) => (
              <div key={index} className="rounded-lg border border-slate-200 p-3 sm:p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label={`산출물명 ${index + 1}`} required>
                    {(inputProps) => (
                      <input
                        {...inputProps}
                        type="text"
                        className={inputBaseClass}
                        value={output.title}
                        onChange={(e) => updateOutput(index, "title", e.target.value)}
                      />
                    )}
                  </FormField>
                  <FormField label="유형" required>
                    {(inputProps) => (
                      <select
                        {...inputProps}
                        className={inputBaseClass}
                        value={output.outputType}
                        onChange={(e) => updateOutput(index, "outputType", e.target.value as StudyOutputInput["outputType"])}
                      >
                        {STUDY_OUTPUT_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    )}
                  </FormField>
                </div>

                <div className="mt-4">
                  <FormField label="링크 URL" required hint="https:// 로 시작하는 주소">
                    {(inputProps) => (
                      <input
                        {...inputProps}
                        type="url"
                        className={inputBaseClass}
                        value={output.url}
                        placeholder="https://"
                        onChange={(e) => updateOutput(index, "url", e.target.value)}
                      />
                    )}
                  </FormField>
                </div>

                <div className="mt-4">
                  <FormField label="설명">
                    {(inputProps) => (
                      <textarea
                        {...inputProps}
                        rows={2}
                        className={`${inputBaseClass} resize-y`}
                        value={output.description}
                        onChange={(e) => updateOutput(index, "description", e.target.value)}
                      />
                    )}
                  </FormField>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <FormField label="구글 드라이브 업로드">
                    {(inputProps) => (
                      <label htmlFor={inputProps.id} className="flex items-start gap-2 text-sm text-slate-700">
                        <input
                          {...inputProps}
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-accent focus:ring-accent"
                          checked={output.driveUploaded}
                          onChange={(e) => updateOutput(index, "driveUploaded", e.target.checked)}
                        />
                        <span>안내받은 구글 드라이브에도 업로드를 완료했습니다.</span>
                      </label>
                    )}
                  </FormField>
                  {outputs.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:bg-red-50"
                      onClick={() => setOutputs((prev) => prev.filter((_, i) => i !== index))}
                    >
                      이 산출물 삭제
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOutputs((prev) => [...prev, { ...EMPTY_OUTPUT }])}
            >
              산출물 추가
            </Button>
          </div>

          {outputError && (
            <p role="alert" className="mt-3 text-sm font-medium text-red-600">
              {outputError}
            </p>
          )}
        </fieldset>

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
            결과보고서 제출하기
          </Button>
        </div>

        {!meetsLength && (
          <p className="text-center text-xs text-slate-500">
            제출하려면 {(STUDY_REPORT_MIN_CHARS - charCount).toLocaleString()}자를 더 작성해 주세요.
          </p>
        )}
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} titleId={confirmTitleId}>
        <h2 id={confirmTitleId} className="text-lg font-bold text-brand">
          결과보고서 제출 확인
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          제출하면 <strong>이후에는 수정할 수 없습니다.</strong> 산출물 {validOutputs.length}건과 회의록{" "}
          {group.meetings.length}건이 함께 제출됩니다.
        </p>

        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-center text-sm leading-relaxed text-slate-700">
          <p>{STUDY_REPORT_SIGNATURE}</p>
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
