import { useCallback, useEffect, useRef, useState } from 'react';
import { Clauses } from './Clauses';
import styles from './Toast.module.css';

/*
  시안 `#toast`처럼 늘 붙어 있고 `.on`으로 드나든다. 비었을 때 떼어 버리면
  나갈 때 전환(0.25s)이 없고, `role="status"`도 내용보다 먼저 있어야 스크린리더가 읽는다.
*/
export function Toast({ message }: { message: string | null }) {
  /* 사라지는 동안에도 글자가 남아 있어야 한다 — 마지막 문구를 쥐고 있는다 */
  const [last, setLast] = useState(message);
  if (message && message !== last) setLast(message);

  /*
    문장 단위로 끊는다. 토스트 폭은 `left: 50%` 때문에 화면의 절반까지라 390px에서
    195px이 되고, 그대로 흘리면 「동의를 저장했어요. 보던 / 페이지로 돌아왔어요」가 된다.
  */
  const text = message ?? last;
  return (
    <div className={`${styles.toast} ${message ? styles.on : ''}`} role="status">
      {text ? <Clauses text={text} /> : null}
    </div>
  );
}

/** 일정 시간 뒤 사라지는 토스트 상태. 시안 `showToast`가 2.4초다 */
export function useToast(duration = 2400) {
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
