"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import type { AdminRole } from "@/lib/types";

/**
 * 관리자 탭.
 * 심사위원(reviewer)은 is_admin()에서 제외되어 특강 신청자·설문 데이터를 볼 수 없으므로,
 * 열어 봐야 빈 화면이 되는 탭은 아예 감춘다.
 */
const ADMIN_TABS: { href: string; label: string; roles?: AdminRole[] }[] = [
  { href: "/admin/applicants", label: "신청자 관리", roles: ["admin", "superadmin"] },
  { href: "/admin/survey", label: "만족도 설문결과", roles: ["admin", "superadmin"] },
  { href: "/admin/study-groups", label: "연구모임 관리", roles: ["admin", "superadmin"] },
  { href: "/admin/study-review", label: "계획서 심사" },
  { href: "/admin/study-progress", label: "연구모임 운영현황", roles: ["admin", "superadmin"] },
  // 심사기준 1번의 근거 대장. 심사위원은 심사 화면에서 결과만 보면 되므로 관리자 전용으로 둔다.
  { href: "/admin/prior-participation", label: "참여이력 관리", roles: ["admin", "superadmin"] },
];

export function AdminNav({ role }: { role?: AdminRole }) {
  const pathname = usePathname();
  const tabs = ADMIN_TABS.filter((tab) => !tab.roles || !role || tab.roles.includes(role));

  return (
    <nav aria-label="관리자 포털 탭 메뉴" className="border-b border-slate-200 bg-white">
      <ul className="mx-auto flex max-w-[1600px] overflow-x-auto px-2 sm:px-6" role="list">
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
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
