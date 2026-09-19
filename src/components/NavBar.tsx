"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  resolvePublicHeader,
  viewerFromMe,
  type HeaderAction,
  type HeaderViewer,
  type PublicHeaderInput,
} from "@/lib/header-state";

import { Button, LinkButton } from "./Button";
import { glitchClass, useGlitchTick } from "./Glitch";
import { AdminTag, Avatar, Bell } from "./HeaderBits";
import { Icon } from "./Icon";
import styles from "./NavBar.module.css";

/*
  공개 헤더 — 시안 `.pub-head`. 「헤더 상태별 시안 v1.0」의 P1~P11.

  구조는 셋이다: 워드마크 · 메뉴 · 우측 액션(`.rgt`). 무엇을 그릴지는
  `resolvePublicHeader`(header-state.ts)가 정하고 여기서는 그리기만 한다.

  판정에 필요한 축이 둘인데 오는 길이 다르다.
    시즌  서버가 안다. 페이지가 `publicHeaderSeason(season)`으로 만들어 내려준다.
    유저  두 갈래다.
          · 동적 화면(리더보드·시즌 상세·참가작)은 이미 세션을 읽었으므로
            `viewer`로 내려준다.
          · 랜딩은 ISR(revalidate 60)이라 세션을 읽을 수 없다. `viewer`를
            **안 주면** 마운트 뒤 `/api/v1/me`를 읽어 채운다 — 첫 HTML은 비로그인
            모양이고 로그인한 사람은 하이드레이션 뒤 아바타가 붙는다.
            (그 라우트의 머리 주석이 이 결정의 이유다.)

  ⚠️ **로그인 링크가 돌아왔다.** 8/28에 AuthSlot을 지운 뒤 공개 화면에서
  로그인으로 가는 길이 없었는데, 이 시안이 그 자리를 정했다 — 모집 중부터
  비로그인에게 「로그인」 텍스트 링크, 로그인하면 아바타.
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

export type { HeaderViewer };

export interface NavBarProps {
  /** 시즌 축. `publicHeaderSeason(season)`이 만든다 */
  season: PublicHeaderInput["season"];
  /**
   * 유저 축. `undefined`면 클라이언트가 `/api/v1/me`로 채운다(랜딩·정적 문서).
   * `null`은 「비로그인이 확정」이다 — 세션을 읽은 화면이 준다.
   */
  viewer?: HeaderViewer | null;
  /** 워드마크에 글리치를 건다. 시안에서는 랜딩만 그렇다 */
  glitchLogo?: boolean;
  /*
    같은 페이지 안에서 처리하는 CTA(사전신청 폼으로 이동)면 이걸 준다.
    해시 링크로 두면 안 된다 — 한 번 눌러 URL이 #hero가 된 뒤에는 주소가
    그대로라 브라우저가 아무 일도 하지 않아, 버튼이 죽은 것처럼 보인다.
  */
  onPreregister?: () => void;
  /** 지금 보고 있는 항목을 경로 대신 강제로 정한다 — `/dev/headers` 진열장용 */
  activeHref?: string;
}

const PREREGISTER = "/?preregister=1";

