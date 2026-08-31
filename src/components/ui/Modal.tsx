"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  titleId: string;
  /** 긴 본문을 읽는 용도면 "wide". 기본값은 확인창용 좁은 폭. */
  size?: "default" | "wide";
  /**
   * 인쇄 시 이 모달만 남기고 페이지의 나머지를 숨긴다(globals.css의 @media print 규칙).
   * 포털이 document.body 직계로 붙는 덕에 선택자가 단순해진다.
   */
  printable?: boolean;
  children: React.ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** 접근성 모달: 배경 딤드, ESC/배경클릭 닫힘, 포커스 트랩, 모바일 전체화면 */
export function Modal({
  open,
  onClose,
  titleId,
  size = "default",
  printable = false,
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    lastFocusedRef.current = document.activeElement as HTMLElement;
    const dialogEl = dialogRef.current;
    const focusables = dialogEl?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusables?.[0] ?? dialogEl)?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogEl) return;

      const nodes = Array.from(dialogEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      lastFocusedRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-0 sm:p-6"
      data-print-root={printable ? "" : undefined}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={clsx(
          "h-full w-full overflow-y-auto bg-white p-6 shadow-xl focus:outline-none sm:h-auto sm:max-h-[85vh] sm:rounded-2xl sm:p-8",
          size === "wide" ? "sm:max-w-3xl" : "sm:max-w-lg"
        )}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
