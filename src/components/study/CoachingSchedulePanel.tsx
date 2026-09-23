"use client";

import { useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  studyCoachingMemoSchema,
  studyCoachingProposalSchema,
  type StudyCoachingProposalInput,
} from "@/lib/studyValidation";
import { STUDY_COACHING_SESSIONS } from "@/lib/studyGroupConstants";
import type {
  StudyCoachingActor,
  StudyCoachingStatus,
  StudyLookupCoachingMemo,
  StudyLookupCoachingSession,
} from "@/lib/studyTypes";

const STATUS_CLASSES: Record<StudyCoachingStatus, string> = {
  제안: "bg-sky-100 text-sky-800",
  가능: "bg-emerald-100 text-emerald-800",
  불가: "bg-rose-100 text-rose-800",
  확정: "bg-brand text-white",
};

interface ProposalFormState {
  sessionNo: number;
  metAt: string;
  startTime: string;
  endTime: string;
  location: string;
}

type FieldErrors = Partial<Record<keyof ProposalFormState, string>>;

function emptyProposal(sessionNo: number): ProposalFormState {
  return { sessionNo, metAt: "", startTime: "", endTime: "", location: "" };
}

function whenText(session: StudyLookupCoachingSession): string {
  const start = session.startTime?.slice(0, 5) ?? "";
  const end = session.endTime?.slice(0, 5) ?? "";
  const time = start ? ` ${start}${end ? `~${end}` : ""}` : "";
  return `${formatDate(session.metAt)}${time}`;
}

export interface CoachingSchedulePanelProps {
  /** 이 화면을 보는 주체. 팀이면 제안·삭제·확정, 전문가면 회신·제안·확정을 할 수 있다. */
  actor: Extract<StudyCoachingActor, "팀" | "전문가">;
  /** 상대방 표기(팀 화면이면 배정 전문가, 전문가 화면이면 대표자) */
  counterpart: { label: string; name: string; detail?: string } | null;
  sessions: StudyLookupCoachingSession[];
  memos: StudyLookupCoachingMemo[];
  /** false면 모든 입력을 잠그고 읽기 전용으로 보여 준다. */
  editable: boolean;
  /** 읽기 전용일 때 상단에 띄울 사유 */
  readOnlyNotice?: string | null;
  onPropose: (input: StudyCoachingProposalInput) => Promise<string | null>;
  onConfirm: (sessionId: string) => Promise<string | null>;
  onRespond?: (sessionId: string, response: "가능" | "불가", note: string) => Promise<string | null>;
  onDelete?: (sessionId: string) => Promise<string | null>;
  onMemo: (body: string) => Promise<string | null>;
}

/**
 * 코칭 일정 조율 패널 — 팀 화면(/coaching)과 전문가 화면(/expert-teams)이 함께 쓴다.
 *
 * 흐름: 한쪽이 일시·장소를 제안하면 전문가가 가능/불가로 회신하고, 어느 한쪽이 확정한다.
 * 회차(기획·제작·환류)마다 제안이 여러 건 쌓일 수 있고 확정은 1건만 남는다(DB 부분 유니크).
 * 말로 조율해야 하는 부분은 아래 메모 스레드가 받는다.
 */
