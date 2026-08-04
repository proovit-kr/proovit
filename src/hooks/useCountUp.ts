import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

/** 0 → target 까지 ease-out 카운트업. reduced-motion이면 즉시 target */
export function useCountUp(target: number, duration = 1400, start = true): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced || !start ? target : 0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!start) return;
    if (reduced) {
      setValue(target);
      return;
    }
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else setValue(target);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, reduced, start]);

  return value;
}
