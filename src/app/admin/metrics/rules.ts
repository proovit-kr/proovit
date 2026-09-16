/*
  지표 검토의 **순수** 절반. DB도 세션도 모른다.

  admin.ts / admin-store.ts를 가른 것과 같은 이유다(lib/admin.ts 머리 주석) —
  판정 규칙을 조회 파일에 두면 클라이언트가 한 줄 가져다 쓰는 순간 prisma가
  번들에 딸려간다.

  ⚠️ **여기가 「무엇을 사람이 봐야 하는가」의 정의다.** 전 팀을 손으로 확인하지
  않는다(PLN3 2장). 자동 집계를 믿되, 아래 넷 중 하나라도 걸린 날만 큐에 올린다.
  기준을 느슨하게 잡으면 큐가 전수 검사가 되고, 조이면 놓친다.
*/

/** 한 줄(팀 하루)의 집계에서 판정에 필요한 값만 추린 것 */
export type MetricRow = {
  /** 보정 전 방문 */
  rawVisitors: number;
  /** 채점에 들어가는 값 */
  validVisitors: number;
  /** 무효율의 분모(스키마 metric_daily.sessions 주석) */
  sessions: number;
  botFiltered: number;
  spikeTrimmed: number;
  /**
   * 유입 채널 비중의 제곱합. 1에 가까울수록 한 채널에 몰려 있다.
   * 채널 자료가 없는 날은 null — 그 날은 이 규칙을 적용하지 않는다.
   */
  channelHhi: number | null;
};

/*
  ⚠️ 이 숫자들은 **운영 기준이지 법이 아니다.** 시즌 중에 조정될 수 있고,
  조정하면 그 근거를 여기 주석에 남긴다. 화면 여러 곳에 흩어 두면 어느 값이
  실제로 쓰였는지 아무도 모르게 된다.
*/

/** 무효 세션 비율. 스키마 metric_daily.sessions 주석이 정한 값이다. */
export const INVALID_RATE_MAX = 0.6;
/** 봇 필터가 원시 방문에서 걷어낸 비중 */
export const BOT_RATE_MAX = 0.3;
/** 유입 채널 집중도(HHI). 0.8이면 사실상 한 채널이다. */
export const HHI_MAX = 0.8;

function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

/**
 * 이 줄을 사람이 봐야 하는 이유.
 *
 * 빈 배열이면 자동 집계를 그대로 믿는다. 이유가 하나라도 있으면 큐에 올린다 —
 * 그리고 **그 문장이 곧 참가자에게 설명할 말**이 된다. 그래서 "이상함" 같은
 * 판정이 아니라 관측한 수를 적는다.
 */
export function flagReasons(row: MetricRow): string[] {
  const reasons: string[] = [];

  /* 기간 중위값의 20배를 넘겨 잘라낸 날 — 급증 자체가 판단 대상이다 */
  if (row.spikeTrimmed > 0) {
    reasons.push(`급증 구간 절단 ${row.spikeTrimmed.toLocaleString("ko-KR")}건`);
  }

  if (row.sessions > 0) {
    const invalid = 1 - row.validVisitors / row.sessions;
    if (invalid > INVALID_RATE_MAX) {
      reasons.push(`무효 세션 비율 ${Math.round(invalid * 100)}%`);
    }
  }

  if (row.rawVisitors > 0 && row.botFiltered / row.rawVisitors > BOT_RATE_MAX) {
    reasons.push(
      `봇 트래픽 제외 ${row.botFiltered.toLocaleString("ko-KR")}건, 원시의 ${percent(row.botFiltered, row.rawVisitors)}%`,
    );
  }

  if (row.channelHhi !== null && row.channelHhi > HHI_MAX) {
    reasons.push(`단일 채널 집중, HHI ${row.channelHhi.toFixed(2)}`);
  }

  return reasons;
}

/**
 * 채널별 방문에서 HHI를 낸다. 비중의 제곱합이다.
 *
 * 채널이 하나면 1, 넷으로 고르게 갈리면 0.25. 합이 0인 날은 잴 것이 없어 null.
 */
export function channelHhi(visitors: number[]): number | null {
  const total = visitors.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  return visitors.reduce((sum, value) => sum + (value / total) ** 2, 0);
}
