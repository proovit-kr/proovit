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
  /*
    활성 판정에 쓸 접두사. 「스테이지 제출」은 링크가 지금 낼 스테이지 하나를
    가리키는데(`/dashboard/submit/s3`) 다른 스테이지를 보고 있어도 그 항목이
    켜져 있어야 한다.
  */
  activePrefix?: string;
  /*
    닫힌 항목 — 시안 `#scr-hub[data-side]`의 두 모양. 탈락(`elim`)은 제출·내
    지표를 **줄을 그어** 닫고, 실격(`dq`)은 허브·소명 빼고 전부 **흐리게만**
    닫는다. 둘 다 누를 수 없다(`pointer-events:none`)라 링크를 만들지 않는다.
  */
  off?: "dim" | "strike";
};

export type SideNavGroup = {
  /** 그룹 머리글. 없으면 머리글 없이 항목만 이어 붙인다 */
  title?: string;
  items: SideNavItem[];
};

function isOn(
  pathname: string,
  item: SideNavItem,
  roots: string[],
): boolean {
  const href = item.activePrefix ?? item.href;
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
            item.off ? (
              <span
                key={item.href}
                className={`${styles.item} ${styles.off}${item.off === "strike" ? ` ${styles.strike}` : ""}`}
                aria-disabled
              >
                {item.label}
              </span>
            ) : item.hold ? (
              <span key={item.href} className={styles.hold} aria-disabled>
                {item.label}
                <small>{item.hold}</small>
              </span>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={styles.item}
                aria-current={isOn(pathname, item, roots) ? "page" : undefined}
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
