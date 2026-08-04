export const pad2 = (n: number) => String(n).padStart(2, '0');

export const formatNumber = (n: number) => n.toLocaleString('ko-KR');

export const formatKRW = (n: number) => `₩${n.toLocaleString('ko-KR')}`;

/** +18% / -4% 형태 */
export const formatDelta = (pct: number) => `${pct > 0 ? '+' : ''}${pct}%`;

export const formatPct = (pct: number) => `${pct}%`;

/** 방문자 대비 신청자 전환율 — 제출 폼에서 실시간 계산 */
export const conversionOf = (visitors: number, signups: number): number | null => {
  if (!visitors || visitors <= 0) return null;
  return Number(((signups / visitors) * 100).toFixed(1));
};

export const formatConversion = (visitors: number, signups: number): string => {
  const value = conversionOf(visitors, signups);
  return value === null ? '—' : `${value}%`;
};

export const initialOf = (name: string) => name.trim().slice(0, 1);
