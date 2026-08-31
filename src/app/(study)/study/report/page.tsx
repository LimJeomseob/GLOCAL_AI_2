"use client";

import { StudyGroupGate } from "@/components/study/StudyGroupGate";
import { StudyReportForm } from "@/components/study/StudyReportForm";

/** 탭 5. 결과보고서 — [서식 2] (근거문서 11~12페이지) */
export default function StudyReportPage() {
  return (
    <StudyGroupGate
      title="결과보고서"
      description="[서식 2] 결과보고서입니다. 표지는 신청서에서 자동 승계되며, 본문 5개 항목과 산출물을 작성해 제출합니다."
    >
      {({ group, identity, refresh }) => (
        <StudyReportForm group={group} identity={identity} refresh={refresh} />
      )}
    </StudyGroupGate>
  );
}
