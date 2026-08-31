import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { StudyTabs } from "@/components/study/StudyTabs";

/**
 * 연구모임(트랙 B) 셸. 기존 특강 트랙의 (portal) 레이아웃과 헤더·푸터는 공유하되
 * 탭 네비게이션만 트랙별로 분리한다.
 */
export default function StudyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <StudyTabs />
      <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
      <Footer />
    </div>
  );
}
