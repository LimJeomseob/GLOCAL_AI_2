"use client";

import { useId, useState } from "react";
import clsx from "clsx";
import { FormField } from "./FormField";
import { Modal } from "./Modal";
import { Button } from "./Button";

interface LongTextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
  hint?: string;
  /** 배점 연계 안내 — 신청자가 어디에 힘을 쏟아야 하는지 알고 쓰게 한다. */
  scoreNote?: string;
  /**
   * 근거문서의 작성 예시. placeholder로 흐리게 깔리므로 입력을 시작하면 사라지고
   * 저장값에 절대 섞이지 않는다. 전문을 보고 싶으면 "작성 예시 보기"로 모달을 연다.
   */
  example?: string;
  rows?: number;
  disabled?: boolean;
}

/**
 * 장문 입력 필드. 계획서·결과보고서처럼 "예시를 보면서 길게 쓰는" 항목 전용이다.
 * 글자 수는 공백을 제외하고 센다(서식의 분량 기준을 글자 수로 환산했기 때문).
 */
export function LongTextField({
  label,
  value,
  onChange,
  required,
  error,
  hint,
  scoreNote,
  example,
  rows = 8,
  disabled,
}: LongTextFieldProps) {
  const [exampleOpen, setExampleOpen] = useState(false);
  const titleId = useId();
  const charCount = value.replace(/\s/g, "").length;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {scoreNote && (
          <span className="inline-flex items-center rounded-full bg-brand/5 px-2.5 py-0.5 text-xs font-semibold text-brand">
            {scoreNote}
          </span>
        )}
        {example && (
          <button
            type="button"
            onClick={() => setExampleOpen(true)}
            className="ml-auto text-xs font-semibold text-accent underline underline-offset-2 hover:text-brand"
          >
            작성 예시 보기
          </button>
        )}
      </div>

      <FormField label={label} required={required} error={error} hint={hint}>
        {(inputProps) => (
          <textarea
            {...inputProps}
            rows={rows}
            disabled={disabled}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={example}
            className={clsx(
              "w-full resize-y rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-900",
              // 예시는 입력값과 확실히 구분되도록 본문보다 흐리게 깐다
              "placeholder:text-slate-300",
              "focus:border-accent disabled:bg-slate-100 disabled:text-slate-400 sm:text-base"
            )}
          />
        )}
      </FormField>

      <p className="text-right text-xs tabular-nums text-slate-400">
        공백 제외 {charCount.toLocaleString()}자
      </p>

      {example && (
        <Modal open={exampleOpen} onClose={() => setExampleOpen(false)} titleId={titleId}>
          <h2 id={titleId} className="text-lg font-bold text-brand">
            작성 예시 — {label}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            운영 계획(안)에 실린 예시입니다. 그대로 옮겨 쓰지 마시고 형식만 참고해 주세요.
          </p>
          <pre className="mt-4 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
            {example}
          </pre>
          <div className="mt-6 flex justify-end">
            <Button variant="outline" onClick={() => setExampleOpen(false)}>
              닫기
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
