import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Badge.module.css';

/* 시안 `.bd-*` 일곱이 전부다 */
type SpecTone = 'lime' | 'red' | 'gray' | 'warn' | 'blue' | 'violet' | 'teal';

/*
  ⚠️ 임시 별칭 — 시안 이식이 끝나면 지운다. Button의 LEGACY와 같은 이유다.

    limeOutline → lime  시안의 lime은 이미 테두리가 있다
    danger      → red
    neutral     → gray
    outline     → gray
    gold        → warn  시안에 금색이 없다. 수상 뱃지도 lime을 쓴다

  진행: `grep -rE 'tone="(limeOutline|danger|neutral|outline|gold)"' src` 가 비면 삭제.
*/
const LEGACY: Record<string, SpecTone> = {
  limeOutline: 'lime',
  danger: 'red',
  neutral: 'gray',
  outline: 'gray',
  gold: 'warn',
};

export type BadgeTone =
  | SpecTone
  | 'limeOutline'
  | 'danger'
  | 'neutral'
  | 'outline'
  | 'gold';

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  /** 점선 테두리 — 「아직 확정 아님」. 시안 `.bd-dash` */
  dashed?: boolean;
  children: ReactNode;
};

export function Badge({ tone = 'lime', dashed, children, className, ...rest }: Props) {
  return (
    <span
      className={[
        styles.badge,
        styles[LEGACY[tone] ?? tone],
        dashed ? styles.dashed : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </span>
  );
}
