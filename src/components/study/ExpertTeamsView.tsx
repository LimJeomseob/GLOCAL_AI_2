"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import { StudyStatusBadge } from "@/components/study/StudyStatusBadge";
import { CoachingSchedulePanel } from "@/components/study/CoachingSchedulePanel";
import { formatDate, formatPhoneInput } from "@/lib/format";
import { studyExpertIdentitySchema } from "@/lib/studyValidation";
import type { StudyCoachingProposalInput } from "@/lib/studyValidation";
import {
  clearExpertIdentity,
  lookupExpertGroups,
  readExpertIdentity,
  submitStudy,
  writeExpertIdentity,
} from "@/lib/studyApi";
import { STUDY_WORKSHOP_OPTIONS, STUDY_WORKSHOP_STEPS } from "@/lib/studyGroupConstants";
import type {
  StudyExpertAssignedGroup,
  StudyExpertIdentity,
  StudyExpertLookupResult,
} from "@/lib/studyTypes";

type FieldErrors = Partial<Record<"expertName" | "expertPhone", string>>;

/** 코칭 일정을 주고받을 수 있는 팀 상태 — 서버(study-submit COACHING_STATUSES)와 같은 기준 */
const OPEN_STATUSES = new Set(["selected", "in_progress"]);

/**
 * 탭. 전문가의 '배정 팀 확인'.
 *
 * 선정된 전문가가 성명·연락처만으로 자기에게 배정된 연구모임을 확인하고, 팀과 코칭 일정을
 * 조율한다. 대표자 게이트(StudyGroupGate)와 같은 구조이되 신원 키를 따로 쓴다 —
 * 한 브라우저에서 두 역할을 오갈 때 신원이 섞이지 않게 하기 위함이다.
 */