export function NavBar({ season, viewer, glitchLogo, onPreregister, activeHref }: NavBarProps) {
  const routePath = usePathname();
  const pathname = activeHref ?? routePath;
  const [fetched, setFetched] = useState<HeaderViewer | null>(null);
  /*
    햄버거 메뉴는 「어느 경로에서 열었나」를 같이 기억한다 — 경로가 바뀌면
    값이 안 맞아 저절로 닫힌다. 이펙트로 닫으면 한 프레임 열린 채 그려진다.
  */
  const [openAt, setOpenAt] = useState<string | null>(null);
  const menuOpen = openAt === pathname;
  /*
    로그인은 보던 페이지로 돌아온다(시안 ver4 `#scr-auth` 개발 메모 「콜백은
    returnTo(직전 페이지, 없으면 홈)로 이동」). 홈이면 붙이지 않는다 — 기본값이 홈이다.
    걸러내는 쪽은 로그인 화면(`safeNext`)이다.
  */
  const loginHref =
    routePath && routePath !== "/"
      ? `/login?callbackUrl=${encodeURIComponent(routePath)}`
      : "/login";

  useEffect(() => {
    if (viewer !== undefined) return;
    let alive = true;
    fetch("/api/v1/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (alive && body?.ok) setFetched(viewerFromMe(body.data));
      })
      .catch(() => {
        /* 헤더는 비로그인 모양으로 남는다. 판정은 어차피 서버가 한다 */
      });
    return () => {
      alive = false;
    };
  }, [viewer]);

  const user = viewer === undefined ? fetched : viewer;
  const model = resolvePublicHeader({ season, user });
  const hasNav = model.nav.length > 0;
  /*
    ≤760에서는 로그인 링크가 햄버거 안에만 있다. 내비가 비어도 로그인이 있으면
    햄버거를 남긴다 — 안 그러면 모집 중 모바일 헤더에서 로그인 진입점이 사라진다.
  */
  const hasMenu = hasNav || model.login;

  const renderAction = (a: HeaderAction, i: number) => {
    /* 결과 보기(P5)는 시안이 `.cta`를 안 붙인 보조 버튼이다. 모바일에서 숨는다 */
    const cls = a.variant === "ghost" ? styles.sub : styles.cta;
    /* ≤760에서는 짧은 문구. 둘 다 DOM에 있고 하나만 보인다 */
    const label = a.short ? (
      <>
        <span className={styles.full}>{a.label}</span>
        <span className={styles.short}>{a.short}</span>
      </>
    ) : (
      a.label
    );
    if (onPreregister && a.href === PREREGISTER) {
      return (
        <Button key={i} size="sm" variant={a.variant} className={cls} onClick={onPreregister}>
          {label}
        </Button>
      );
    }
    return (
      <LinkButton key={i} href={a.href} size="sm" variant={a.variant} className={cls}>
        {label}
      </LinkButton>
    );
  };

  /*
    지금 보고 있는 항목 — 경로가 href와 같거나 그 아래인 것 중 **가장 긴 href**
    하나. 시즌 상세(`/seasons/:slug`)와 리더보드(`/seasons/:slug/leaderboard`)처럼
    앞부분을 공유하는 항목이 생기면 startsWith만으로는 둘 다 켜진다.
  */
  const active = model.nav
    .filter((i) => i.href && (pathname === i.href || (i.href !== "/" && pathname.startsWith(i.href + "/"))))
    .sort((a, b) => (b.href?.length ?? 0) - (a.href?.length ?? 0))[0];

  const navLinks = model.nav.map((item) => {
    if (!item.href) {
      /*
        아직 화면이 없는 항목(시안 `.soon-nav`). href 없는 `<a>`라 링크로도
        포커스로도 잡히지 않는다. `title`이 언제 열리는지 말한다.
      */
      return (
        <a key={item.label} className={styles.soon} title={item.title}>
          {item.label}
        </a>
      );
    }
    const on = item === active;
    return (
      <Link
        key={item.label}
        href={item.href}
        className={on ? styles.navOn : undefined}
        aria-current={on ? "page" : undefined}
      >
        {item.label}
      </Link>
    );
  });

  return (
    <header className={styles.head} data-variant={model.variant}>
      <Logo glitch={glitchLogo} />
      {/*
        ⚠️ 내비가 비면(모집 전·모집 중 등) `<nav>`를 통째로 내지 않는다. 감추는(`display:none`)
        것이 아니라 그리지 않는다 — 없는 메뉴가 스크린리더와 탭 순서에 남으면
        안 된다. 시안 P1도 마크업에 nav가 없다.
      */}
      {hasNav ? <nav className={styles.nav}>{navLinks}</nav> : null}
      <span className={styles.rgt}>
        {model.login ? (
          <Link href={loginHref} className={styles.login}>
            로그인
          </Link>
        ) : null}
        {model.adminTag ? <AdminTag /> : null}
        {model.actions.map(renderAction)}
        {model.bell ? <Bell dot={model.bell.dot} /> : null}
        {model.avatar ? <Avatar initial={model.avatar.initial} admin={model.avatar.admin} /> : null}
        {/*
          햄버거. ≤760에서만 보이고 내비와 로그인 링크를 안에 넣는다
          (시안 5장 노트, 메뉴 디자인은 시안 ver4 `.pub-menu`).
          사전 신청 기간에는 내비도 로그인도 없으니 햄버거도 없다.
        */}
        {hasMenu ? (
          <button
            type="button"
            className={styles.hbg}
            aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={menuOpen}
            onClick={() => setOpenAt(menuOpen ? null : pathname)}
          >
            <Icon name="menu" className={styles.hbgIc} />
          </button>
        ) : null}
      </span>
      {hasMenu && menuOpen ? (
        <div className={styles.menu}>
          {navLinks}
          {model.login ? (
            <Link href={loginHref} className={styles.menuLogin}>
              로그인
            </Link>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
