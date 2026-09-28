"use client";

import { CoachingSchedulePanel } from "@/components/study/CoachingSchedulePanel";
import { canSubmitOperationDocs, submitStudy } from "@/lib/studyApi";
import type { StudyCoachingProposalInput } from "@/lib/studyValidation";
import type { StudyIdentity, StudyLookupResult } from "@/lib/studyTypes";

/**
 * 팀(대표자)의 코칭 일정 화면.
 *
 * 배정된 전문가와 코칭 3회(기획·제작·환류)의 일시·장소를 잡는다.
 * 팀이 제안하면 전문가가 가능/불가로 회신하고, 어느 한쪽이 확정한다.
 */
export function CoachingScheduleView({
  group,
  identity,
  refresh,
}: {
  group: StudyLookupResult;
  identity: StudyIdentity;
  refresh: () => Promise<void>;
}) {
  const open = canSubmitOperationDocs(group.status);

  if (!group.expert) {
    return (
      <div
        role="status"
        className="rounded-xl border border-slate-300 bg-slate-50 px-5 py-4 text-sm leading-relaxed text-slate-700"
      >
        아직 전문가가 배정되지 않았습니다. AI융합원이 배정하면 이 화면에서 코칭 3회(기획·제작·환류)
        일정을 잡을 수 있습니다.
      </div>
    );
  }

  /** 저장 후 조회를 다시 읽어 화면을 갱신한다(회의록 폼과 같은 방식). */
  async function send(payload: Record<string, unknown>): Promise<string | null> {
    const { error } = await submitStudy({
      groupId: group.groupId,
      ...identity,
      ...payload,
    });
    if (error) return error;
    await refresh();
    return null;
  }

  return (
    <CoachingSchedulePanel
      actor="팀"
      counterpart={{
        label: "배정 전문가",
        name: group.expert.name,
        detail: [group.expert.affiliation, group.expert.position, group.expert.email]
          .filter(Boolean)
          .join(" · "),
      }}
      sessions={group.coachingSessions}
      memos={group.coachingMemos}
      editable={open}
      readOnlyNotice={
        open
          ? null
          : group.status === "report_submitted" || group.status === "completed"
            ? "운영이 종료되어 코칭 일정을 더 이상 변경할 수 없습니다."
            : "선발된 연구모임만 코칭 일정을 잡을 수 있습니다."
      }
      onPropose={(input: StudyCoachingProposalInput) => send({ kind: "coaching-propose", ...input })}
      onConfirm={(sessionId) => send({ kind: "coaching-confirm", sessionId })}
      onDelete={(sessionId) => send({ kind: "coaching-delete", sessionId })}
      onMemo={(body) => send({ kind: "coaching-memo", body })}
    />
  );
}
