"use client";

/*
  ⚠️ 클라이언트 컴포넌트다. `useReducedMotion`이 matchMedia를 보기 때문이고,
  그 값 없이는 그리기 애니메이션을 끌 수 없다. 서버 컴포넌트인 참가작 상세가
  이걸 그대로 부를 수 있게 여기서 경계를 긋는다.
*/

import { useReducedMotion } from '@/hooks/useReducedMotion';

interface Props {
  /** 일별 값. **큰 값이 위로** 간다 — 화면에서 뒤집을 필요가 없다 */
  values: number[];
  className?: string;
  delaySec?: number;
}

/*
  시안 `#scr-project`(1832행)의 뷰박스와 두 극값을 그대로 쓴다.

    viewBox="0 0 100 32" preserveAspectRatio="none"
    정상   points="0,27 … 100,4"   stroke var(--accent) stroke-width 2
    미배포 points="0,29 100,29"    stroke var(--faint)

  그래서 최댓값은 y=4, 0은 y=27에 놓이고, 잴 값이 아예 없으면 y=29의
  평평한 선 하나가 된다. 높이·폭은 `.spark`가 CSS로 정한다.
*/
const W = 100;
const H = 32;
const TOP = 4;
const BASE = 27;
const FLAT = 29;

export function Sparkline({ values, className, delaySec = 0 }: Props) {
  const reduced = useReducedMotion();
  const max = values.length ? Math.max(...values) : 0;

  /* 들어온 값이 전부 0이면 추이가 아니라 「아직 없음」이다 — 평평한 선 */
  const flat = max === 0;
  const step = values.length > 1 ? W / (values.length - 1) : W;
  const points = flat
    ? `0,${FLAT} ${W},${FLAT}`
    : values
        .map((v, i) => `${Math.round(i * step)},${(BASE - (v / max) * (BASE - TOP)).toFixed(1)}`)
        .join(' ');

  /* 선 길이를 정확히 알 수 없으니 넉넉히 잡는다. 남는 dash는 보이지 않는다 */
  const dash = Math.round(W * 1.4);

  return (
    <svg
      className={className}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={flat ? 'var(--faint)' : 'var(--accent)'}
        strokeWidth={2}
        style={
          /*
            ⚠️ 평평한 선은 그리지 않는다 — 없는 추이를 그리는 시늉이 된다.

            시안은 화면이 들어올 때 `stroke-dashoffset`을 전이로 0까지 민다
            (3367행). 우리는 같은 모양을 CSS 애니메이션으로 한다 — 서버에서
            그린 뒤 JS 없이 도는 쪽이 이 페이지에 맞는다.
          */
          reduced || flat
            ? undefined
            : {
                strokeDasharray: dash,
                strokeDashoffset: dash,
                animation: `drawLine 0.9s cubic-bezier(0.3, 0.7, 0.2, 1) ${delaySec}s forwards`,
              }
        }
      />
    </svg>
  );
}
