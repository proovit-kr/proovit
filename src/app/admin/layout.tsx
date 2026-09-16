import Link from "next/link";
import type { ReactNode } from "react";

import { AdminTop } from "@/components/AdminTop";
import { AdminTag } from "@/components/HeaderBits";
import { Logo } from "@/components/NavBar";
import { loadViewerState } from "@/lib/access";
import { loadAdminHeader } from "@/lib/header-read";

import styles from "./admin.module.css";

/*
  운영자 콘솔 껍데기.

  상단 바는 「헤더 상태별 시안 v1.0」의 어드민 크롬(A1~A7)이다 — 워드마크,
  ADMIN 태그, 시즌 셀렉트, 상태 배지, 지금 처리할 대기열, 이메일 칩, 아바타.
  판정은 header-state.ts, 재료는 header-read.ts, 그리기는 AdminTop이 한다.
  그 아래 줄이 콘솔 네비게이션이다(시안의 사이드바는 별도 이식 항목).

  참가자 화면과 배경·글자색을 다르게 쓴다(`--c-bg-ops`·`--c-text-ops`).
  같은 브라우저에서 두 화면을 오가는 사람이 지금 어느 쪽에 있는지를 색으로
  알아야 한다 — 운영자 화면의 쓰기는 전부 감사 로그에 남고 되돌리기 어렵다.

  ⚠️ 여기서 접근을 막지 않는다. 레이아웃은 판정 자리가 아니다 —
  각 page.tsx가 `guardPage("admin…")`으로 막는다. 레이아웃에서만 막으면
  나중에 추가되는 라우트가 조용히 열린다. 다만 대기열 숫자는 운영자에게만
  읽는다(`loadAdminHeader`가 역할을 본다) — 비운영자에게는 워드마크와 태그만
  그리고 곧 page가 404를 낸다.
*/

/*
  ⚠️ 플래그로 가리는 항목이 하나 있다. 참가자 레이아웃과 같은 규칙이다 —
  꺼진 기능은 링크를 아예 만들지 않는다(06 §4.4). 직접 주소를 치면
  `canAccess("adminSponsors")`가 404를 낸다.
*/
const ITEMS = [
  { href: "/admin", label: "홈" },
  { href: "/admin/seasons", label: "시즌" },
  { href: "/admin/entries", label: "참가" },
  { href: "/admin/judging", label: "심사" },
  { href: "/admin/metrics", label: "지표" },
  { href: "/admin/abuse", label: "어뷰징" },
  { href: "/admin/leads", label: "리드" },
  { href: "/admin/notifications", label: "공지" },
  { href: "/admin/awards", label: "시상" },
  { href: "/admin/audit-logs", label: "감사 로그" },
];

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const viewer = await loadViewerState();
  const header = await loadAdminHeader(viewer);

  const items = viewer.season?.flags.sponsors
    ? [...ITEMS, { href: "/admin/sponsors", label: "스폰서 크레딧" }]
    : ITEMS;

  return (
    <div className={`page page--ops ${styles.page}`}>
      <header className={styles.head}>
        {header ? (
          <AdminTop model={header} />
        ) : (
          <div className={styles.bare}>
            <Logo />
            <AdminTag />
          </div>
        )}
        <nav
          className={`container container--ops ${styles.nav}`}
          aria-label="운영자 콘솔"
        >
          {items.map((item) => (
            <Link key={item.href} href={item.href} className={styles.navLink}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className={`container container--ops grow`}>{children}</main>
    </div>
  );
}
