import type { ReactNode } from "react";

import { DashboardTop } from "@/components/DashboardTop";
import { Footer } from "@/components/Footer";
import { Logo } from "@/components/NavBar";
import { SideNav, type SideNavGroup } from "@/components/SideNav";
import { loadViewerState } from "@/lib/access";
import { loadDashboardHeader } from "@/lib/header-read";

import styles from "./dashboard.module.css";

/*
  참가자 화면의 껍데기.

  상단 바는 「헤더 상태별 시안 v1.0」의 `.db-top`(D1~D9)이다 — 팀, 배너 필,
  벨, 아바타. 판정은 header-state.ts, 재료는 header-read.ts, 그리기는
  DashboardTop이 한다. 참가 기록이 없으면(각 page가 곧 404를 낸다) 워드마크만
  남긴다.

  네비게이션은 시안대로 216px 좌측 사이드바(`.db-side`)다 — `SideNav`가
  그린다. 여기서 한 번만 그린다 — 화면마다 그리면 플래그가 꺼진 항목을 어느
  화면에서는 숨기고 어느 화면에서는 보여주는 일이 반드시 생긴다.

  **꺼진 기능은 링크를 아예 만들지 않는다**(06 §4.4). 직접 주소를 치면 404가
  나가는데(canAccess), 링크만 남겨두면 눌러서 404를 보는 사람이 생긴다.
  "있는데 못 쓴다"와 "없다" 중 우리가 고른 것은 후자다.

  ⚠️ 보증금·상호 테스터는 라우트가 없다. 시안 v2.1이 둘을 **보류**로 두고
  (각각 「도입 미정」·「시즌2+」) 화면을 만들지 않았기 때문이다. 다만 시안이
  사이드바에 비활성 항목(`.db-it.hold`)으로 남겨 두므로 그 자리는 그대로 둔다 —
  「없앤 것」이 아니라 「나중에 열리는 것」임을 참가자가 알아야 한다.

  `loadViewerState`가 React cache로 감싸여 있어 레이아웃과 페이지가 각각 불러도
  요청당 DB는 한 번만 읽는다.
*/

type NavItem = { href: string; label: string };

/*
  시안이 사이드바에 남기는 보류 항목. 라우트가 없으므로 링크가 아니다.
*/
const HOLD: SideNavGroup = {
  title: "보류",
  items: [
    { href: "#deposit", label: "보증금", hold: "도입 미정" },
    { href: "#tester", label: "상호 테스터", hold: "시즌2+" },
  ],
};

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
      </header>

      <div className={styles.db}>
        <SideNav
          groups={[{ items }, HOLD]}
          label="대시보드"
          roots={["/dashboard"]}
        />
        <main className={`${styles.body} grow`}>{children}</main>
      </div>

      <Footer />
    </div>
  );
}
