"use client";

import { useState } from "react";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/format";
import { studyMeetingSchema } from "@/lib/studyValidation";
import { canSubmitOperationDocs, submitStudy } from "@/lib/studyApi";
import { STUDY_MEETING_TARGET_COUNT } from "@/lib/studyGroupConstants";
import type { StudyIdentity, StudyLookupResult } from "@/lib/studyTypes";

interface MeetingFormState {
  meetingId: string | null;
  metAt: string;
  startTime: string;
  endTime: string;
  location: string;
  subject: string;
  content: string;
  authorName: string;
}

type FieldErrors = Partial<Record<keyof MeetingFormState, string>>;

function emptyForm(authorName: string): MeetingFormState {
  return {
    meetingId: null,
    metAt: "",
    startTime: "",
    endTime: "",
    location: "",
    subject: "",
    content: "",
    authorName,
  };
}

/**
 * [서식 3] 회의록 (근거문서 13페이지).
 *
 * 팀당 여러 번 반복 제출한다. 다과비 산출근거(10,000원 × 5명 × 30회 / 10개팀)에서
 * 팀당 평균 3회가 전제되므로 진척도를 n/3으로 표시한다.
 * 여기 쌓인 회의록이 결과보고서의 첨부서류(별첨4)로 자동 연결된다.
 */
