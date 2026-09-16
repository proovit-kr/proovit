import Link from "next/link";
import type { ReactNode } from "react";

import { DashboardTop } from "@/components/DashboardTop";
import { Footer } from "@/components/Footer";
import { Logo } from "@/components/NavBar";
import { loadViewerState } from "@/lib/access";
import { loadDashboardHeader } from "@/lib/header-read";

import styles from "./dashboard.module.css";

/*
  참가자 화면의 껍데기.

  상단 바는 「헤더 상태별 시안 v1.0」의 `.db-top`(D1~D9)이다 — 팀, 배너 필,
  벨, 아바타. 판정은 header-state.ts, 재료는 header-read.ts, 그리기는
  DashboardTop이 한다. 참가 기록이 없으면(각 page가 곧 404를 낸다) 워드마크만
  남긴다.

  그 아래 줄이 네비게이션이다. 시안은 이걸 228px 좌측 사이드바(`.db-side`)로
  그리는데 그건 헤더가 아니라 별도 이식 항목이라, 지금은 괘선 아래의 한 줄로
  둔다. 여기서 한 번만 그린다 — 화면마다 그리면 플래그가 꺼진 항목을 어느
  화면에서는 숨기고 어느 화면에서는 보여주는 일이 반드시 생긴다.

  **꺼진 기능은 링크를 아예 만들지 않는다**(06 §4.4). 직접 주소를 치면 404가
  나가는데(canAccess), 링크만 남겨두면 눌러서 404를 보는 사람이 생긴다.
  "있는데 못 쓴다"와 "없다" 중 우리가 고른 것은 후자다.

  ⚠️ 보증금·상호 테스터는 아예 빠져 있다. 시안 v2.1이 둘을 **보류**로 두고
  (각각 「도입 미정」·「시즌2+」) 화면을 만들지 않았기 때문에 라우트도 지웠다.
  시안은 이 둘을 사이드바에 비활성 항목(`.db-it.hold`)으로 남기는데, 그 표기는
  db-side를 시안대로 옮길 때 함께 붙인다.

  `loadViewerState`가 React cache로 감싸여 있어 레이아웃과 페이지가 각각 불러도
  요청당 DB는 한 번만 읽는다.
*/

type NavItem = { href: string; label: string };

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const viewer = await loadViewerState();
  const flags = viewer.season?.flags;
  const header = await loadDashboardHeader(viewer);

  const items: NavItem[] = [
    { href: "/dashboard", label: "홈" },
    { href: "/dashboard/team", label: "팀" },
    { href: "/dashboard/measurement", label: "측정 연동" },
    { href: "/dashboard/payment", label: "결제 연동" },
    { href: "/dashboard/metrics", label: "내 지표" },
    { href: "/dashboard/judgments", label: "심사 결과" },
    ...(flags?.credits
      ? [{ href: "/dashboard/credits", label: "혜택과 크레딧" }]
      : []),
    { href: "/dashboard/appeal", label: "소명" },
  ];

  return (
    <div className={`page ${styles.page}`}>
      <header className={styles.head}>
        {header && viewer.entry ? (
          <DashboardTop model={header} entryId={viewer.entry.id} />
        ) : (
          <div className={styles.bare}>
            <Logo />
          </div>
        )}
        <nav className={`container ${styles.nav}`} aria-label="대시보드">
          {items.map((item) => (
            <Link key={item.href} href={item.href} className={styles.navLink}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className={`container grow`}>{children}</main>
      <Footer />
    </div>
  );
}
