import type { Metadata } from "next";
import "./globals.css";

// 링크 미리보기(OG)는 절대 URL이 필요하다. 배포 워크플로가 GitHub Pages 주소를
// NEXT_PUBLIC_SITE_URL로 주입하며, 로컬 빌드 등 미설정 시에는 프로젝트 사이트 주소로 둔다.
const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://limjeomseob.github.io/GLOCAL_AI_2"
).replace(/\/+$/, "");
const TITLE = "2026학년도 2학기 AI 활용 연구모임 | 경상국립대학교 글로컬대학30";
const DESCRIPTION =
  "경상국립대학교 글로컬대학30 사업 — AI 활용 연구모임 신청·심사·운영 포털. 신청기간 2026. 9. 7. ~ 9. 18., 10개팀 최대 50명 선발";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  // 카카오톡·슬랙·문자 등에 링크를 붙였을 때 뜨는 썸네일. 원본은 scripts/generate-og-image.py 로 생성.
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "글로컬 AI 동행 포털",
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/`,
    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "2026학년도 2학기 AI 활용 연구모임 — 신청·심사·운영 원스톱 포털 (경상국립대학교 글로컬대학30)",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [`${SITE_URL}/og-image.png`],
  },
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
