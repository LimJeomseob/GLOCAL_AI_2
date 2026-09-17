"use client";

import { useState } from "react";
import { StudyApplyForm, buildApplyInitialValues } from "@/components/study/StudyApplyForm";
import { StudyGroupGate } from "@/components/study/StudyGroupGate";
import { StudyGroupSummary } from "@/components/study/StudyGroupSummary";
import { canEditStudyApplication, toStudyApplyRoundInfo } from "@/lib/studyApi";
import type { StudyIdentity, StudyLookupResult } from "@/lib/studyTypes";

/**
 * 조회 결과 본문 — 요약 화면과 신청서 수정 화면을 오간다.
 * 게이트의 모임 선택이 바뀌면 key로 다시 마운트되어 수정 상태가 남지 않는다.
 */
function StudyLookupBody({
  group,
  identity,
  refresh,
}: {
  group: StudyLookupResult;
  identity: StudyIdentity;
  refresh: (nextIdentity?: StudyIdentity) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // 회차 정보가 없으면 신청 구간을 판정할 수 없으므로 수정을 열지 않는다.
  const canEdit = canEditStudyApplication(group.status) && Boolean(group.round);

  if (editing && group.round) {
    return (
      <StudyApplyForm
        mode="edit"
        round={toStudyApplyRoundInfo(group.round)}
        groupId={group.groupId}
        identity={identity}
        initial={buildApplyInitialValues(group, identity)}
        onSaved={async (next) => {
          // 성명·연락처가 바뀌었을 수 있으므로 새 신원으로 다시 조회한다.
          await refresh(next);
          setEditing(false);
          setNotice("신청서를 수정했습니다.");
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <StudyGroupSummary
      group={group}
      notice={notice}
      onEditApplication={
        canEdit
          ? () => {
              setNotice(null);
              setEditing(true);
            }
          : undefined
      }
    />
  );
}

/**
 * 탭 6. 내 연구모임.
 * 로그인 없이 대표자 성명+연락처로 팀의 진행 상태와 다음 할 일을 확인하고,
 * 심사 착수 전이면 신청서 내용을 직접 수정한다.
 */
export default function StudyLookupPage() {
  return (
    <StudyGroupGate
      title="내 연구모임"
      description="대표자 성명과 연락처로 연구모임의 진행 상태, 제출 현황, 다음 할 일을 확인하고 신청서를 수정할 수 있습니다."
    >
      {({ group, identity, refresh }) => (
        <StudyLookupBody
          key={group.groupId}
          group={group}
          identity={identity}
          refresh={refresh}
        />
      )}
    </StudyGroupGate>
  );
}
