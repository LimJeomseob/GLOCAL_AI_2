"use client";

import { StudyGroupGate } from "@/components/study/StudyGroupGate";
import { StudyPlanForm } from "@/components/study/StudyPlanForm";

/** 탭 3. 연구계획서 — [서식 1] 계획서 (근거문서 8페이지, 작성 예시 9~10페이지) */
export default function StudyPlanPage() {
  return (
    <StudyGroupGate
      title="연구계획서"
      description="[서식 1] 계획서 5개 항목입니다. 심사 100점 중 80점이 이 내용에서 결정됩니다."
    >
      {({ group, identity, refresh }) => (
        <StudyPlanForm group={group} identity={identity} refresh={refresh} />
      )}
    </StudyGroupGate>
  );
}
