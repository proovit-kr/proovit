"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button, LinkButton } from "./Button";
import { glitchClass, useGlitchTick } from "./Glitch";
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

  「시즌 아카이브」는 ver3에서 답이 왔다. ver2는 `<a href="#">`라 죽은 링크를
  내보내느니 빼는 쪽을 골랐는데, ver3는 `<a class="soon-nav" title="P2, 시즌
  종료 후">`로 **href를 아예 뺐다** — 링크가 아니라 예고로 그리라는 뜻이다.
  그대로 따른다.
*/

/**
 * 대시보드·운영자 레이아웃도 쓰는 워드마크.
 *
 * ⚠️ `glitch`는 **랜딩에서만** 켠다. 시안의 공개 헤더 중 워드마크에
 * `.glitch`가 붙은 것은 `#scr-landing` 하나뿐이고, 리더보드·참가작·시즌
 * 상세·규칙은 평범한 `<span class="wm">`이다.
 *
 * 켜면 히어로 제목·파이널 문구와 **같은 순간에** 떨린다 — 시안이 인터벌
 * 하나로 `.glitch` 전부를 터뜨리기 때문이다(Glitch.tsx의 공용 티커).
 */
export function Logo({
  className,
  glitch,
}: {
  className?: string;
  glitch?: boolean;
}) {
  const tick = useGlitchTick();
  return (
    <Link
      href="/"
      className={
        glitch
          ? glitchClass(tick, [styles.wm, className].filter(Boolean).join(" "))
          : [styles.wm, className ?? ""].join(" ")
      }
      /* 의사요소가 읽는 글자. 보이는 ✓는 라임이지만 겹치는 층은 평문이다 */
      data-text={glitch ? "PROO✓IT" : undefined}
    >
      PROO<em className={styles.wmCheck}>✓</em>IT
    </Link>
  );
}

const HOME = { href: "/", label: "리그 소개" };

/*
  아직 화면이 없는 항목. 시안 `.soon-nav`는 스타일이 없는 표시용 클래스라
  옮길 값이 없고, href 없는 `<a>`라 링크로도 포커스로도 잡히지 않는다.
  `title`이 언제 열리는지 말한다.
*/
const SOON = { label: "시즌 아카이브", title: "P2, 시즌 종료 후" };

export interface NavBarProps {
  /**
   * 리더보드 정본 주소(`/seasons/:slug/leaderboard`).
   * 시즌마다 따로 남아야 아카이브가 성립하므로 슬러그가 필요하고,
   * 그 값은 서버만 안다. 시즌이 없으면 메뉴에서 아예 빠진다.
   */
  leaderboardHref?: string;
  /**
   * 메뉴를 내보이는가. 기준은 `season.ts`의 `navMenuVisible` 하나다.
   *
   * ⚠️ **기본값이 false다.** 빠뜨리면 안 보이는 쪽으로 틀리게 만든다 —
   * 반대로 두면 새 화면에서 메뉴가 조용히 되살아난다.
   */
  showMenu?: boolean;
  /** 워드마크에 글리치를 건다. 시안에서는 랜딩만 그렇다 */
  glitchLogo?: boolean;
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

export function NavBar({
  cta,
  leaderboardHref,
  showMenu = false,
  glitchLogo,
}: NavBarProps) {
  const pathname = usePathname();
  const menu = leaderboardHref
    ? [HOME, { href: leaderboardHref, label: "리더보드" }]
    : [HOME];

  return (
    <header className={styles.head}>
      <Logo glitch={glitchLogo} />
      {/*
        ⚠️ 리그 시작 전에는 `<nav>`를 통째로 내지 않는다. 감추는(`display:none`)
        것이 아니라 그리지 않는다 — 없는 메뉴가 스크린리더와 탭 순서에 남으면
        안 된다. 시안과 다르게 한 자리이고 이유는 `navMenuVisible`에 있다.
      */}
      {showMenu ? (
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
          <a title={SOON.title}>{SOON.label}</a>
        </nav>
      ) : null}
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
