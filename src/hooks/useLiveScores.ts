import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

interface Live {
  scores: number[];
  /** 방금 올라간 행 (롤 애니메이션용) */
  rollIndex: number;
}

/**
 * 리더보드 실시간 증가 목 시뮬레이션.
 * 위 순위를 추월하지 않도록 증가폭을 제한해 순서가 항상 유효하게 유지된다.
 */
export function useLiveScores(initial: number[], enabled = true): Live {
  const reduced = useReducedMotion();
  const initialKey = initial.join(',');
  const [scores, setScores] = useState(initial);
  const [rollIndex, setRollIndex] = useState(-1);
  const scoresRef = useRef(initial);

  useEffect(() => {
    const base = initialKey ? initialKey.split(',').map(Number) : [];
    scoresRef.current = base;
    setScores(base);
  }, [initialKey]);

  useEffect(() => {
    if (!enabled || reduced || !initialKey) return;

    const timers: number[] = [];
    let alive = true;

    const tick = () => {
      if (!alive) return;
      const prev = scoresRef.current;
      const i = Math.floor(Math.random() * prev.length);
      const cur = prev[i];
      const ceil = i > 0 ? prev[i - 1] - 1 : Number.POSITIVE_INFINITY;
      const inc = Math.min(1 + Math.floor(Math.random() * 6), Math.max(0, ceil - cur));

      if (inc > 0) {
        const next = prev.slice();
        next[i] = cur + inc;
        scoresRef.current = next;
        setScores(next);
        setRollIndex(i);
        timers.push(window.setTimeout(() => setRollIndex(-1), 240));
      }
      timers.push(window.setTimeout(tick, 4000 + Math.random() * 2000));
    };

    timers.push(window.setTimeout(tick, 4500));

    return () => {
      alive = false;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [enabled, reduced, initialKey]);

  return { scores, rollIndex };
}
