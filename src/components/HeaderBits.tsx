import Link from "next/link";

import type { Seg } from "@/lib/header-state";

import styles from "./HeaderBits.module.css";
import { Icon } from "./Icon";

/*
  세 헤더(공개·참가자·운영자)가 같이 쓰는 조각 — 헤더 상태별 시안 v1.0의
  `.bell` `.me` `.ad-tag` `.live` `.chip` `.ssel`.

  값은 전부 시안에서 그대로 옮겼다(HeaderBits.module.css). 여기 없는 것은
  헤더마다 다른 상자(`.pub-head` `.db-top` `.ad-top`)뿐이고 그건 각 헤더의
  모듈에 있다.
*/

/**
 * 알림 벨. 참가팀이 생긴 뒤부터 보인다. `dot`은 미읽음, `red`는 실격 전용.
 * 알림센터(`/notifications`)로 간다.
 */
export function Bell({ dot, red }: { dot: boolean; red?: boolean }) {
  return (
    <Link
      href="/notifications"
      className={red ? `${styles.bell} ${styles.bellRed}` : styles.bell}
      aria-label={dot ? "알림, 읽지 않은 알림 있음" : "알림"}
    >
      <Icon name="bell" />
      {dot ? <i /> : null}
    </Link>
  );
}

/**
 * 아바타 — 이름 첫 글자. 클릭 시 마이페이지(참가자) 또는 계정(운영자).
 * 운영자는 바이올렛 테두리와 A(시안 규칙표 「아바타」).
 */
export function Avatar({ initial, admin }: { initial: string; admin?: boolean }) {
  return (
    <Link
      href="/settings"
      className={admin ? `${styles.me} ${styles.meAdm}` : styles.me}
      aria-label={admin ? "운영자 계정" : "마이페이지"}
    >
      {initial}
    </Link>
  );
}

/** ADMIN 태그. 운영자 세션임을 어느 화면에서든 드러낸다(P11 노트) */
export function AdminTag() {
  return <span className={styles.adTag}>ADMIN</span>;
}

/**
 * 라이브 도트. 대시보드 배너의 게이트 심사 중·s5 집계와 실격 스트립,
 * 운영자 스테이지 배지에만 쓴다 — 공개 헤더에는 없다(규칙표 「라이브 도트」).
 */
export function LiveDot({
  tone = "lime",
  size,
}: {
  tone?: "lime" | "violet" | "teal" | "red";
  /** 운영자 배지 안에서는 6px(시안 인라인 style) */
  size?: number;
}) {
  const cls = [
    styles.live,
    tone === "violet" ? styles.liveV : "",
    tone === "teal" ? styles.liveT : "",
    tone === "red" ? styles.liveR : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span
      className={cls}
      style={size ? { width: size, height: size } : undefined}
      aria-hidden="true"
    />
  );
}

/** 운영자 헤더의 이메일 칩(시안 `.chip`) */
export function Chip({ children }: { children: React.ReactNode }) {
  return <span className={styles.chip}>{children}</span>;
}

/**
 * 글자 조각을 그린다. 시안이 `<b>`·`.num`·`--faint`로 강조한 자리를
 * 판정(header-state.ts)이 Seg로 넘겨 주고, 여기서 태그로 바꾼다.
 */
export function Segs({ segs }: { segs: Seg[] }) {
  return (
    <>
      {segs.map((s, i) => {
        if (s.num) {
          return (
            <span key={i} className={styles.num} data-num="">
              {s.text}
            </span>
          );
        }
        if (s.strong) {
          return (
            <b key={i} className={styles.strong}>
              {s.text}
            </b>
          );
        }
        if (s.faint) {
          return (
            <span key={i} className={styles.faint}>
              {s.text}
            </span>
          );
        }
        if (s.accent) {
          return (
            <span key={i} className={styles.accent}>
              {s.text}
            </span>
          );
        }
        return <span key={i}>{s.text}</span>;
      })}
    </>
  );
}
