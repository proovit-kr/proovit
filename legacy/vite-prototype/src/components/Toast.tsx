import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './Toast.module.css';

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className={styles.toast} role="status">
      {message}
    </div>
  );
}

/** 일정 시간 뒤 사라지는 토스트 상태 */
export function useToast(duration = 3200) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const show = useCallback(
    (text: string) => {
      setMessage(text);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setMessage(null), duration);
    },
    [duration],
  );

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  return { message, show };
}
