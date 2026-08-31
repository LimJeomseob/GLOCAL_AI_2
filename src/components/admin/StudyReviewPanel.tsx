"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { inputBaseClass } from "@/components/ui/FormField";
import { StudyStatusBadge } from "@/components/study/StudyStatusBadge";
import { formatDateTime } from "@/lib/format";
import {
  fetchPriorParticipation,
  fetchStudyGroups,
  fetchStudyReviews,
  saveStudyReview,
  type PriorParticipation,
} from "@/lib/studyAdmin";
import type { StudyGroupWithRelations, StudyReview, StudyRound } from "@/lib/studyTypes";
import { fetchStudyRounds } from "@/lib/studyAdmin";

/** 심사 대상 상태 — 제출 이후 확정 전까지 */
const REVIEWABLE = new Set(["submitted", "under_review", "selected", "rejected"]);

/**
 * 관리자 탭 B. 계획서 심사.
 *
 * 좌측에 계획서 전문, 우측에 9개 지표 채점 패널을 놓는다. 총점은 DB 트리거가 계산하므로
 * 화면의 합계는 어디까지나 미리보기다.
 *
 * 심사기준 1번(프로그램 참여·이수 이력)은 기존 특강 신청 데이터(applications)를 조회해
 * "참여 N건 / 이수 N건" 근거를 자동 제시한다 — 심사위원이 명단을 손으로 대조하지 않아도 된다.
 * 다만 점수는 자동으로 채우지 않는다. 판단은 사람이 한다.
 */
