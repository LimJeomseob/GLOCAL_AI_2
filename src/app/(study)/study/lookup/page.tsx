"use client";

import { StudyGroupGate } from "@/components/study/StudyGroupGate";
import { StudyGroupSummary } from "@/components/study/StudyGroupSummary";

/**
 * 탭 6. 내 연구모임.
 * 로그인 없이 대표자 성명+연락처로 팀의 진행 상태와 다음 할 일을 확인한다.
 */
export default function StudyLookupPage() {
  return (
    <StudyGroupGate
      title="내 연구모임"
      description="대표자 성명과 연락처로 연구모임의 진행 상태, 제출 현황, 다음 할 일을 확인할 수 있습니다."
    >
      {({ group }) => <StudyGroupSummary group={group} />}
    </StudyGroupGate>
  );
}