export function MeetingLogForm({
  group,
  identity,
  refresh,
}: {
  group: StudyLookupResult;
  identity: StudyIdentity;
  refresh: () => Promise<void>;
}) {
  const [form, setForm] = useState<MeetingFormState>(() => emptyForm(group.leaderName));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const open = canSubmitOperationDocs(group.status);
  const meetings = group.meetings;

  function updateField<K extends keyof MeetingFormState>(key: K, value: MeetingFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function startNew() {
    setForm(emptyForm(group.leaderName));
    setErrors({});
    setEditing(true);
    setMessage(null);
  }

  function startEdit(meetingId: string) {
    const target = meetings.find((m) => m.id === meetingId);
    if (!target) return;
    setForm({
      meetingId: target.id,
      metAt: target.metAt,
      startTime: target.startTime?.slice(0, 5) ?? "",
      endTime: target.endTime?.slice(0, 5) ?? "",
      location: target.location,
      subject: target.subject,
      content: target.content,
      authorName: target.authorName,
    });
    setErrors({});
    setEditing(true);
    setMessage(null);
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);

    const parsed = studyMeetingSchema.safeParse({
      metAt: form.metAt,
      startTime: form.startTime || null,
      endTime: form.endTime || null,
      location: form.location,
      subject: form.subject,
      content: form.content,
      authorName: form.authorName,
    });

    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof MeetingFormState;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSaving(true);

    const { error } = await submitStudy({
      kind: "meeting-save",
      groupId: group.groupId,
      ...identity,
      meetingId: form.meetingId,
      ...parsed.data,
    });

    setSaving(false);
    if (error) {
      setMessage({ type: "error", text: error });
      return;
    }

    setMessage({ type: "success", text: "회의록을 저장했습니다." });
    setEditing(false);
    setForm(emptyForm(group.leaderName));
    await refresh();
  }

  async function handleDelete(meetingId: string) {
    if (!window.confirm("이 회의록을 삭제할까요? 되돌릴 수 없습니다.")) return;

    setSaving(true);
    const { error } = await submitStudy({
      kind: "meeting-delete",
      groupId: group.groupId,
      ...identity,
      meetingId,
    });
    setSaving(false);

    if (error) {
      setMessage({ type: "error", text: error });
      return;
    }
    setMessage({ type: "success", text: "회의록을 삭제했습니다." });
    await refresh();
  }

  if (!open) {
    return (
      <div
        role="status"
        className="rounded-xl border border-slate-300 bg-slate-50 px-5 py-4 text-sm text-slate-700"
      >
        {group.status === "report_submitted" || group.status === "completed"
          ? "결과보고서가 제출되어 회의록을 더 이상 수정할 수 없습니다."
          : "선발된 연구모임만 회의록을 등록할 수 있습니다. 심사 결과는 「내 연구모임」 탭에서 확인해 주세요."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card">
        <div className="text-sm">
          <span className="font-semibold text-slate-700">등록된 회의록</span>{" "}
          <span className="font-bold tabular-nums text-brand">{meetings.length}</span>
          <span className="text-slate-400"> / 권장 {STUDY_MEETING_TARGET_COUNT}회</span>
        </div>
        {!editing && (
          <Button variant="primary" size="sm" onClick={startNew}>
            회의록 등록
          </Button>
        )}
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

      {editing && (
        <form
          onSubmit={handleSave}
          noValidate
          className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-8"
        >
          <h2 className="text-base font-bold text-slate-800">
            {form.meetingId ? "회의록 수정" : "새 회의록"}
          </h2>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <strong className="text-slate-800">모임명</strong> · {group.name}
            <span className="ml-2 text-xs text-slate-500">(신청서에서 자동 입력)</span>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <FormField label="모임일자" required error={errors.metAt}>
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="date"
                  className={inputBaseClass}
                  value={form.metAt}
                  onChange={(e) => updateField("metAt", e.target.value)}
                />
              )}
            </FormField>
            <FormField label="시작 시각" error={errors.startTime}>
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="time"
                  className={inputBaseClass}
                  value={form.startTime}
                  onChange={(e) => updateField("startTime", e.target.value)}
                />
              )}
            </FormField>
            <FormField label="종료 시각" error={errors.endTime}>
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="time"
                  className={inputBaseClass}
                  value={form.endTime}
                  onChange={(e) => updateField("endTime", e.target.value)}
                />
              )}
            </FormField>
          </div>

          <FormField label="장소" error={errors.location} hint="대면 장소 또는 온라인 도구명(예: Zoom)">
            {(inputProps) => (
              <input
                {...inputProps}
                type="text"
                className={inputBaseClass}
                value={form.location}
                onChange={(e) => updateField("location", e.target.value)}
              />
            )}
          </FormField>

          <FormField label="모임주제" required error={errors.subject}>
            {(inputProps) => (
              <input
                {...inputProps}
                type="text"
                className={inputBaseClass}
                value={form.subject}
                onChange={(e) => updateField("subject", e.target.value)}
              />
            )}
          </FormField>

          <FormField
            label="토의내용"
            error={errors.content}
            hint="○ 항목 / - 세부 내용 형식으로 정리하면 결과보고서 작성에 그대로 활용할 수 있습니다."
          >
            {(inputProps) => (
              <textarea
                {...inputProps}
                rows={10}
                className={`${inputBaseClass} resize-y leading-relaxed`}
                value={form.content}
                placeholder={"○ 논의 안건\n - 세부 내용"}
                onChange={(e) => updateField("content", e.target.value)}
              />
            )}
          </FormField>

          <FormField label="작성자" error={errors.authorName}>
            {(inputProps) => (
              <input
                {...inputProps}
                type="text"
                className={inputBaseClass}
                value={form.authorName}
                onChange={(e) => updateField("authorName", e.target.value)}
              />
            )}
          </FormField>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditing(false);
                setForm(emptyForm(group.leaderName));
              }}
              disabled={saving}
            >
              취소
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "저장 중..." : "저장"}
            </Button>
          </div>
        </form>
      )}

      {meetings.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-5 py-8 text-center text-sm text-slate-500">
          등록된 회의록이 없습니다. 첫 회의록을 등록해 주세요.
        </p>
      ) : (
        <ul className="flex flex-col gap-3" role="list">
          {meetings.map((meeting) => (
            <li
              key={meeting.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-card sm:p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 sm:text-base">{meeting.subject}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatDate(meeting.metAt)}
                    {meeting.startTime && ` · ${meeting.startTime.slice(0, 5)}`}
                    {meeting.endTime && `~${meeting.endTime.slice(0, 5)}`}
                    {meeting.location && ` · ${meeting.location}`}
                    {meeting.authorName && ` · 작성 ${meeting.authorName}`}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(meeting.id)} disabled={saving}>
                    수정
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => void handleDelete(meeting.id)}
                    disabled={saving}
                  >
                    삭제
                  </Button>
                </div>
              </div>
              {meeting.content && (
                <p className="mt-3 whitespace-pre-wrap border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-700">
                  {meeting.content}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
