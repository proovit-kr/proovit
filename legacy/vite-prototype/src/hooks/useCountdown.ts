import { useEffect, useState } from 'react';
import { pad2 } from '@/utils/format';

export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** HH:MM:SS */
  clock: string;
  done: boolean;
}

/** 목표 시각까지 1초 단위 실시간 카운트다운 (일:시:분:초) */
export function useCountdown(targetIso: string): Countdown {
  const target = new Date(targetIso).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const diff = Math.max(0, target - now);
  const days = Math.floor(diff / 864e5);
  const hours = Math.floor(diff / 36e5) % 24;
  const minutes = Math.floor(diff / 6e4) % 60;
  const seconds = Math.floor(diff / 1e3) % 60;

  return {
    days,
    hours,
    minutes,
    seconds,
    clock: `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`,
    done: diff === 0,
  };
}
