"use client";

import { useSyncExternalStore } from "react";

/*
  갱신 시각 — 시안 `.upd`(1617행) 「12분 전 갱신, 롤업 주기 15분」.

  ⚠️ **날짜가 아니라 상대 시간이다.** 한때 `10.19 갱신`으로 그렸는데, 시안이
  「12분 전」이라고 쓴 것은 시각을 알리려는 게 아니라 **「지금 도는 중」**을
  말하려는 것이다. 날짜로 바꾸면 그 뜻이 사라진다(2026-09-06 수연 지적).

  ⚠️ 그래서 클라이언트에서 다시 계산한다. 서버에서만 만들면 캐시에 「12분 전」이
  박혀 한참 뒤에도 그대로 보인다.

  서버가 그린 첫 값은 `renderedAt`(표를 읽은 시각) 기준이다. 화면에서
  `Date.now()`를 부를 수 없어(`react-hooks/purity`) `loadLeaderboard`가 함께
  돌려준다.
*/

/*
  시계 하나를 이 화면의 모든 상대 시각이 나눠 쓴다. `useEffect` + `setState`
  대신 `useSyncExternalStore`를 쓰는 것은 리액트가 효과 안의 즉시 setState를
  막기 때문이고(`react-hooks/set-state-in-effect`), 스냅샷이 안정적이어야
  다시 그리기가 무한히 돌지 않아서다 — `Date.now()`를 바로 돌려주면 안 된다.
*/
let current = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  timer ??= setInterval(() => {
    current = Date.now();
    for (const l of listeners) l();
  }, 30_000);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** 「14분」·「3시간」·「7일」. 시안은 분 단위만 보여주지만 단위는 거리에 맞춘다 */
function span(sec: number): string {
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 60) return `${min}분`;
  const hour = Math.round(min / 60);
  if (hour < 24) return `${hour}시간`;
  return `${Math.round(hour / 24)}일`;
}

/** 시안 문구를 그대로 쓴다 — 「방금」·「n분 전」·「n시간 전」·「n일 전」 */
function ago(iso: string, now: number): string {
  const sec = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  return sec < 60 ? "방금" : `${span(sec)} 전`;
}

export function UpdatedAt({
  iso,
  renderedAt,
}: {
  /** 스냅샷 시각(ISO) */
  iso: string;
  /** 서버가 이 화면을 그린 시각. 첫 렌더가 이 값을 쓴다 */
  renderedAt: number;
}) {
  const now = useSyncExternalStore(subscribe, () => current, () => renderedAt);
  /*
    서버와 클라이언트가 각자의 시계로 계산해 값이 다를 수 있다. 오류가 아니라
    이 컴포넌트가 하는 일 자체다.
  */
  return <span suppressHydrationWarning>{ago(iso, now)} 갱신</span>;
}

/** 롤업 주기(분). 갱신 줄의 「롤업 주기 15분」과 첫 갱신 시각이 같은 값을 쓴다 */
export const ROLLUP_MINUTES = 15;

/*
  첫 갱신까지 남은 시간 — 시안 `.lb-empty .big`(1624행)
  「집계 시작됨, 첫 갱신까지 <b>14분</b>」.

  ⚠️ **기준은 s4가 열리고 한 주기(15분) 뒤다**(2026-09-20 수연 지시). 트래픽은
  s4부터 쌓이고 롤업이 15분마다 도니까, 첫 집계 결과는 s4 시작 15분 뒤에 나온다.
  그전까지는 s4가 열렸는지와 무관하게 남은 시간을 그대로 센다 — s4가 며칠 뒤면
  「7일」처럼 단위가 커진다. (09-06에는 s4가 열리는 시각 자체를 기준으로 뒀다.)

  ⚠️ 롤업은 아직 없다. 주기 15분은 결정된 값이고 구현만 남았다 —
  `leaderboardSnapshot`을 쓰는 코드는 dev 샌드박스뿐이다.

  그 시각이 지났는데도 스냅샷이 없으면 **롤업이 늦은 것이다.** 다음 주기를
  가리키면 숫자가 15분마다 되살아나 「곧 나온다」고 거짓말을 하게 되므로,
  기다린다고만 쓴다.
*/
export function FirstRollup({
  iso,
  renderedAt,
}: {
  /** s4가 열리는 시각(ISO). 미정이면 null */
  iso: string | null;
  renderedAt: number;
}) {
  const now = useSyncExternalStore(subscribe, () => current, () => renderedAt);
  const left = iso
    ? new Date(iso).getTime() + ROLLUP_MINUTES * 60_000 - now
    : -1;
  if (left <= 0) return <>집계 시작됨, 첫 갱신을 기다려요</>;
  return (
    <span suppressHydrationWarning>
      집계 시작됨, 첫 갱신까지 <b>{span(left / 1000)}</b>
    </span>
  );
}
