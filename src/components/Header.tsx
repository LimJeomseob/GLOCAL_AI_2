import Link from "next/link";
import { PROGRAM_NAME } from "@/lib/constants";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-3 rounded"
          aria-label="경상국립대학교 글로컬 AI 동행 포털 홈으로 이동"
        >
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand text-sm font-bold text-white"
          >
            GNU
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-xs font-medium text-slate-500">
              경상국립대학교 글로컬대학30
            </span>
            <span className="text-sm font-bold text-brand sm:text-base">
              {PROGRAM_NAME}
            </span>
          </span>
        </Link>
        <nav className="flex shrink-0 items-center gap-1" aria-label="사업 전환">
          {/* 특강(트랙 A)과 연구모임(트랙 B)은 탭이 분리되어 있어, 헤더에서 서로 오갈 수 있게 한다. */}
          <Link
            href="/study"
            className="rounded-lg px-3 py-1.5 text-sm font-bold text-brand transition-colors hover:bg-brand/5"
          >
            AI 활용 연구모임
          </Link>
          <Link
            href="/admin/login"
            className="rounded-lg px-3 py-1.5 text-sm font-bold text-brand transition-colors hover:bg-brand/5"
            aria-label="관리자 화면으로 이동"
          >
            관리자
          </Link>
        </nav>
      </div>
    </header>
  );
}
