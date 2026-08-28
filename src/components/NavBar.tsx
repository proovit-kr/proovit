"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button, LinkButton } from "./Button";
import styles from "./NavBar.module.css";

/*
  공개 헤더 — 시안 `.pub-head`.

  구조는 시안 그대로 셋이다: 워드마크 · 메뉴 · 오른쪽 끝 CTA.

  ⚠️ **로그인 자리가 없다.** 시안의 공개 헤더에는 로그인 링크도 계정 메뉴도
  없다(`<span class="wm">` + `<nav>` 3개 + `.cta` 버튼이 전부). 로그인한
  사람은 대시보드 크롬(`.db-top`)을 보게 되어 있고, 거기에 벨과 아바타가 있다.

  8/28에 있던 AuthSlot·AccountMenu를 지웠다. 그래서 지금 공개 화면에서
  로그인으로 가는 길이 없다 — **윤서에게 넘길 요구사항이다**(아래 「시즌
  아카이브」와 함께).

  ⚠️ 「시즌 아카이브」도 빠져 있다. 시안 화면 레지스트리에서 `/seasons`가
  보류(P2)라 화면이 없다. 시안 마크업은 `<a href="#">`로 두지만 죽은 링크를
  내보내느니 빼는 쪽을 골랐다.
*/

/** 대시보드·운영자 레이아웃도 쓰는 워드마크 */
export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={[styles.wm, className ?? ""].join(" ")}>
      PROO<em className={styles.wmCheck}>✓</em>IT
    </Link>
  );
}

const HOME = { href: "/", label: "리그 소개" };

export interface NavBarProps {
  /**
   * 리더보드 정본 주소(`/seasons/:slug/leaderboard`).
   * 시즌마다 따로 남아야 아카이브가 성립하므로 슬러그가 필요하고,
   * 그 값은 서버만 안다. 시즌이 없으면 메뉴에서 아예 빠진다.
   */
  leaderboardHref?: string;
  /** 우측 주 버튼. 시즌 상태에 따라 서버에서 정해 내려준다. */
  cta: {
    href: string;
    label: string;
    /*
      같은 페이지 안에서 처리하는 CTA(사전신청 폼으로 이동)면 이걸 준다.
      해시 링크로 두면 안 된다 — 한 번 눌러 URL이 #hero가 된 뒤에는 주소가
      그대로라 브라우저가 아무 일도 하지 않아, 버튼이 죽은 것처럼 보인다.
    */
    onClick?: () => void;
  };
}

export function NavBar({ cta, leaderboardHref }: NavBarProps) {
  const pathname = usePathname();
  const menu = leaderboardHref
    ? [HOME, { href: leaderboardHref, label: "리더보드" }]
    : [HOME];

  return (
    <header className={styles.head}>
      <Logo />
      <nav className={styles.nav}>
        {menu.map((item) => {
          const on =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={on ? styles.navOn : undefined}
              aria-current={on ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      {/* 시안의 CTA는 `padding:9px 18px; font-size:13.5px` — Button의 sm이다 */}
      {cta.onClick ? (
        <Button size="sm" className={styles.cta} onClick={cta.onClick}>
          {cta.label}
        </Button>
      ) : (
        <LinkButton href={cta.href} size="sm" className={styles.cta}>
          {cta.label}
        </LinkButton>
      )}
    </header>
  );
}
