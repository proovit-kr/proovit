"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

/**
 * Cloudflare Turnstile 위젯.
 *
 * `NEXT_PUBLIC_TURNSTILE_SITE_KEY`가 없으면 아무것도 그리지 않는다. 키를 넣기
 * 전까지는 지금과 똑같이 동작해야 배포가 안전하다 — 서버도 같은 전제로 검증을
 * 건너뛴다(`src/lib/turnstile.ts`).
 *
 * 암시 렌더(`class="cf-turnstile"` 자동 스캔) 대신 명시 렌더를 쓴다. 암시 렌더는
 * React가 리렌더할 때 같은 자리에 위젯을 하나 더 그리는 일이 있고, 그러면 토큰이
 * 어느 위젯 것인지 어긋난다.
 */

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      theme?: "light" | "dark" | "auto";
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/** 키가 없으면 토큰을 요구하지 않는다. 폼의 제출 가능 조건 계산에 쓴다. */
export const turnstileEnabled = Boolean(TURNSTILE_SITE_KEY);

export default function Turnstile({
  onToken,
  resetSignal,
}: {
  onToken: (token: string | null) => void;
  /** 값이 바뀌면 위젯을 초기화한다. 토큰은 1회용이라 제출 후 반드시 새로 받아야 한다. */
  resetSignal: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  /*
    onToken이 매 렌더 새 함수여도 위젯을 다시 그리지 않도록 최신 값만 따로 들고 있는다.
    렌더 중에 대입하지 않고 effect로 미루는 이유는 ref 갱신이 렌더의 부수효과이기
    때문이다. 아래 콜백들은 사용자 조작 시점에 불리므로 이 순서로 충분하다.
  */
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!ready || !TURNSTILE_SITE_KEY) return;
    const api = window.turnstile;
    const el = boxRef.current;
    if (!api || !el || widgetIdRef.current) return;

    widgetIdRef.current = api.render(el, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: "dark",
      callback: (token) => onTokenRef.current(token),
      // 토큰은 유효기간이 있다. 만료되면 없는 것으로 되돌려 제출을 막는다.
      "expired-callback": () => onTokenRef.current(null),
      "error-callback": () => onTokenRef.current(null),
    });

    return () => {
      if (widgetIdRef.current) {
        api.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [ready]);

  useEffect(() => {
    if (resetSignal === 0) return;
    window.turnstile?.reset(widgetIdRef.current ?? undefined);
    onTokenRef.current(null);
  }, [resetSignal]);

  if (!TURNSTILE_SITE_KEY) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
        onReady={() => setReady(true)}
      />
      <div ref={boxRef} />
    </>
  );
}