export function CoachingSchedulePanel({
  actor,
  counterpart,
  sessions,
  memos,
  editable,
  readOnlyNotice = null,
  onPropose,
  onConfirm,
  onRespond,
  onDelete,
  onMemo,
}: CoachingSchedulePanelProps) {
  const [openForm, setOpenForm] = useState<number | null>(null);
  const [form, setForm] = useState<ProposalFormState>(() => emptyProposal(1));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [memoBody, setMemoBody] = useState("");
  const [memoError, setMemoError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [respondNote, setRespondNote] = useState("");

  const confirmedCount = sessions.filter((s) => s.status === "확정").length;

  function startPropose(sessionNo: number) {
    setForm(emptyProposal(sessionNo));
    setErrors({});
    setOpenForm(sessionNo);
    setMessage(null);
  }

  /** 서버 호출 공통 처리 — 성공 문구를 띄우고 실패는 그대로 보여 준다. */
  async function run(action: () => Promise<string | null>, successText: string) {
    setBusy(true);
    setMessage(null);
    const error = await action();
    setBusy(false);

    if (error) {
      setMessage({ type: "error", text: error });
      return false;
    }
    setMessage({ type: "success", text: successText });
    return true;
  }

  async function handlePropose(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = studyCoachingProposalSchema.safeParse(form);

    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof ProposalFormState;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});

    const ok = await run(() => onPropose(parsed.data), "일정을 제안했습니다.");
    if (ok) setOpenForm(null);
  }

  async function handleRespond(sessionId: string, response: "가능" | "불가") {
    if (!onRespond) return;
    const ok = await run(
      () => onRespond(sessionId, response, respondNote.trim()),
      `${response}(으)로 회신했습니다.`
    );
    if (ok) {
      setRespondingId(null);
      setRespondNote("");
    }
  }

  async function handleMemo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = studyCoachingMemoSchema.safeParse({ body: memoBody });

    if (!parsed.success) {
      setMemoError(parsed.error.issues[0].message);
      return;
    }
    setMemoError(null);

    const ok = await run(() => onMemo(parsed.data.body), "메모를 남겼습니다.");
    if (ok) setMemoBody("");
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 요약 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card">
        <div className="text-sm">
          <span className="font-semibold text-slate-700">확정된 코칭</span>{" "}
          <span
            className={clsx(
              "font-bold tabular-nums",
              confirmedCount < STUDY_COACHING_SESSIONS.length ? "text-amber-700" : "text-emerald-700"
            )}
          >
            {confirmedCount}
          </span>
          <span className="text-slate-400"> / {STUDY_COACHING_SESSIONS.length}회</span>
        </div>
        {counterpart && (
          <div className="text-xs text-slate-600">
            <span className="font-semibold text-slate-700">{counterpart.label}</span>{" "}
            {counterpart.name}
            {counterpart.detail && <span className="text-slate-500"> · {counterpart.detail}</span>}
          </div>
        )}
      </div>

      {readOnlyNotice && (
        <p
          role="status"
          className="rounded-xl border border-slate-300 bg-slate-50 px-5 py-4 text-sm text-slate-700"
        >
          {readOnlyNotice}
        </p>
      )}

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

      {/* 회차별 카드 */}
      {STUDY_COACHING_SESSIONS.map((step) => {
        const rows = sessions.filter((s) => s.sessionNo === step.no);
        const confirmed = rows.find((s) => s.status === "확정") ?? null;

        return (
          <section
            key={step.no}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-800">
                  {step.label}
                  {confirmed && (
                    <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">
                      확정
                    </span>
                  )}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{step.detail}</p>
              </div>
              {editable && openForm !== step.no && (
                <Button variant="outline" size="sm" onClick={() => startPropose(step.no)} disabled={busy}>
                  일정 제안
                </Button>
              )}
            </div>

            {confirmed && (
              <p className="mt-3 rounded-lg border border-brand/30 bg-brand/5 px-4 py-3 text-sm font-semibold text-brand">
                {whenText(confirmed)} · {confirmed.location || "장소 미정"}
                {confirmed.confirmedBy && (
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {confirmed.confirmedBy} 확정
                  </span>
                )}
              </p>
            )}

            {/* 제안 폼 */}
            {editable && openForm === step.no && (
              <form
                onSubmit={handlePropose}
                noValidate
                className="mt-4 flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField label="일자" required error={errors.metAt}>
                    {(inputProps) => (
                      <input
                        {...inputProps}
                        type="date"
                        className={inputBaseClass}
                        value={form.metAt}
                        onChange={(e) => setForm((p) => ({ ...p, metAt: e.target.value }))}
                      />
                    )}
                  </FormField>
                  <FormField label="시작 시각" required error={errors.startTime}>
                    {(inputProps) => (
                      <input
                        {...inputProps}
                        type="time"
                        className={inputBaseClass}
                        value={form.startTime}
                        onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))}
                      />
                    )}
                  </FormField>
                  <FormField label="종료 시각" required error={errors.endTime}>
                    {(inputProps) => (
                      <input
                        {...inputProps}
                        type="time"
                        className={inputBaseClass}
                        value={form.endTime}
                        onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}
                      />
                    )}
                  </FormField>
                </div>

                <FormField
                  label="장소"
                  required
                  error={errors.location}
                  hint="대면 장소 또는 온라인 도구명(예: 가좌캠퍼스 OO관 201호 / Zoom)"
                >
                  {(inputProps) => (
                    <input
                      {...inputProps}
                      type="text"
                      className={inputBaseClass}
                      value={form.location}
                      onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                    />
                  )}
                </FormField>

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setOpenForm(null)}
                    disabled={busy}
                  >
                    취소
                  </Button>
                  <Button type="submit" variant="primary" size="sm" disabled={busy}>
                    {busy ? "저장 중..." : "제안하기"}
                  </Button>
                </div>
              </form>
            )}

            {/* 제안 목록 */}
            {rows.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">아직 제안된 일정이 없습니다.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2" role="list">
                {rows.map((s) => (
                  <li key={s.id} className="rounded-lg border border-slate-200 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm">
                        <span
                          className={clsx(
                            "mr-2 inline-flex rounded-full px-2 py-0.5 text-xs font-bold",
                            STATUS_CLASSES[s.status]
                          )}
                        >
                          {s.status}
                        </span>
                        <span className="font-semibold text-slate-800">{whenText(s)}</span>
                        <span className="text-slate-600"> · {s.location || "장소 미정"}</span>
                        <span className="ml-2 text-xs text-slate-400">{s.proposedBy} 제안</span>
                      </div>

                      {editable && (
                        <div className="flex flex-wrap gap-1">
                          {actor === "전문가" && onRespond && s.status !== "확정" && s.proposedBy !== "전문가" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setRespondingId(respondingId === s.id ? null : s.id);
                                setRespondNote(s.expertNote);
                              }}
                              disabled={busy}
                            >
                              가능 여부 회신
                            </Button>
                          )}
                          {(s.status === "가능" || (s.status === "제안" && s.proposedBy !== actor)) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void run(() => onConfirm(s.id), "일정을 확정했습니다.")}
                              disabled={busy}
                            >
                              확정
                            </Button>
                          )}
                          {actor === "팀" && onDelete && s.status !== "확정" && s.proposedBy === "팀" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:bg-red-50"
                              onClick={() => void run(() => onDelete(s.id), "제안을 삭제했습니다.")}
                              disabled={busy}
                            >
                              삭제
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    {s.expertNote && (
                      <p className="mt-2 border-t border-slate-100 pt-2 text-xs leading-relaxed text-slate-600">
                        전문가 메모 · {s.expertNote}
                      </p>
                    )}

                    {/* 전문가 회신 입력 */}
                    {editable && respondingId === s.id && onRespond && (
                      <div className="mt-3 flex flex-col gap-2 rounded-lg bg-slate-50 p-3">
                        <FormField label="회신 메모" hint="예: 오전만 가능합니다.">
                          {(inputProps) => (
                            <input
                              {...inputProps}
                              type="text"
                              className={inputBaseClass}
                              value={respondNote}
                              maxLength={500}
                              onChange={(e) => setRespondNote(e.target.value)}
                            />
                          )}
                        </FormField>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleRespond(s.id, "불가")}
                            disabled={busy}
                          >
                            불가
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => void handleRespond(s.id, "가능")}
                            disabled={busy}
                          >
                            가능
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {/* 조율 메모 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <h2 className="text-base font-bold text-slate-800">조율 메모</h2>
        <p className="mt-1 text-xs text-slate-500">
          일정 조율에 필요한 이야기를 남겨 주세요. 팀·전문가·담당자가 함께 봅니다.
        </p>

        {memos.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
            아직 남긴 메모가 없습니다.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3" role="list">
            {memos.map((m) => (
              <li key={m.id} className="rounded-lg border border-slate-200 px-4 py-3">
                <p className="text-xs font-semibold text-slate-500">
                  {m.authorRole}
                  {m.authorName && ` · ${m.authorName}`}
                  <span className="ml-2 font-normal text-slate-400">
                    {formatDateTime(m.createdAt)}
                  </span>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {m.body}
                </p>
              </li>
            ))}
          </ul>
        )}

        {editable && (
          <form onSubmit={handleMemo} noValidate className="mt-4 flex flex-col gap-3">
            <FormField label="새 메모" error={memoError ?? undefined}>
              {(inputProps) => (
                <textarea
                  {...inputProps}
                  rows={3}
                  className={`${inputBaseClass} resize-y leading-relaxed`}
                  value={memoBody}
                  maxLength={2000}
                  onChange={(e) => setMemoBody(e.target.value)}
                />
              )}
            </FormField>
            <div className="flex justify-end">
              <Button type="submit" variant="primary" size="sm" disabled={busy}>
                {busy ? "저장 중..." : "메모 남기기"}
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
