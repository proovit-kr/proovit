import styles from './Tabs.module.css';

export interface TabItem<T extends string = string> {
  key: T;
  label: string;
}

interface Props<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (key: T) => void;
  className?: string;
}

/** 대시보드 상단 알약형 탭 */
export function Tabs<T extends string>({ items, value, onChange, className }: Props<T>) {
  return (
    <div className={[styles.tabs, className ?? ''].join(' ')} role="tablist">
      {items.map((item) => (
        <button
          key={item.key}
          role="tab"
          aria-selected={item.key === value}
          className={[styles.tab, item.key === value ? styles.active : ''].join(' ')}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** 로그인 / 회원가입 세그먼트 컨트롤 */
export function SegmentTabs<T extends string>({ items, value, onChange }: Props<T>) {
  return (
    <div className={styles.segment} role="tablist">
      {items.map((item) => (
        <button
          key={item.key}
          role="tab"
          aria-selected={item.key === value}
          className={[
            styles.segmentTab,
            item.key === value ? styles.segmentActive : '',
          ].join(' ')}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