export function StudyReviewPanel({ reviewerEmail }: { reviewerEmail: string }) {
  const [rounds, setRounds] = useState<StudyRound[]>([]);
  const [roundId, setRoundId] = useState("");
  const [groups, setGroups] = useState<StudyGroupWithRelations[]>([]);
  const [reviews, setReviews] = useState<StudyReview[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [prior, setPrior] = useState<PriorParticipation | null>(null);
  const [priorLoading, setPriorLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await fetchStudyRounds();
        if (!active) return;
        setRounds(data);
        setRoundId((prev) => prev || data[0]?.id || "");
        if (data.length === 0) setLoading(false);
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : "모집회차를 불러오지 못했습니다.");
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const all = await fetchStudyGroups(id);
      const reviewable = all.filter((g) => REVIEWABLE.has(g.status));
      setGroups(reviewable);
      setReviews(await fetchStudyReviews(reviewable.map((g) => g.id)));
      setSelectedId((prev) => (prev && reviewable.some((g) => g.id === prev) ? prev : reviewable[0]?.id ?? null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "심사 대상을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (roundId) void load(roundId);
  }, [roundId, load]);

  const round = rounds.find((r) => r.id === roundId) ?? null;
  const criteria = useMemo(
    () => (round?.criteria ?? []).slice().sort((a, b) => a.sort - b.sort),
    [round]
  );
  const selected = groups.find((g) => g.id === selectedId) ?? null;
  const myReview = reviews.find((r) => r.group_id === selectedId && r.reviewer_email === reviewerEmail) ?? null;

  // 선택한 팀이 바뀌면 내 기존 채점을 불러오고, 참여 이력 근거를 새로 조회한다.
  useEffect(() => {
    setScores(myReview?.scores ?? {});
    setComment(myReview?.comment ?? "");
    setNotice(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    if (!selected) {
      setPrior(null);
      return;
    }
    let active = true;
    setPriorLoading(true);
    (async () => {
      const data = await fetchPriorParticipation(
        selected.leader_name,
        selected.leader_id_number,
        selected.leader_phone
      );
      if (active) {
        setPrior(data);
        setPriorLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [selected]);

  const previewTotal = criteria.reduce((sum, c) => sum + (Number(scores[c.code]) || 0), 0);
  const maxTotal = criteria.reduce((sum, c) => sum + c.max, 0);

  async function handleSave(submit: boolean) {
    if (!selected) return;
    setSaving(true);
    setError(null);
    setNotice(null);

    const message = await saveStudyReview({
      groupId: selected.id,
      reviewerEmail,
      scores,
      comment,
      submit,
    });
    setSaving(false);

    if (message) {
      setError(message);
      return;
    }
    setNotice(submit ? "채점을 제출했습니다." : "임시저장했습니다.");
    if (roundId) {
      setReviews(await fetchStudyReviews(groups.map((g) => g.id)));
    }
  }

  if (loading) {
    return (
      <p role="status" className="py-10 text-center text-sm text-slate-500">
        불러오는 중...
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-brand sm:text-2xl">계획서 심사</h1>
          <p className="mt-1 text-sm text-slate-600">
            심사위원 {reviewerEmail} · 다른 심사위원의 점수는 보이지 않습니다.
          </p>
        </div>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          모집회차
          <select className={inputBaseClass} value={roundId} onChange={(e) => setRoundId(e.target.value)}>
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {notice}
        </p>
      )}

      {groups.length === 0 ? (
        <p role="status" className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          심사 대상 연구모임이 없습니다. (제출 완료된 팀만 표시됩니다)
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* 심사 대상 목록 */}
          <aside className="rounded-xl border border-slate-200 bg-white">
            <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-800">
              심사 대상 ({groups.length})
            </h2>
            <ul className="max-h-[70vh] overflow-y-auto" role="list">
              {groups.map((g) => {
                const done = reviews.some(
                  (r) => r.group_id === g.id && r.reviewer_email === reviewerEmail && r.submitted_at
                );
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(g.id)}
                      aria-current={g.id === selectedId ? "true" : undefined}
                      className={
                        g.id === selectedId
                          ? "w-full border-l-4 border-accent bg-brand/5 px-4 py-3 text-left"
                          : "w-full border-l-4 border-transparent px-4 py-3 text-left hover:bg-slate-50"
                      }
                    >
                      <span className="block font-mono text-xs text-slate-500">{g.code}</span>
                      <span className="mt-0.5 block text-sm font-semibold text-slate-800">{g.name}</span>
                      <span className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                        [{g.category}]
                        {done && (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-800">
                            채점완료
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* 계획서 + 채점 */}
          {selected && (
            <div className="grid gap-5 xl:grid-cols-2">
              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-slate-500">{selected.code}</span>
                  <StudyStatusBadge status={selected.status} />
                </div>
                <h2 className="mt-2 text-lg font-bold text-brand">{selected.name}</h2>
                <p className="mt-1 text-sm font-medium text-slate-700">
                  [{selected.category}] {selected.topic}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  대표자 {selected.leader_name} ({selected.leader_affiliation} ·{" "}
                  {selected.leader_position}) · 참여 {selected.member_count}명
                  {selected.is_multi_dept && (
                    <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">
                      복수 학과 가산점 대상
                    </span>
                  )}
                </p>

                {/* 심사기준 1번 자동 채점 보조 */}
                <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
                  <h3 className="text-xs font-bold text-sky-900">
                    심사기준 1번 근거 — AI융합원 프로그램 참여·이수 이력
                  </h3>
                  {priorLoading ? (
                    <p className="mt-1 text-xs text-sky-800">조회 중...</p>
                  ) : prior ? (
                    <>
                      <p className="mt-1 text-sm font-semibold text-sky-900">
                        참여 {prior.applied_count}건 · 이수 {prior.completed_count}건
                      </p>
                      {prior.programs.length > 0 && (
                        <p className="mt-1 text-xs leading-relaxed text-sky-800">
                          {prior.programs.join(" / ")}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-sky-700">
                        대표자 기준 조회 결과이며, <strong>[수기]</strong> 표시는 관리자가 대장에
                        등록한 건입니다. 점수는 심사위원이 직접 입력해 주세요.
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-xs text-sky-800">
                      조회된 이력이 없습니다. 시스템에 기록이 없는 과거 프로그램 이력은 관리자가
                      「참여이력 관리」에 등록하면 여기에 함께 표시됩니다.
                    </p>
                  )}
                </div>

                <h3 className="mt-5 text-sm font-bold text-slate-800">연구계획서</h3>
                {selected.plan ? (
                  <div className="mt-2 max-h-[50vh] space-y-4 overflow-y-auto pr-2">
                    {[
                      ["1. 연구모임의 주제", selected.plan.section1_topic],
                      ["2. 목적 및 필요성", selected.plan.section2_purpose],
                      ["3. AI 플랫폼 활용 계획", selected.plan.section3_platform],
                      ["4. 기대효과 및 결과 활용방안", selected.plan.section4_effect],
                      ["5. 기타 (워크숍 요청 시기 등)", selected.plan.section5_etc],
                    ].map(([title, body]) => (
                      <div key={title}>
                        <p className="text-xs font-semibold text-slate-500">{title}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                          {body || "(작성 없음)"}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">작성된 계획서가 없습니다.</p>
                )}
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-bold text-slate-800">채점</h2>
                  <span className="text-sm">
                    <strong className="tabular-nums text-brand">{previewTotal}</strong>
                    <span className="text-slate-400"> / {maxTotal}점</span>
                  </span>
                </div>

                <div className="mt-4 flex flex-col gap-3">
                  {criteria.map((criterion, index) => {
                    const isFirstOfGroup = index === 0 || criteria[index - 1].no !== criterion.no;
                    return (
                      <div key={criterion.code}>
                        {isFirstOfGroup && (
                          <p className="mt-2 text-xs font-bold text-slate-500">
                            {criterion.no}. {criterion.group}
                          </p>
                        )}
                        <label className="mt-1 flex items-center gap-3 text-sm">
                          <span className="flex-1 leading-snug text-slate-700">{criterion.label}</span>
                          <input
                            type="number"
                            min={0}
                            max={criterion.max}
                            step={1}
                            aria-label={`${criterion.label} 점수 (최대 ${criterion.max}점)`}
                            className="w-20 rounded border border-slate-300 px-2 py-1 text-right tabular-nums"
                            value={scores[criterion.code] ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setScores((prev) => {
                                if (raw === "") {
                                  const next = { ...prev };
                                  delete next[criterion.code];
                                  return next;
                                }
                                // 상한은 DB 트리거가 다시 검증하지만, 화면에서 미리 잘라 준다.
                                const value = Math.max(0, Math.min(criterion.max, Number(raw)));
                                return { ...prev, [criterion.code]: value };
                              });
                            }}
                          />
                          <span className="w-10 shrink-0 text-right text-xs text-slate-400">
                            /{criterion.max}
                          </span>
                        </label>
                      </div>
                    );
                  })}
                </div>

                <label className="mt-5 flex flex-col gap-1 text-sm font-semibold text-slate-700">
                  심사 의견
                  <textarea
                    rows={4}
                    className={`${inputBaseClass} resize-y font-normal`}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </label>

                {myReview?.submitted_at && (
                  <p className="mt-3 text-xs text-emerald-700">
                    제출 완료 · {formatDateTime(myReview.submitted_at)} (다시 제출하면 갱신됩니다)
                  </p>
                )}

                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <Button variant="outline" onClick={() => void handleSave(false)} disabled={saving}>
                    임시저장
                  </Button>
                  <Button
                    variant="primary"
                    className="sm:flex-1"
                    onClick={() => void handleSave(true)}
                    disabled={saving}
                  >
                    {saving ? "저장 중..." : "채점 제출"}
                  </Button>
                </div>
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
