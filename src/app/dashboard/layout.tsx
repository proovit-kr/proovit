import Link from "next/link";
import type { ReactNode } from "react";

import { Footer } from "@/components/Footer";
import { Logo } from "@/components/NavBar";
import { loadViewerState } from "@/lib/access";

import styles from "./dashboard.module.css";

/*
  참가자 화면의 껍데기.

  네비게이션을 여기서 한 번만 그린다. 화면마다 그리면 플래그가 꺼진 항목을
  어느 화면에서는 숨기고 어느 화면에서는 보여주는 일이 반드시 생긴다.

  **꺼진 기능은 링크를 아예 만들지 않는다**(06 §4.4). 직접 주소를 치면 404가
  나가는데(canAccess), 링크만 남겨두면 눌러서 404를 보는 사람이 생긴다.
  "있는데 못 쓴다"와 "없다" 중 우리가 고른 것은 후자다.

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

  const items: NavItem[] = [
    { href: "/dashboard", label: "홈" },
    { href: "/dashboard/team", label: "팀" },
    ...(flags?.deposit
      ? [{ href: "/dashboard/deposit", label: "보증금" }]
      : []),
    { href: "/dashboard/measurement", label: "측정 연동" },
    { href: "/dashboard/payment", label: "결제 연동" },
    { href: "/dashboard/metrics", label: "내 지표" },
    { href: "/dashboard/judgments", label: "심사 결과" },
    ...(flags?.testerAssignments
      ? [{ href: "/dashboard/tester", label: "상호 테스터" }]
      : []),
    ...(flags?.credits
      ? [{ href: "/dashboard/credits", label: "혜택과 크레딧" }]
      : []),
    { href: "/dashboard/appeal", label: "소명" },
  ];

  return (
    <div className={`page ${styles.page}`}>
      <header className={styles.head}>
        <div className={`container ${styles.headInner}`}>
          <Logo />
          {viewer.team ? (
            <p className={styles.team}>
              {viewer.team.name}
              {viewer.team.isLeader ? (
                <span className={styles.leader}>팀장</span>
              ) : null}
            </p>
          ) : null}
        </div>
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
