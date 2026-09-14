import type { Metadata } from "next";
import Link from "next/link";

import { Footer } from "@/components/Footer";
import { NavBar } from "@/components/NavBar";
import { Card } from "@/components/Surface";
import { getCurrentSeason, resolveNav } from "@/lib/season";

import styles from "./not-found.module.css";

/*
  404 — 시안 `design/proovit_404.html`의 ① 「proovit.kr 경로 없음」.

  두 경우에 그려진다. 어느 라우트에도 안 맞는 주소, 그리고 화면 안에서
  `notFound()`를 던진 때(없는 참가작, 빈 정본 문서, 참가작 없는 대시보드).
  둘 다 루트의 이 파일이 받는다.

  ⚠️ 시안은 헤더·푸터를 「레이아웃에서 상속」한다고 적었지만 이 리포의 루트
  레이아웃은 크롬을 그리지 않는다 — 공개 화면마다 NavBar·Footer를 직접 놓는
  구조라(DocPage와 같다) 여기서도 그렇게 한다. 헤더의 메뉴·CTA는 시즌 상태에
  따라 `resolveNav`가 정하고, 푸터는 노션 정본(Footer.tsx)이다.

  시안의 ② 「참가팀 주소 미연결」(teamname.proovit.kr)은 리버스 프록시가
  돌려주는 경량 페이지라 이 앱의 것이 아니다. 여기서는 그리지 않는다.
*/

/*
  `robots`는 적지 않는다. 404 응답에는 Next가 `noindex`를 스스로 심어서,
  여기 또 적으면 같은 meta가 둘 나간다(2026-09-14 확인).
*/
export const metadata: Metadata = {
  title: "페이지를 찾을 수 없어요",
};

export default async function NotFound() {
  const season = await getCurrentSeason();

  return (
    <main className="page">
      <NavBar {...resolveNav(season)} />
      <div className={styles.nf}>
        <div className={styles.in}>
          <div className={styles.copy}>
            <h1>페이지를 찾을 수 없어요</h1>
            <p>주소가 잘못됐거나 페이지가 옮겨졌을 수 있어요.</p>
            <Link href="/" className={styles.go}>
              홈으로 돌아가기
            </Link>
          </div>
          {/* 장식이다. 제목이 이미 같은 말을 하므로 읽어 주지 않는다 */}
          <Card className={styles.plate} aria-hidden="true">
            <div className={styles.cap}>NOT FOUND</div>
            <div className={styles.num}>404</div>
          </Card>
        </div>
      </div>
      <Footer />
    </main>
  );
}
