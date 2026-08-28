"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import styles from "./Glitch.module.css";

/*
  글리치 — 시안 v1.3.

  글자를 라임과 블루로 한 겹씩 더 깔고 0.42초 동안 어긋나게 흔든다.
  의사요소가 `data-text`를 그대로 읽어 쓴다.

  ⚠️ **박자는 하나다.** 시안은 `setInterval` 하나가 `.glitch` 전부를 동시에
  터뜨린다 — 헤더 워드마크와 히어로 제목과 파이널 문구가 같은 순간에 떨린다.
  컴포넌트마다 타이머를 따로 두면 조금씩 어긋나서 전혀 다른 인상이 된다.
  그래서 모듈 수준에 티커 하나를 두고 모두가 구독한다.
*/

const subscribers = new Set<(on: boolean) => void>();
let timers: number[] = [];

function fireAll() {
  subscribers.forEach((fn) => fn(true));
  window.setTimeout(() => subscribers.forEach((fn) => fn(false)), 460);
}

function startTicker() {
  /* 시안은 900ms 뒤 한 번 터뜨리고 그 뒤로 3.6초마다 반복한다 */
  timers = [
    window.setTimeout(fireAll, 900),
    window.setInterval(fireAll, 3600),
  ];
}

function stopTicker() {
  timers.forEach((t) => {
    window.clearTimeout(t);
    window.clearInterval(t);
  });
  timers = [];
}

/**
 * 공용 박자에 올라탄다. 첫 구독자가 티커를 켜고 마지막이 끄므로,
 * 글리치가 화면에 하나도 없을 때는 타이머도 돌지 않는다.
 */
export function useGlitchTick(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    subscribers.add(setOn);
    if (subscribers.size === 1) startTicker();
    return () => {
      subscribers.delete(setOn);
      if (subscribers.size === 0) stopTicker();
    };
  }, []);
  return on;
}

export function glitchClass(on: boolean, extra?: string): string {
  return [styles.glitch, on ? styles.on : "", extra].filter(Boolean).join(" ");
}

/**
 * 글리치가 걸린 글자 한 덩어리.
 *
 * 시안은 제목(h1)에 마우스를 올려도 한 번 터뜨리는데, 그건 **그 제목 안의
 * 글리치만** 터진다(주기 티커와 달리 전체가 아니다). 시안 스크립트가
 * `g.closest('h1')`에 리스너를 다는 것을 그대로 옮겼다 — 그래야 쓰는 쪽이
 * ref를 들고 다니지 않아도 된다.
 */
export function Glitch({
  text,
  children,
  className,
}: {
  /** 의사요소가 읽을 글자. 보이는 내용과 다를 수 있다(워드마크의 ✓처럼) */
  text: string;
  children?: ReactNode;
  className?: string;
}) {
  const tick = useGlitchTick();
  const [hover, setHover] = useState(false);

  return (
    <span
      className={glitchClass(tick || hover, className)}
      data-text={text}
      ref={(el) => {
        const h1 = el?.closest("h1");
        if (!h1) return;
        const fire = () => {
          setHover(true);
          window.setTimeout(() => setHover(false), 460);
        };
        h1.addEventListener("mouseenter", fire);
        return () => h1.removeEventListener("mouseenter", fire);
      }}
    >
      {children ?? text}
    </span>
  );
}
