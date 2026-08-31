import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "2026학년도 2학기 AI 활용 연구모임 | 경상국립대학교 글로컬대학30",
  description:
    "경상국립대학교 글로컬대학30 사업 — AI 활용 연구모임 신청·심사·운영 포털. 신청기간 2026. 9. 7. ~ 9. 18., 10개팀 최대 50명 선발",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
        />
      </head>
      <body className="min-h-screen font-sans antialiased text-slate-900 bg-slate-50">
        <a href="#main-content" className="skip-link">
          본문 바로가기
        </a>
        {children}
      </body>
    </html>
  );
}
