import { useState, type ReactNode } from 'react';
import styles from './Accordion.module.css';

export interface FaqItem {
  q: string;
  a: string;
}

/** FAQ 아코디언 — 한 번에 하나만 열린다 */
export function Accordion({ items, defaultOpen = 0 }: { items: FaqItem[]; defaultOpen?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      {items.map((item, i) => (
        <div className={styles.item} key={item.q}>
          <button
            className={styles.head}
            onClick={() => setOpen((cur) => (cur === i ? -1 : i))}
            aria-expanded={open === i}
          >
            <span>{item.q}</span>
            <span className={[styles.chev, open === i ? styles.chevOpen : ''].join(' ')}>
              +
            </span>
          </button>
          {open === i && <div className={styles.body}>{item.a}</div>}
        </div>
      ))}
    </div>
  );
}

/** 단일 접이식 패널 (운영자 콘솔 AI 리포트) */
export function Collapsible({
  title,
  children,
  ops,
}: {
  title: string;
  children: ReactNode;
  ops?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={[styles.item, ops ? styles.opsItem : ''].join(' ')}>
      <button
        className={[styles.head, ops ? styles.opsHead : ''].join(' ')}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{title}</span>
        <span className={[styles.chev, open ? styles.chevOpen : ''].join(' ')}>+</span>
      </button>
      {open && <div className={[styles.body, ops ? styles.opsBody : ''].join(' ')}>{children}</div>}
    </div>
  );
}
