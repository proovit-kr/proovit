import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "./useReducedMotion";

/**
 * 0 → target 까지 ease-out 카운트업. reduced-motion이면 즉시 target.
 *
 * 프로토타입은 이펙트 본문에서 setState를 불러 애니메이션을 건너뛰었는데,
 * 그러면 렌더가 연쇄로 도는 데다 lint(react-hooks/set-state-in-effect)에 걸린다.
 * 애니메이션을 건너뛰는 경우는 상태가 아니라 반환값에서 처리한다.
 */
export function useCountUp(target: number, duration = 1400, start = true): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!start || reduced) return;

    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      // setState가 이펙트 본문이 아니라 rAF 콜백에서 일어난다
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else setValue(target);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, reduced, start]);

  // 아직 시작 전이거나 모션을 줄이는 설정이면 최종값을 그대로 보여준다
  return reduced || !start ? target : value;
}
