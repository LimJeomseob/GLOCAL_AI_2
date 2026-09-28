"use client";

import { StudyGroupGate } from "@/components/study/StudyGroupGate";
import { CoachingScheduleView } from "@/components/study/CoachingScheduleView";

/** 탭 5. 코칭 일정 — 배정 전문가와 코칭 3회(기획·제작·환류)의 일시·장소를 조율한다. */
export default function StudyCoachingPage() {
  return (
    <StudyGroupGate
      title="코칭 일정"
      description="배정된 교내 AI활용 전문가와 코칭 3회(기획·제작·환류)의 일시·장소를 조율합니다."
    >
      {({ group, identity, refresh }) => (
        <CoachingScheduleView group={group} identity={identity} refresh={refresh} />
      )}
    </StudyGroupGate>
  );
}
