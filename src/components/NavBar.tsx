"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { logout } from "@/app/actions/auth";

import { Button, LinkButton } from "./Button";
import styles from "./NavBar.module.css";

/*
  프로토타입 NavBar의 Next 버전.

  로그인 상태는 /api/v1/me에서 읽는다. 서버에서 prop으로 내리려던 원래 계획을
  바꾼 이유는 그 엔드포인트 주석에 있다 — 요약하면 NavBar가 붙는 유일한 화면이
  ISR 랜딩이라, 거기서 세션을 읽으면 관전 트래픽이 전부 DB 조회가 된다.

  ⚠️ 이건 **표시**지 권한 판정이 아니다. 06 §5.2가 금지한 것은 클라이언트가
  화면 접근을 판정하는 것이고(프로토타입 RouteGuards가 그랬다), 그 판정은
  전부 서버 access.ts에 있다. 여기서 위조해 봐야 자기 헤더에 남의 이름이 그려질 뿐이다.
*/

type Me =
  | { state: "unknown" }
  | { state: "anonymous" }
  | { state: "signedIn"; nickname: string; onboarded: boolean };

function AuthSlot({ me }: { me: Me }) {
  // 아직 모른다. 자리만 비워둔다 — 위 useEffect 주석 참조.
  if (me.state === "unknown") return null;

  if (me.state === "anonymous") {
    /*
      ⚠️ /signin이 아니라 /login이다. 「필요 페이지 정리」와 CLAUDE.md는 /signin으로
      적고 있으나 그 라우트는 존재한 적이 없고, 구글 콘솔에 등록된 콜백 주소가
      /api/auth/callback/google이라 이름을 바꾸면 재등록이 따라온다.
      정본은 8/17에 정하고 그때 한 번에 옮긴다 — 지금 둘을 섞는 게 제일 나쁘다.
    */
    return (
      <Link href="/login" className={styles.signIn}>
        로그인
      </Link>
    );
  }

  /*
    온보딩을 안 마친 사람은 이름이 임시값(이메일 아이디)이다. 그걸 헤더에
    그대로 걸면 자기 이름이 잘못 나온 것처럼 보이므로, 이름 대신 마저 하라고 부른다.
  */
  if (!me.onboarded) {
    return (
      <Link href="/onboarding" className={styles.signIn}>
        이름 설정
      </Link>
    );
  }

  return <AccountMenu nickname={me.nickname} />;
}

/*
  프로필 칩 + 드롭다운.

  로그아웃을 헤더에 펼쳐두지 않는 이유는 폭이다. 칩과 로그아웃과 사전신청 CTA가
  한 줄에 서면 헤더가 넘쳐 줄이 접혔다 펴지고, 로그인 상태가 늦게 확정되는
  탓에 그 접힘이 눈앞에서 일어난다. 칩 하나로 줄이면 폭이 고정된다.

  자주 안 쓰는 동작을 한 겹 안에 넣는 것이기도 하다 — 로그아웃은 헤더에
  상시 노출될 만큼 자주 누르는 버튼이 아니고, 사전신청 CTA와 시선을 나눠 가진다.
*/
function AccountMenu({ nickname }: { nickname: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    /*
      바깥을 누르면 닫는다. click이 아니라 pointerdown인 이유 — click은 버튼을
      누르고 뗄 때까지 기다려서, 드래그하다 밖에서 떼면 안 닫힌다.
    */
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      // 닫고 나면 초점이 갈 곳이 없어진다. 열었던 자리로 돌려준다.
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  /*
    이니셜은 [...nickname][0]로 뽑는다. slice(0,1)은 이모지처럼 두 칸을 쓰는
    글자를 반토막 내서 깨진 문자가 나온다.
  */
  const initial = [...nickname][0] ?? "?";

  return (
    <div className={styles.account} ref={rootRef}>
      {/*
        .userChip·.avatar·.userName은 프로토타입에서 넘어와 지금까지 안 쓰이던
        스타일이다. 새로 만들지 않고 그대로 쓴다 — 헤더의 디자인 언어가 이미 여기 있다.
      */}
      <button
        ref={triggerRef}
        type="button"
        className={styles.userChip}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.avatar} aria-hidden="true">
          {initial}
        </span>
        <span className={styles.userName}>{nickname}</span>
        {/*
          ▾ 같은 글꼴 문자를 쓰지 않는다. 작은 크기에서 Pretendard가 이걸
          점처럼 뭉개서 그리고, 글꼴이 바뀌면 모양도 같이 바뀐다.
          SVG면 크기·굵기·색을 우리가 정하고 열렸을 때 뒤집을 수도 있다.
        */}
        <svg
          className={open ? `${styles.caret} ${styles.caretOpen}` : styles.caret}
          viewBox="0 0 12 12"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
      </button>

      {open ? (
        <div className={styles.accountMenu} role="menu">
          {/*
            누를 때 닫는다. 경로 변화를 effect로 감시하는 방법도 있지만 그건
            일어난 일을 뒤늦게 따라가는 것이라, 클라이언트 이동이 끝날 때까지
            메뉴가 떠 있는 한 프레임이 생긴다. 닫는 계기는 클릭 그 자체다.
          */}
          <Link
            href="/settings"
            className={styles.accountItem}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            설정
          </Link>
          {/*
            서버 액션 폼이라 클라이언트에서 CSRF 토큰을 다룰 일이 없다.
            signOut이 redirectTo로 전체 이동을 일으키므로 NavBar가 다시 떠서
            상태가 저절로 맞춰진다.
          */}
          <form action={logout}>
            <button
              type="submit"
              className={styles.accountItem}
              role="menuitem"
            >
              로그아웃
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

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

  // 헤더가 콘텐츠 위로 떠올랐는지. 경계선을 그때만 긋는다.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    // 새로고침으로 중간 위치에서 시작하는 경우가 있어 한 번 먼저 읽는다.
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /*
    로그인 상태. 확정 전에는 아무것도 그리지 않는다("unknown") —
    기본값을 "로그인"으로 두면 로그인한 사람이 매번 로그인 링크를 한 번 보고
    자기 이름으로 바뀌는 깜빡임을 겪는다. 빈 자리가 잘못된 자리보다 낫다.
  */
  const [me, setMe] = useState<Me>({ state: "unknown" });
  useEffect(() => {
    let alive = true;
    fetch("/api/v1/me")
      .then((res) => res.json())
      /*
        응답이 `{ok, data}` 봉투다(명세서 §0.2). 성공·실패를 res.ok가 아니라
        본문의 ok로 가린다 — 봉투를 쓰는 이유가 이 분기를 한 군데로 모으는 것이다.
      */
      .then((body) => {
        if (!alive) return;
        const user = body?.ok ? body.data?.user : null;
        setMe(
          user
            ? {
                state: "signedIn",
                nickname: user.nickname,
                onboarded: user.onboarded,
              }
            : { state: "anonymous" },
        );
      })
      /* 실패해도 헤더가 깨지면 안 된다 — 로그인 링크로 되돌린다 */
      .catch(() => alive && setMe({ state: "anonymous" }));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <nav className={scrolled ? `${styles.nav} ${styles.navScrolled}` : styles.nav}>
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
        {/*
          로그인 상태가 확정되기 전에는 이 자리가 비어 있다. 감싸는 칸이 없으면
          그 순간 사전신청 CTA가 왼쪽으로 갔다가 되돌아온다 — 최소 폭을
          "로그인" 링크만큼 잡아두면 비로그인 방문자는 흔들림이 아예 없다.
        */}
        <div className={styles.authSlot}>
          <AuthSlot me={me} />
        </div>
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