export function ExpertTeamsView() {
  const [identity, setIdentity] = useState<StudyExpertIdentity | null>(null);
  const [form, setForm] = useState({ expertName: "", expertPhone: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<StudyExpertLookupResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const autoTried = useRef(false);

  const runLookup = useCallback(async (next: StudyExpertIdentity, { silent = false } = {}) => {
    setLoading(true);
    if (!silent) setMessage(null);

    const { data, error } = await lookupExpertGroups(next);
    setLoading(false);

    if (error) {
      if (!silent) setMessage(error);
      return;
    }
    if (!data) {
      // 불일치는 에러가 아니다. 자동 조회면 조용히 입력 폼을 보여 준다.
      if (!silent) {
        setMessage(
          "일치하는 전문가 신청이 없습니다. 성명과 연락처를 확인해 주세요. 선정된 전문가만 조회할 수 있습니다."
        );
      }
      clearExpertIdentity();
      return;
    }

    setIdentity(next);
    setForm(next);
    setResult(data);
    setSelectedId((prev) =>
      prev && data.groups.some((g) => g.groupId === prev) ? prev : (data.groups[0]?.groupId ?? null)
    );
    writeExpertIdentity(next);
  }, []);

  useEffect(() => {
    if (autoTried.current) return;
    autoTried.current = true;

    const stored = readExpertIdentity();
    if (stored) {
      setForm(stored);
      void runLookup(stored, { silent: true });
    }
  }, [runLookup]);

  const refresh = useCallback(async () => {
    if (identity) await runLookup(identity, { silent: true });
  }, [identity, runLookup]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = studyExpertIdentitySchema.safeParse(form);

    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    void runLookup(parsed.data);
  }

  function handleReset() {
    clearExpertIdentity();
    setIdentity(null);
    setResult(null);
    setSelectedId(null);
    setForm({ expertName: "", expertPhone: "" });
    setMessage(null);
  }

  async function send(
    group: StudyExpertAssignedGroup,
    payload: Record<string, unknown>
  ): Promise<string | null> {
    if (!identity) return "본인확인이 필요합니다.";
    const { error } = await submitStudy({
      groupId: group.groupId,
      ...identity,
      ...payload,
    });
    if (error) return error;
    await refresh();
    return null;
  }

  // 본인확인 전 — 입력 폼
  if (!identity || !result) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold text-brand sm:text-2xl">배정 팀 확인</h1>
          <p className="mt-2 text-sm text-slate-600 sm:text-base">
            선정된 교내 AI활용 전문가가 배정된 연구모임을 확인하고 코칭 일정을 조율합니다.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-8"
        >
          <div>
            <h2 className="text-base font-bold text-slate-800">본인확인</h2>
            <p className="mt-1 text-sm text-slate-600">
              전문가 신청서에 적은 <strong>성명과 연락처</strong>를 입력하면 배정된 연구모임이
              열립니다.
            </p>
          </div>

          <FormField label="성명" required error={errors.expertName}>
            {(inputProps) => (
              <input
                {...inputProps}
                type="text"
                className={inputBaseClass}
                value={form.expertName}
                autoComplete="name"
                onChange={(e) => setForm((prev) => ({ ...prev, expertName: e.target.value }))}
              />
            )}
          </FormField>

          <FormField label="연락처" required error={errors.expertPhone} hint="예: 010-1234-5678">
            {(inputProps) => (
              <input
                {...inputProps}
                type="tel"
                className={inputBaseClass}
                value={form.expertPhone}
                autoComplete="tel"
                placeholder="010-1234-5678"
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, expertPhone: formatPhoneInput(e.target.value) }))
                }
              />
            )}
          </FormField>

          {message && (
            <p
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
            >
              {message}
            </p>
          )}

          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={loading}>
            {loading ? "조회 중..." : "조회하기"}
          </Button>

          <p className="text-center text-sm text-slate-500">
            아직 신청하지 않으셨나요?{" "}
            <Link
              href="/expert-apply"
              className="font-semibold text-accent underline underline-offset-2"
            >
              전문가 신청하기
            </Link>
          </p>
        </form>
      </div>
    );
  }

  const selected = result.groups.find((g) => g.groupId === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-brand sm:text-2xl">배정 팀 확인</h1>
          <p className="mt-2 text-sm text-slate-600 sm:text-base">
            {result.expert.name} 님께 배정된 연구모임 {result.groups.length}개입니다.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleReset}>
          다른 전문가로 조회
        </Button>
      </div>

      {result.groups.length === 0 ? (
        <p
          role="status"
          className="rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center text-sm text-slate-500"
        >
          아직 배정된 연구모임이 없습니다. AI융합원이 팀을 배정하면 이 화면에 표시됩니다.
        </p>
      ) : (
        <>
          {result.groups.length > 1 && (
            <FormField label="배정된 연구모임">
              {(inputProps) => (
                <select
                  {...inputProps}
                  className={inputBaseClass}
                  value={selectedId ?? ""}
                  onChange={(e) => setSelectedId(e.target.value)}
                >
                  {result.groups.map((g) => (
                    <option key={g.groupId} value={g.groupId}>
                      {g.code} · {g.name}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          )}

          {selected && (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-slate-600">
                    {selected.code}
                  </span>
                  <span className="text-sm font-bold text-slate-800">{selected.name}</span>
                  <StudyStatusBadge status={selected.status} />
                  <span className="text-xs text-slate-500">
                    [{selected.category}] · 참여 {selected.memberCount}명
                  </span>
                </div>

                <p className="mt-3 text-sm font-semibold text-slate-800">{selected.topic}</p>

                <dl className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 font-semibold text-slate-500">대표자</dt>
                    <dd>
                      {selected.leaderName} ({selected.leaderAffiliation} · {selected.leaderPosition})
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 font-semibold text-slate-500">연락처</dt>
                    <dd className="tabular-nums">{selected.leaderPhone}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 font-semibold text-slate-500">이메일</dt>
                    <dd className="break-all">{selected.leaderEmail}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 font-semibold text-slate-500">운영기간</dt>
                    <dd>
                      {formatDate(selected.periodStart)} ~ {formatDate(selected.periodEnd)}
                    </dd>
                  </div>
                </dl>

                <WorkshopPreferenceHint pref={selected.workshopPref} />
              </section>

              <CoachingSchedulePanel
                key={selected.groupId}
                actor="전문가"
                counterpart={{
                  label: "대표자",
                  name: selected.leaderName,
                  detail: selected.leaderPhone,
                }}
                sessions={selected.coachingSessions}
                memos={selected.coachingMemos}
                editable={OPEN_STATUSES.has(selected.status)}
                readOnlyNotice={
                  OPEN_STATUSES.has(selected.status)
                    ? null
                    : "운영 단계가 아니어서 코칭 일정을 변경할 수 없습니다."
                }
                onPropose={(input: StudyCoachingProposalInput) =>
                  send(selected, { kind: "expert-coaching-propose", ...input })
                }
                onRespond={(sessionId, response, note) =>
                  send(selected, { kind: "expert-coaching-respond", sessionId, response, note })
                }
                onConfirm={(sessionId) =>
                  send(selected, { kind: "expert-coaching-confirm", sessionId })
                }
                onMemo={(body) => send(selected, { kind: "expert-coaching-memo", body })}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

/** 계획서 5번에 적힌 팀의 워크숍 희망일 — 일정을 제안할 때 참고하라고 보여 준다. */
function WorkshopPreferenceHint({ pref }: { pref: Record<string, Record<string, string>> }) {
  const rows = STUDY_WORKSHOP_OPTIONS.map((option) => ({
    option,
    dates: STUDY_WORKSHOP_STEPS.map((step) => ({
      step,
      date: pref?.[option.key]?.[step.key] ?? "",
    })),
  })).filter((row) => row.dates.some((d) => d.date));

  if (rows.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <h3 className="text-xs font-bold text-slate-700">팀이 계획서에 적은 희망일</h3>
      <ul className="mt-2 flex flex-col gap-1 text-xs text-slate-600" role="list">
        {rows.map(({ option, dates }) => (
          <li key={option.key}>
            <span className="font-semibold text-slate-700">{option.label}</span>{" "}
            {dates
              .filter((d) => d.date)
              .map((d) => `${d.step.name} ${d.date}`)
              .join(" · ")}
          </li>
        ))}
      </ul>
    </div>
  );
}
