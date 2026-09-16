import type { SVGProps } from "react";

import styles from "./Icon.module.css";

/*
  아이콘 — 시안 v1.1 CRAFT의 「시스템 이모지를 SVG로 치환」.

  시안은 마크업에 이모지를 그대로 쓰고, 로드 직후 스크립트가 통째로 SVG로
  바꿔치기한다(뷰어라 그 편이 편해서다). 우리는 처음부터 SVG로 낸다 —
  결과는 같고 깜빡임이 없다.

  왜 바꿔치는가: 시스템 이모지는 OS마다 모양과 색이 다르고 굵기를 못 맞춘다.
  화면 하나에 라임 한 톤으로 맞춰 둔 옆에서 이모지만 총천연색으로 튄다.

  path는 시안의 ICONS 표에서 그대로 옮겼다.
*/
const PATHS = {
  bell: (
    <>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  clip: (
    <path d="M21.4 11 12.3 20.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 1 1 5.7 5.7L9.4 17.4a2 2 0 0 1-2.8-2.8l8.5-8.5" />
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11.2 12H12v4h.9" />
    </>
  ),
  warn: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  ban: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </>
  ),
  /* 햄버거 — 헤더 상태별 시안 5장의 모바일 공개 헤더(`.hbg`) */
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
} as const;

export type IconName = keyof typeof PATHS;

/**
 * 크기는 글자를 따라간다(`1.05em`). 문장 안에 섞여도 줄 높이가 안 흔들린다.
 * 색은 `currentColor`라 부모 색을 그대로 받는다 — 뱃지든 경고줄이든 따로 안 준다.
 */
export function Icon({
  name,
  /** 경고줄·안내줄에서 17px로 고정. 시안 `.wbar .ic` */
  fixed,
  className,
  ...rest
}: SVGProps<SVGSVGElement> & { name: IconName; fixed?: boolean }) {
  return (
    <svg
      className={[styles.ic, fixed ? styles.fixed : "", className]
        .filter(Boolean)
        .join(" ")}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
