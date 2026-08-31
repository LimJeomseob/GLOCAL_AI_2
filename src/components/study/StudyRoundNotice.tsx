"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/format";
import {
  deriveStudyRoundWindow,
  fetchActiveStudyRound,
  fetchStudyRoundStats,
  type StudyRoundStats,
} from "@/lib/studyApi";
import type { StudyRound } from "@/lib/studyTypes";

/**
 * 사업안내 탭 상단의 라이브 상태 배너.
 *
 * 사업안내 본문은 정적으로 렌더링하되, 신청 구간과 접수 현황만 이 작은 클라이언트
 * 아일랜드에서 DB를 읽어 표시한다(정적 export이므로 서버 렌더 시점 값은 신뢰할 수 없다).
 * 조회에 실패해도 안내 본문은 그대로 읽을 수 있어야 하므로 배너만 조용히 접는다.
 */
export function StudyRoundNotice() {
  const [round, setRound] = useState<StudyRound | null>(null);
  const [stats, setStats] = useState<StudyRoundStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const data = await fetchActiveStudyRound();
        if (!active) return;
        setRound(data);

        if (data) {
          const s = await fetchStudyRoundStats(data.id);
          if (active) setStats(s);
        }
      } catch {
        // 배너만 숨기고 안내 본문은 그대로 노출한다.
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
      <div role="status" className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500">
        모집 현황을 불러오는 중...
      </div>
    );
  }

  if (!round) return null;

  const window_ = deriveStudyRoundWindow(round);

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">신청기간</p>
          <p className="mt-1 text-sm font-bold text-slate-800 sm:text-base">
            {formatDateTime(round.apply_open_at)} ~ {formatDateTime(round.apply_close_at)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {window_.isNotYetOpen
              ? "아직 신청 기간이 아닙니다."
              : window_.isClosed
              ? "신청이 마감되었습니다."
              : "지금 신청할 수 있습니다."}
            {stats && ` · 현재 ${stats.submittedCount}개 팀 접수 · 선발 ${round.max_teams}개 팀`}
          </p>
        </div>

        <Link href="/study/apply">
          <Button variant="primary" size="lg" disabled={!window_.isOpen}>
            {window_.isOpen ? "연구모임 신청하기" : window_.isNotYetOpen ? "신청 예정" : "신청 마감"}
          </Button>
        </Link>
      </div>
    </div>
  );
}
