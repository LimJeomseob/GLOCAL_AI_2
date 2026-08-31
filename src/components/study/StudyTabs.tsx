"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

/**
 * 연구모임(트랙 B) 탭. 운영계획(안)의 5단계 흐름을 그대로 탭 순서로 옮겼다.
 * 신청자는 왼쪽에서 오른쪽으로 따라가기만 하면 사업 절차를 완주한다.
 * 특강 트랙(PortalTabs)과 섞이지 않도록 별도 nav로 둔다.
 */
const STUDY_TABS = [
  { href: "/", label: "사업안내" },
  { href: "/apply", label: "연구모임 신청" },
  { href: "/plan", label: "연구계획서" },
  { href: "/meetings", label: "회의록" },
  { href: "/report", label: "결과보고서" },
  { href: "/lookup", label: "내 연구모임" },
];

export function StudyTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="연구모임 탭 메뉴" className="border-b border-slate-200 bg-white">
      <ul className="mx-auto flex max-w-5xl overflow-x-auto px-2 sm:px-6" role="list">
        {STUDY_TABS.map((tab) => {
          // "/"는 정확히 일치할 때만 활성 — 하위 탭에서 함께 켜지지 않게 한다.
          const isActive = tab.href === "/" ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={clsx(
                  "block whitespace-nowrap border-b-[3px] px-4 py-3 text-sm font-semibold transition-colors sm:text-base",
                  isActive
                    ? "border-accent text-brand"
                    : "border-transparent text-slate-500 hover:text-brand"
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
