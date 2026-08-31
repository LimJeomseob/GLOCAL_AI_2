"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";
import { StudyStatusBadge } from "@/components/study/StudyStatusBadge";
import { formatPhoneInput } from "@/lib/format";
import { studyIdentitySchema } from "@/lib/studyValidation";
import {
  clearStudyIdentity,
  lookupStudyGroups,
  readStudyIdentity,
  writeStudyIdentity,
} from "@/lib/studyApi";
import type { StudyIdentity, StudyLookupResult } from "@/lib/studyTypes";

interface RenderArgs {
  group: StudyLookupResult;
  identity: StudyIdentity;
  /** 제출 후 서버 상태를 다시 읽어 화면을 갱신한다. */
  refresh: () => Promise<void>;
}

interface StudyGroupGateProps {
  title: string;
  description: string;
  children: (args: RenderArgs) => React.ReactNode;
}

type FieldErrors = Partial<Record<"leaderName" | "leaderPhone", string>>;

/**
 * 본인확인 게이트.
 *
 * 계획서·회의록·결과보고서 탭은 로그인 없이 "대표자 성명 + 연락처"로만 열린다.
 * 탭 2에서 신청을 마친 직후에는 sessionStorage에 남은 신원으로 자동 조회해
 * 같은 정보를 두 번 입력하지 않게 한다(개인정보라 탭을 닫으면 사라진다).
 */
export function StudyGroupGate({ title, description, children }: StudyGroupGateProps) {
  const [identity, setIdentity] = useState<StudyIdentity | null>(null);
  const [form, setForm] = useState({ leaderName: "", leaderPhone: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [groups, setGroups] = useState<StudyLookupResult[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const autoTried = useRef(false);

  const runLookup = useCallback(async (next: StudyIdentity, { silent = false } = {}) => {
    setLoading(true);
    if (!silent) setMessage(null);

    const { data, error } = await lookupStudyGroups(next);
    setLoading(false);

    if (error) {
      if (!silent) setMessage(error);
      return;
    }
    if (!data || data.length === 0) {
      // 자동 조회에서 빈 결과면 조용히 입력 폼을 보여준다(오래된 세션일 수 있음).
      if (!silent) {
        setMessage("일치하는 연구모임이 없습니다. 대표자 성명과 연락처를 확인해 주세요.");
      }
      clearStudyIdentity();
      return;
    }

    setIdentity(next);
    setGroups(data);
    setSelectedId((prev) => (prev && data.some((g) => g.groupId === prev) ? prev : data[0].groupId));
    writeStudyIdentity(next);
  }, []);

  // 탭 2 → 탭 3 이동처럼 직전 화면에서 신원이 남아 있으면 한 번만 자동 조회한다.
  useEffect(() => {
    if (autoTried.current) return;
    autoTried.current = true;

    const stored = readStudyIdentity();
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
    const parsed = studyIdentitySchema.safeParse(form);

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
    clearStudyIdentity();
    setIdentity(null);
    setGroups(null);
    setSelectedId(null);
    setForm({ leaderName: "", leaderPhone: "" });
    setMessage(null);
  }

  const selected = groups?.find((g) => g.groupId === selectedId) ?? null;

  if (identity && selected) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-brand sm:text-2xl">{title}</h1>
            <p className="mt-2 text-sm text-slate-600 sm:text-base">{description}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleReset}>
            다른 모임으로 조회
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card">
          <span className="rounded bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-slate-600">
            {selected.code}
          </span>
          <span className="text-sm font-bold text-slate-800">{selected.name}</span>
          <StudyStatusBadge status={selected.status} />
          <span className="text-xs text-slate-500">
            대표자 {selected.leaderName} · 참여 {selected.memberCount}명
          </span>
          {selected.isMultiDept && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              복수 학과 — 가산점 대상
            </span>
          )}
        </div>

        {groups && groups.length > 1 && (
          <FormField label="조회된 연구모임">
            {(inputProps) => (
              <select
                {...inputProps}
                className={inputBaseClass}
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {groups.map((g) => (
                  <option key={g.groupId} value={g.groupId}>
                    {g.code} · {g.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        )}

        {children({ group: selected, identity, refresh })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-brand sm:text-2xl">{title}</h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">{description}</p>
      </div>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-8"
      >
        <div>
          <h2 className="text-base font-bold text-slate-800">본인확인</h2>
          <p className="mt-1 text-sm text-slate-600">
            신청서에 적은 <strong>대표자 성명과 연락처</strong>를 입력하면 해당 연구모임의 작성
            화면이 열립니다.
          </p>
        </div>

        <FormField label="대표자 성명" required error={errors.leaderName}>
          {(inputProps) => (
            <input
              {...inputProps}
              type="text"
              className={inputBaseClass}
              value={form.leaderName}
              autoComplete="name"
              onChange={(e) => setForm((prev) => ({ ...prev, leaderName: e.target.value }))}
            />
          )}
        </FormField>

        <FormField label="대표자 연락처" required error={errors.leaderPhone} hint="예: 010-1234-5678">
          {(inputProps) => (
            <input
              {...inputProps}
              type="tel"
              className={inputBaseClass}
              value={form.leaderPhone}
              autoComplete="tel"
              placeholder="010-1234-5678"
              onChange={(e) =>
                setForm((prev) => ({ ...prev, leaderPhone: formatPhoneInput(e.target.value) }))
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
          <Link href="/study/apply" className="font-semibold text-accent underline underline-offset-2">
            연구모임 신청하기
          </Link>
        </p>
      </form>
    </div>
  );
}
