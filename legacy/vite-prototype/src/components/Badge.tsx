import type { ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeTone =
  | 'lime'
  | 'limeOutline'
  | 'gold'
  | 'warn'
  | 'danger'
  | 'neutral'
  | 'outline';

interface Props {
  tone?: BadgeTone;
  pill?: boolean;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'lime', pill, children, className }: Props) {
  return (
    <span
      className={[styles.badge, styles[tone], pill ? styles.pill : '', className ?? '']
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
