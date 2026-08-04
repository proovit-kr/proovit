import type { TickerItem } from '@/types';
import styles from './Ticker.module.css';

/** 전광판 티커 — 무한 흐름, 호버 시 정지 */
export function Ticker({ items }: { items: TickerItem[] }) {
  const group = (key: string) => (
    <div className={styles.group} key={key}>
      {items.map((item) => (
        <span key={`${key}-${item.id}`}>
          {item.text} <span className={styles[item.tone]}>{item.highlight}</span>
        </span>
      ))}
      <span className={styles.sep}>·</span>
    </div>
  );

  return (
    <div className={styles.wrap} aria-label="실시간 소식">
      {/* 같은 그룹을 두 번 깔아 -50% 이동으로 무한 루프를 만든다 */}
      <div className={styles.track}>
        {group('a')}
        {group('b')}
      </div>
    </div>
  );
}
