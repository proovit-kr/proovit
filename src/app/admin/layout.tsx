import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/NavBar";
import { loadViewerState } from "@/lib/access";

import styles from "./admin.module.css";

/*
  운영자 콘솔 껍데기.

  참가자 화면과 배경·글자색을 다르게 쓴다(`--c-bg-ops`·`--c-text-ops`).
  같은 브라우저에서 두 화면을 오가는 사람이 지금 어느 쪽에 있는지를 색으로
  알아야 한다 — 운영자 화면의 쓰기는 전부 감사 로그에 남고 되돌리기 어렵다.

  ⚠️ 여기서 접근을 막지 않는다. 레이아웃은 판정 자리가 아니다 —
  각 page.tsx가 `guardPage("admin…")`으로 막는다. 레이아웃에서만 막으면
  나중에 추가되는 라우트가 조용히 열린다.
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

  const items = viewer.season?.flags.sponsors
    ? [...ITEMS, { href: "/admin/sponsors", label: "스폰서 크레딧" }]
    : ITEMS;

  return (
    <div className={`page page--ops ${styles.page}`}>
      <header className={styles.head}>
        <div className={`container container--ops ${styles.headInner}`}>
          <div className={styles.brand}>
            <Logo />
            <span className={styles.tag}>운영</span>
          </div>
          {viewer.season ? (
            <p className={styles.season}>
              {viewer.season.title}
              <span className={styles.phase}>{viewer.season.phase}</span>
            </p>
          ) : null}
        </div>
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
