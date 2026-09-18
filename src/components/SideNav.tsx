"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./SideNav.module.css";

/*
  로그인 뒤 화면의 좌측 사이드바(시안 `.db-side`).

  참가자와 운영자가 같은 상자를 쓴다 — 시안도 클래스를 공유하고 `.adm`에서
  활성 색만 라임에서 바이올렛으로 바꾼다. 그래서 여기서 갈라 두면 두 레이아웃이
  서로 다른 간격으로 흘러가는 일이 없다.

  ⚠️ **활성 판정을 서버에서 하지 않는다.** 레이아웃은 세그먼트가 바뀌어도 다시
  그려지지 않아서, 서버에서 경로를 읽으면 첫 진입의 활성 항목이 그대로 굳는다.
  `usePathname`을 쓰는 클라이언트 상자 하나로 두는 이유다.

  `/dashboard`와 `/admin`은 홈이라 정확히 일치할 때만 켠다. 나머지는 하위 경로
  (`/dashboard/submit/s3`)까지 켜야 해서 접두사로 본다.
*/

export type SideNavItem = {
  href: string;
  label: string;
  /** 보류 항목 — 누를 수 없고 사유를 칩으로 적는다 */
  hold?: string;
};

export type SideNavGroup = {
  /** 그룹 머리글. 없으면 머리글 없이 항목만 이어 붙인다 */
  title?: string;
  items: SideNavItem[];
};

function isOn(pathname: string, href: string, roots: string[]): boolean {
  if (roots.includes(href)) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SideNav({
  groups,
  tone = "member",
  label,
  roots,
}: {
  groups: SideNavGroup[];
  /** member는 라임, ops는 바이올렛 (시안 `.adm`) */
  tone?: "member" | "ops";
  label: string;
  /** 정확히 일치할 때만 켜는 경로들 (홈) */
  roots: string[];
}) {
  const pathname = usePathname();

  return (
    <nav className={styles.side} data-tone={tone} aria-label={label}>
      {groups.map((group, index) => (
        <div key={group.title ?? index} className={styles.group}>
          {group.title ? (
            <p className={styles.groupTitle}>{group.title}</p>
          ) : null}

          {group.items.map((item) =>
            item.hold ? (
              <span key={item.href} className={styles.hold} aria-disabled>
                {item.label}
                <small>{item.hold}</small>
              </span>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={styles.item}
                aria-current={
                  isOn(pathname, item.href, roots) ? "page" : undefined
                }
              >
                {item.label}
              </Link>
            ),
          )}
        </div>
      ))}
    </nav>
  );
}
