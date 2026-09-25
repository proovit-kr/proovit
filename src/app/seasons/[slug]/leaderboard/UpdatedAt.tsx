"use client";

import { useSyncExternalStore } from "react";

import { ROLLUP_MINUTES } from "@/lib/rollup-period";

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

/*
  롤업 주기(분). 갱신 줄의 「롤업 주기 15분」과 첫 갱신 시각이 같은 값을 쓴다.
  정의는 `lib/rollup-period.ts`에 있다 — 서버 타이머와 나눠 쓰는 값이라
  `"use client"`인 이 파일에 둘 수 없다. 부르는 쪽이 여기서 가져다 쓰던 것을
  그대로 두려고 다시 내보낸다.
*/
export { ROLLUP_MINUTES };

/*
  첫 갱신까지 남은 시간 — 시안 `.lb-empty .big`(1624행)
  「집계 시작됨, 첫 갱신까지 <b>14분</b>」.

  ⚠️ **기준은 첫 팀이 레이스를 시작한 뒤 처음 오는 롤업 격자 칸이다.** 롤업은
  벽시계 15분 격자(:00 :15 :30 :45)에서 돈다(vercel.json 크론, 개발은
  lib/dev-rollup.ts). 그래서 첫 집계 결과는 시작 뒤 **다음 격자 칸**에 나온다 —
  시작 15분 뒤가 아니다. 21:14:37에 시작하면 21:15다.
  옛 기준: 「s4가 열리고 한 주기 뒤(2026-09-20 수연 지시). 트래픽은 s4부터 쌓인다.」
  → 2026-09-26 뒤집음: 집계가 팀별이 되어(수연 지시 「팀별 집계로 바꿔」, lib/race.ts)
  시작은 그 팀이 s3을 처음 낸 때다. 이 화면이 보이는 것 자체가 한 팀이라도 시작했다는
  뜻이라(리더보드 공개 판정) 가장 이른 시작을 센다. 옛 기준(s4 opens_at 00:00)은
  마침 격자 위에 있어 「시작 + 한 주기」로 맞았지만, 제출 시각은 아무 분·초라
  그대로 두면 N이 최대 15분 틀린다(2026-09-26 리뷰 지적) — 그래서 격자를 벽시계에
  맞췄다.

  ⚠️ 그 시각이 지났는데도 집계가 없으면 **다음 주기를 가리킨다**(2026-09-20 수연
  지시). 한때 「첫 갱신을 기다려요」로만 뒀는데, 그때는 롤업이 구현 전이라
  남은 시간을 말하면 거짓이 되기 때문이었다. 지금은 15분마다 실제로 돌므로
  (`lib/rollup.ts`, 외부 크론) 다음 롤업 시각이 곧 사실이다.

  그래서 이 화면이 오래 머물러 있으면 그 자체가 **크론이 멈췄다는 신호**다 —
  롤업은 지표가 0이어도 스냅샷을 쓰고, 그 순간 이 화면은 순위표로 바뀐다.
*/
export function FirstRollup({
  iso,
  renderedAt,
}: {
  /** 가장 이른 레이스 시작(ISO). 없으면 null */
  iso: string | null;
  renderedAt: number;
}) {
  const now = useSyncExternalStore(subscribe, () => current, () => renderedAt);
  if (!iso) return <>집계 시작됨, 첫 갱신을 기다려요</>;

  const left = untilNextRollup(new Date(iso).getTime(), now);
  return (
    <span suppressHydrationWarning>
      집계 시작됨, 첫 갱신까지 <b>{span(left / 1000)}</b>
    </span>
  );
}

/**
 * 다음 롤업까지 남은 밀리초 — 벽시계 15분 격자(에포크 기준, :00 :15 :30 :45)의
 * 다음 칸까지다. 레이스 시작 전이면(개발 시계) **시작 뒤 첫 칸**까지다.
 * `startAt`은 가장 이른 레이스 시작이다(위 `FirstRollup` 주석).
 *
 * 격자 칸 위에 정확히 있으면 그 칸은 방금 돌았다고 보고 다음 칸을 가리킨다 —
 * 그래서 늘 0보다 크고 한 주기 이하다.
 */
export function untilNextRollup(
  startAt: number,
  now: number,
  periodMinutes: number = ROLLUP_MINUTES,
): number {
  const period = periodMinutes * 60_000;
  /*
    옛 계산은 격자를 시작 시각에서 세웠다(시작 + n주기). 시작이 격자 위(s4 opens_at
    00:00)일 때만 맞았다 — 에포크가 UTC 정각이고 서울은 +9시간이라 15분 격자는
    서울 시각으로도 :00 :15 :30 :45다.
  */
  const from = Math.max(now, startAt);
  return (Math.floor(from / period) + 1) * period - now;
}
