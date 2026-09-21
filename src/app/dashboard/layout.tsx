import type { ReactNode } from "react";

import { EntryStage, EntryStatus } from "@/generated/prisma/enums";

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

type NavItem = {
  href: string;
  label: string;
  activePrefix?: string;
  off?: "dim" | "strike";
};

/*
  생존 상태에 따라 닫히는 항목 — 시안 `#scr-hub[data-side]`(370행).
    탈락  스테이지 제출·내 지표에 줄을 긋는다 — 더 낼 것도 쌓일 것도 없다
    실격  허브·소명만 남긴다 — 열린 길이 소명뿐이다(허브 h14의 말 그대로)
  (2026-09-21 수연 지시 — 「게이트 미제출일 때 사이드바에 비활성 메뉴들 있어야」)
*/
function closeFor(items: NavItem[], status?: EntryStatus): NavItem[] {
  if (status === EntryStatus.eliminated) {
    const struck = new Set(["/dashboard/metrics"]);
    return items.map((item) =>
      struck.has(item.href) || item.activePrefix === "/dashboard/submit"
        ? { ...item, off: "strike" }
        : item,
    );
  }
  if (status === EntryStatus.disqualified) {
    const open = new Set(["/dashboard", "/dashboard/appeal"]);
    return items.map((item) =>
      open.has(item.href) ? item : { ...item, off: "dim" },
    );
  }
  return items;
}

/*
  「스테이지 제출」이 가리킬 곳 — **지금 낼 스테이지**다.

  ⚠️ `entry.stage`는 마지막으로 **완료한** 단계라 한 칸 앞을 가리킨다.
  게이트(s2·s5)에 멈춘 팀은 판정 대기라 그 자리에 세워 둔다 — 낸 것을
  다시 볼 수 있어야 하고, 다음 칸으로 보내면 통과한 것처럼 보인다.
*/
function submitStage(stage?: EntryStage): string {
  switch (stage) {
    case EntryStage.applied:
      return "s1";
    case EntryStage.s1:
      return "s2";
    case EntryStage.s3:
      return "s3";
    case EntryStage.s4:
      return "s4";
    case EntryStage.s2:
      return "s2";
    default:
      /* s5·completed — 마지막으로 낸 자리 */
      return "s5";
  }
}

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

  /*
    ⚠️ **참가 기록이 없으면 허브만 남긴다.** 나머지 라우트는 전부 `entry: true`라
    눌러도 404다 — 「꺼진 기능은 링크를 아예 만들지 않는다」(06 §4.4)와 같은
    이유다. 허브는 그때 신청 안내를 그린다(2026-09-21 수연 지시).

    ⚠️ **이름과 순서는 시안 3626행 `MENU` 그대로다**(2026-09-21 수연 지시).
    「홈」이 아니라 「허브」, 「팀」이 아니라 「팀 관리」이고, 혜택과 크레딧이
    내 지표보다 앞이다.
  */
  const items: NavItem[] = [
    { href: "/dashboard", label: "허브" },
    { href: "/dashboard/team", label: "팀 관리" },
    { href: "/dashboard/measurement", label: "측정 연동" },
    { href: "/dashboard/payment", label: "결제 연동" },
    {
      href: `/dashboard/submit/${submitStage(viewer.entry?.stage)}`,
      label: "스테이지 제출",
      /* 어느 스테이지를 보고 있든 이 항목이 켜져 있어야 한다 */
      activePrefix: "/dashboard/submit",
    },
    ...(flags?.credits
      ? [{ href: "/dashboard/credits", label: "혜택과 크레딧" }]
      : []),
    { href: "/dashboard/metrics", label: "내 지표" },
    { href: "/dashboard/judgments", label: "심사 결과" },
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
          groups={
            viewer.entry
              ? [{ items: closeFor(items, viewer.entry.status) }, HOLD]
              : [{ items: items.slice(0, 1) }]
          }
          label="대시보드"
          roots={["/dashboard"]}
        />
        <main className={`${styles.body} grow`}>{children}</main>
      </div>

      <Footer />
    </div>
  );
}
