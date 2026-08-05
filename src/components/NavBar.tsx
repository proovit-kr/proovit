"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button, LinkButton } from "./Button";
import styles from "./NavBar.module.css";

/*
  프로토타입 NavBar의 Next 버전.

  ⚠️ 로그인 상태(user chip · 로그아웃)는 아직 없다.
  Auth.js가 W2에 들어오므로 그때 서버에서 세션을 읽어 prop으로 내려준다.
  프로토타입은 zustand 스토어에서 클라이언트로 읽었지만, 06 §5.2가
  권한 판정을 서버에서만 하라고 요구하므로 그 구조는 옮기지 않는다.
*/

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={[styles.logo, className ?? ""].join(" ")}>
      PROO<span className={styles.logoCheck}>✓</span>IT
    </Link>
  );
}

const MENU = [
  { href: "/", label: "리그 소개" },
  { href: "/leaderboard", label: "리더보드" },
  { href: "/seasons", label: "시즌 아카이브" },
];

export interface NavBarProps {
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

export function NavBar({ cta }: NavBarProps) {
  const pathname = usePathname();

  return (
    <nav className={styles.nav}>
      <Logo />
      <div className={styles.menu}>
        {MENU.map((item) => {
          const isActive =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                isActive ? `${styles.menuLink} ${styles.menuActive}` : styles.menuLink
              }
            >
              {item.label}
            </Link>
          );
        })}
      </div>
      <div className={styles.right}>
        <Link href="/signin" className={styles.signIn}>
          로그인
        </Link>
        {cta.onClick ? (
          <Button size="sm" onClick={cta.onClick}>
            {cta.label}
          </Button>
        ) : (
          <LinkButton href={cta.href} size="sm">
            {cta.label}
          </LinkButton>
        )}
      </div>
    </nav>
  );
}
