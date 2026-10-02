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
      size?: "normal" | "flexible" | "compact";
      appearance?: "always" | "execute" | "interaction-only";
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

/*
  상자의 폭은 Cloudflare가 정한다 — `normal`이 300×65, `compact`가 150×140이고
  CSS로 줄일 수 없다(iframe이라 안쪽 배치는 그대로고 잘리기만 한다).
*/
const NORMAL_W = 300;
const COMPACT_W = 150;

/** 키가 없으면 토큰을 요구하지 않는다. 폼의 제출 가능 조건 계산에 쓴다. */
export const turnstileEnabled = Boolean(TURNSTILE_SITE_KEY);

export default function Turnstile({
  onToken,
  onError,
  resetSignal,
}: {
  onToken: (token: string | null) => void;
  /**
   * 위젯이 토큰을 못 받은 채 끝났을 때 불린다.
   *
   * `interaction-only`라 위젯이 화면에 없다 — 실패하면 제출 버튼만 말없이 잠긴다.
   * 이유를 대신 말해줄 곳이 필요해서 따로 뺐다.
   */
  onError?: () => void;
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
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onTokenRef.current = onToken;
    onErrorRef.current = onError;
  }, [onToken, onError]);

  useEffect(() => {
    if (!ready || !TURNSTILE_SITE_KEY) return;
    const api = window.turnstile;
    const el = boxRef.current;
    if (!api || !el || widgetIdRef.current) return;

    /*
      부모 상자에 300px이 안 들어가면 작은 것을 쓴다. 폼의 안쪽 여백까지는 써도
      되므로(아래 `margin-inline`) 여백을 포함한 폭으로 잰다 — 랜딩 히어로 폼은
      화면 폭 342px 아래에서 작은 것이 된다. 그릴 때 한 번 정하고, 그 뒤 화면을
      돌리거나 줄여 넘치면 가운데 놓인 채 양옆으로 나간다.
    */
    const room = el.parentElement?.clientWidth ?? NORMAL_W;
    const compact = room < NORMAL_W;
    el.style.setProperty("--turnstile-w", `${compact ? COMPACT_W : NORMAL_W}px`);

    widgetIdRef.current = api.render(el, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: "dark",
      size: compact ? "compact" : "normal",
      /*
        정상 트래픽에는 위젯을 그리지 않는다. 검증은 그대로 돌고 토큰도 그대로
        받되, Cloudflare가 실제로 사람 확인을 요구할 때만 위젯이 나타난다.
        히어로 폼에 65px짜리 상자를 상시 띄우지 않으려는 판단이다.

        "always"(기본)로 되돌리면 다시 상시 노출된다. 봇 차단 강도는
        이 옵션과 무관하다 — 관리형 모드의 판정은 동일하게 수행된다.
      */
      appearance: "interaction-only",
      callback: (token) => onTokenRef.current(token),
      // 토큰은 유효기간이 있다. 만료되면 없는 것으로 되돌려 제출을 막는다.
      // 만료는 스스로 다시 받아오므로 실패로 알리지 않는다.
      "expired-callback": () => onTokenRef.current(null),
      "error-callback": () => {
        onTokenRef.current(null);
        onErrorRef.current?.();
      },
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
      {/*
        ⚠️ 상자의 고정 폭이 **바깥 레이아웃을 벌리지 못하게 한다.** 그냥 두면 부모가
        상자 폭만큼 벌어지고, 그 최소 폭이 그리드 열까지 올라가 화면 밖으로 밀어낸다 —
        랜딩 히어로가 폭 381px 이하에서 그랬다(360px 폰에서 폼 안쪽은 278px인데
        상자가 300px이라 왼쪽 열이 통째로 342px로 굳어, 버튼과 폼 테두리가 잘렸다).

        · `contain: inline-size` — 이 칸의 내용 폭을 바깥의 폭 계산에서 뺀다.
        · `margin-inline` — 자리가 상자보다 좁으면 가운데 놓고 양옆 여백으로 내보낸다.
          자리가 넉넉하면 0이라 지금까지처럼 왼쪽에 붙는다.

        `interaction-only`라 평소에는 상자가 없다. 사람 확인을 요구받을 때만 해당한다.
      */}
      <div
        ref={boxRef}
        style={{
          contain: "inline-size",
          marginInline: `min(0px, calc((100% - var(--turnstile-w, ${NORMAL_W}px)) / 2))`,
        }}
      />
    </>
  );
}
