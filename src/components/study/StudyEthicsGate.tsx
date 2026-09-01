"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { inputBaseClass } from "@/components/ui/FormField";
import {
  STUDY_ETHICS_MIN_PLEDGES,
  STUDY_ETHICS_PRINCIPLES,
  STUDY_ETHICS_VIDEO_ID,
  STUDY_ETHICS_VIDEO_URL,
} from "@/lib/studyGroupConstants";
import { studyEthicsPledgeSchema } from "@/lib/studyValidation";
import type { StudyEthicsPledge } from "@/lib/studyValidation";

interface StudyEthicsGateProps {
  /** 이전에 작성하다 신청서 단계에서 되돌아온 경우의 초기값 */
  initialPledges?: StudyEthicsPledge[];
  onComplete: (pledges: StudyEthicsPledge[]) => void;
}

/**
 * 신청 위저드 0단계 — AI 윤리교육 게이트.
 *
 * GNU 생성형 AI 윤리 가이드라인 영상을 시청하고, 8대 핵심원칙 중 3개 이상을 골라
 * 실천 다짐을 작성해야 신청서([서식 1]) 화면으로 넘어간다. 작성값은 신청서와 함께
 * study-submit으로 전송되어 study_groups.ethics_pledges에 저장된다.
 */
export function StudyEthicsGate({ initialPledges, onComplete }: StudyEthicsGateProps) {
  // 원칙 번호 → 다짐 텍스트. 키의 존재 여부가 "선택됨"이다.
  const [pledges, setPledges] = useState<Map<number, string>>(
    () => new Map((initialPledges ?? []).map((p) => [p.no, p.pledge]))
  );
  const [watched, setWatched] = useState(Boolean(initialPledges?.length));
  const [errors, setErrors] = useState<{ watched?: string; pledges?: string } & Record<number, string>>({});

  function togglePrinciple(no: number, checked: boolean) {
    setPledges((prev) => {
      const next = new Map(prev);
      if (checked) next.set(no, next.get(no) ?? "");
      else next.delete(no);
      return next;
    });
  }

  function updatePledge(no: number, value: string) {
    setPledges((prev) => new Map(prev).set(no, value));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const nextErrors: typeof errors = {};
    if (!watched) {
      nextErrors.watched = "영상 시청 확인에 체크해 주세요.";
    }
    if (pledges.size < STUDY_ETHICS_MIN_PLEDGES) {
      nextErrors.pledges = `8대 핵심원칙 중 ${STUDY_ETHICS_MIN_PLEDGES}개 이상을 선택해 실천 다짐을 작성해 주세요. (현재 ${pledges.size}개 선택)`;
    }

    const result: StudyEthicsPledge[] = [];
    for (const principle of STUDY_ETHICS_PRINCIPLES) {
      if (!pledges.has(principle.no)) continue;
      const parsed = studyEthicsPledgeSchema.safeParse({
        no: principle.no,
        title: principle.title,
        pledge: pledges.get(principle.no) ?? "",
      });
      if (!parsed.success) {
        nextErrors[principle.no] = parsed.error.issues[0].message;
      } else {
        result.push(parsed.data);
      }
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onComplete(result);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-brand sm:text-2xl">AI 윤리교육 (필수)</h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          연구모임 신청 전에 GNU 생성형 AI 윤리 가이드라인 교육을 이수해야 합니다. 아래 영상을
          시청한 뒤, 8대 핵심원칙 중 <strong>{STUDY_ETHICS_MIN_PLEDGES}개 이상</strong>을 선택해
          연구모임 활동에서의 실천 다짐을 작성해 주세요.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-8">
        <h2 className="text-sm font-bold text-slate-800">
          교육 영상 · GNU 생성형 AI 윤리 가이드라인 8대 핵심 원칙
        </h2>
        <div className="mt-3 aspect-video w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
          <iframe
            className="h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${STUDY_ETHICS_VIDEO_ID}`}
            title="GNU 생성형 AI 윤리 가이드라인 8대 핵심 원칙"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          영상이 재생되지 않으면{" "}
          <a
            href={STUDY_ETHICS_VIDEO_URL}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-accent underline underline-offset-2"
          >
            YouTube에서 바로 보기
          </a>
          를 이용해 주세요.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-8"
      >
        <div>
          <h2 className="text-sm font-bold text-slate-800">
            8대 핵심원칙 실천 다짐 ({pledges.size}개 선택 / 최소 {STUDY_ETHICS_MIN_PLEDGES}개)
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            영상에서 안내한 원칙 중 연구모임 활동에 특히 적용하고 싶은 원칙을 고르고, 어떻게
            실천할지 구체적으로 작성해 주세요. (원칙당 10자 이상)
          </p>
        </div>

        <ul className="flex flex-col gap-3">
          {STUDY_ETHICS_PRINCIPLES.map((principle) => {
            const selected = pledges.has(principle.no);
            const checkboxId = `ethics-principle-${principle.no}`;
            const pledgeId = `ethics-pledge-${principle.no}`;
            const pledgeError = errors[principle.no];
            return (
              <li
                key={principle.no}
                className={`rounded-xl border p-4 transition-colors ${
                  selected ? "border-brand/40 bg-brand/5" : "border-slate-200 bg-slate-50"
                }`}
              >
                <label htmlFor={checkboxId} className="flex items-start gap-3">
                  <input
                    id={checkboxId}
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-accent focus:ring-accent"
                    checked={selected}
                    onChange={(e) => togglePrinciple(principle.no, e.target.checked)}
                  />
                  <span>
                    <span className="text-sm font-semibold text-slate-800">
                      {principle.no}. {principle.title}
                    </span>
                    <ul className="mt-1 space-y-0.5 text-xs leading-relaxed text-slate-500">
                      {principle.points.map((point) => (
                        <li key={point}>· {point}</li>
                      ))}
                    </ul>
                  </span>
                </label>

                {selected && (
                  <div className="mt-3 pl-7">
                    <label htmlFor={pledgeId} className="text-xs font-semibold text-slate-700">
                      실천 다짐 <span className="text-red-600" aria-hidden="true">*</span>
                    </label>
                    <textarea
                      id={pledgeId}
                      className={`${inputBaseClass} mt-1 min-h-[72px] resize-y`}
                      value={pledges.get(principle.no) ?? ""}
                      placeholder="예: 연구모임에서 생성형 AI 결과물을 공유하기 전에 반드시 출처와 정확성을 함께 검토하겠습니다."
                      aria-invalid={Boolean(pledgeError)}
                      onChange={(e) => updatePledge(principle.no, e.target.value)}
                    />
                    {pledgeError && (
                      <p role="alert" className="mt-1 text-xs font-medium text-red-600">
                        {pledgeError}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {errors.pledges && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {errors.pledges}
          </p>
        )}

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <label htmlFor="ethics-watched" className="flex items-start gap-2 text-sm font-medium text-slate-800">
            <input
              id="ethics-watched"
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-accent focus:ring-accent"
              checked={watched}
              onChange={(e) => setWatched(e.target.checked)}
            />
            <span>
              GNU 생성형 AI 윤리 가이드라인 교육 영상을 시청하였으며, 연구모임 활동에서 위
              원칙을 준수하겠습니다. (필수)
            </span>
          </label>
          {errors.watched && (
            <p role="alert" className="mt-2 text-xs font-medium text-red-600">
              {errors.watched}
            </p>
          )}
        </div>

        <Button type="submit" variant="primary" size="lg" className="w-full">
          윤리교육 완료하고 신청서 작성하기
        </Button>
      </form>
    </div>
  );
}
