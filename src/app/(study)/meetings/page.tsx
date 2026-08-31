"use client";

import { StudyGroupGate } from "@/components/study/StudyGroupGate";
import { MeetingLogForm } from "@/components/study/MeetingLogForm";

/** 탭 4. 회의록 — [서식 3] (근거문서 13페이지) */
export default function StudyMeetingsPage() {
  return (
    <StudyGroupGate
      title="회의록"
      description="[서식 3] 회의록입니다. 운영 기간 중 여러 번 등록할 수 있으며, 결과보고서의 첨부서류로 자동 연결됩니다."
    >
      {({ group, identity, refresh }) => (
        <MeetingLogForm group={group} identity={identity} refresh={refresh} />
      )}
    </StudyGroupGate>
  );
}
