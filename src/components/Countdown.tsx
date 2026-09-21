"use client";

import { useEffect, useState } from "react";

/*
  마감까지 남은 시간 — 시안 `.hb-cd`의 「D-2 14:32:11」.

  ⚠️ **기준 시각을 서버가 준다.** 클라이언트가 `Date.now()`로 시작하면 개발에서
  옮겨 둔 시각(`devNow`)을 무시해 화면만 진짜 오늘을 본다. 서버가 남은 밀리초를
  계산해 주고 여기서는 흐르게만 한다 — 첫 렌더의 글자가 서버와 같아 하이드레이션도
  어긋나지 않는다.

  ⚠️ **D-n을 달력일 차이로 세지 않는다.** 헤더 배너의 D-n(`fmtDday`)은 달력
  기준이고 여기는 실제로 남은 시간이라, 마감 직전의 몇 시간에서 둘이 하루 갈릴
  수 있다. 여기서 세는 것은 「지금부터 몇 밤」이 아니라 「남은 시간」이다.
*/

const pad = (n: number) => String(n).padStart(2, "0");

export function formatRemain(ms: number): string {
  if (ms <= 0) return "마감";
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86_400);
  const rest = total % 86_400;
  const clock = `${pad(Math.floor(rest / 3600))}:${pad(Math.floor((rest % 3600) / 60))}:${pad(rest % 60)}`;
  return days > 0 ? `D-${days} ${clock}` : clock;
}

export function Countdown({
  remainMs,
  className,
}: {
  /** 서버가 잰 남은 밀리초 */
  remainMs: number;
  className?: string;
}) {
  const [left, setLeft] = useState(remainMs);
  /*
    서버가 새 기준을 주면 거기서 다시 흐른다. 렌더 중에 맞추는 것은 리액트가
    권하는 자리다 — 이펙트에서 setState하면 한 프레임 늦고 lint가 막는다
    (`Toast`의 마지막 문구와 같은 방식).
  */
  const [base, setBase] = useState(remainMs);
  if (base !== remainMs) {
    setBase(remainMs);
    setLeft(remainMs);
  }

  useEffect(() => {
    if (remainMs <= 0) return;
    const id = setInterval(() => {
      setLeft((prev) => (prev <= 1000 ? 0 : prev - 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [remainMs]);

  return (
    <div className={className} suppressHydrationWarning>
      {formatRemain(left)}
    </div>
  );
}
