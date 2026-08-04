import type { ReactNode } from 'react';
import { useCountUp } from '@/hooks/useCountUp';
import { useInView } from '@/hooks/useInView';
import styles from './StatCounter.module.css';

export interface StatItem {
  label: string;
  /** 숫자를 카운트업할 경우 */
  value?: number;
  /** 숫자를 문자열로 감쌀 때 (예: v => `₩${v}`) */
  format?: (value: number) => string;
  /** 카운트업 없이 그대로 보여줄 값 */
  text?: string;
}

function Cell({ item, run }: { item: StatItem; run: boolean }) {
  const counted = useCountUp(item.value ?? 0, 1400, run && item.value !== undefined);
  const display =
    item.text !== undefined
      ? item.text
      : item.format
        ? item.format(counted)
        : counted.toLocaleString('ko-KR');
  return (
    <div className={styles.cell}>
      <div className={styles.value}>{display}</div>
      <div className={styles.label}>{item.label}</div>
    </div>
  );
}

/** 신뢰 지표 스트립 — 뷰포트에 들어오면 카운트업 */
export function StatCounter({ items }: { items: StatItem[] }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  return (
    <div className={styles.grid} ref={ref}>
      {items.map((item) => (
        <Cell key={item.label} item={item} run={inView} />
      ))}
    </div>
  );
}

/** 시즌 정보처럼 카운트업 없이 값만 나열하는 스트립 */
export function InfoStrip({
  items,
}: {
  items: { label: string; value: ReactNode; accent?: boolean }[];
}) {
  return (
    <div className={styles.grid}>
      {items.map((item) => (
        <div key={item.label} className={`${styles.cell} ${styles['cell--left']}`}>
          <div className={`${styles.label} ${styles['label--top']}`}>{item.label}</div>
          <div
            className={`${styles.value} ${styles['value--plain']}`}
            style={item.accent ? { color: 'var(--c-lime)' } : undefined}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
