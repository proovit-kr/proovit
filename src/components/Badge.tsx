import type { ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeTone =
  | 'lime'
  | 'limeOutline'
  | 'gold'
  | 'warn'
  | 'danger'
  | 'neutral'
  | 'outline'
  | 'violet'
  | 'teal'
  | 'blue';

interface Props {
  tone?: BadgeTone;
  pill?: boolean;
  /** 점선 테두리 — 「아직 확정 아님」. 협의 중·발급 예정에 쓴다 */
  dashed?: boolean;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'lime', pill, dashed, children, className }: Props) {
  return (
    <span
      className={[
        styles.badge,
        styles[tone],
        pill ? styles.pill : '',
        dashed ? styles.dashed : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  );
}

/** 리더보드·참가작에서 반복되는 "✓ 검증됨" 뱃지 */
export function VerifiedBadge() {
  return <Badge tone="lime">✓ 검증됨</Badge>;
}

export function PendingBadge() {
  return <Badge tone="neutral">검토 중</Badge>;
}

export function RevenueBadge() {
  return <Badge tone="gold">₩ 매출 발생</Badge>;
}
