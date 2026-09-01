"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StudyApplyForm } from "@/components/study/StudyApplyForm";
import { StudyEthicsGate } from "@/components/study/StudyEthicsGate";
import { fetchActiveStudyRound } from "@/lib/studyApi";
import type { StudyEthicsPledge } from "@/lib/studyValidation";
import type { StudyRound } from "@/lib/studyTypes";

/** 탭 2. 연구모임 신청 — 윤리교육 게이트 → [서식 1] 신청서 (근거문서 7페이지) */
export default function StudyApplyPage() {
  const [round, setRound] = useState<StudyRound | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // null이면 윤리교육 미이수 — 게이트를 먼저 보여준다. 페이지 state로 들고 있어
  // 신청서 단계에서 되돌아와도 작성한 다짐이 유지된다.
  const [ethicsPledges, setEthicsPledges] = useState<StudyEthicsPledge[] | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const data = await fetchActiveStudyRound();
        if (!active) return;
        setRound(data);
      } catch {
        if (active) setError("모집 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <p role="status" className="py-12 text-center text-sm text-slate-500">
        모집 정보를 불러오는 중...
      </p>
    );
  }

  if (error) {
    return (
      <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
        {error}
      </p>
    );
  }

  if (!round) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-card sm:p-10">
        <h1 className="text-xl font-bold text-brand">현재 모집 중인 연구모임이 없습니다</h1>
        <p className="mt-3 text-sm text-slate-600">
          다음 모집 일정은 사업안내에서 확인해 주세요.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block font-semibold text-accent underline underline-offset-2"
        >
          사업안내로 이동
        </Link>
      </div>
    );
  }

  if (ethicsPledges === null) {
    return <StudyEthicsGate onComplete={setEthicsPledges} />;
  }

  return <StudyApplyForm round={round} ethicsPledges={ethicsPledges} />;
}
