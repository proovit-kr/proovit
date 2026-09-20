/*
  잠정 순위의 줄 세우기.

  ⚠️ **prisma를 안 부르는 파일로 떼어 둔다.** 순위 규칙은 DB 없이 검사해야 하는
  종류이고(`__tests__/rollup.test.ts`), `lib/rollup.ts`를 import하면 프리즈마가
  DATABASE_URL을 요구해 테스트가 통째로 안 돈다.
*/

/** 줄 세우기에 필요한 것만. 순수 함수로 떼어 두어 테스트가 DB 없이 돈다 */
export type RankInput = {
  entryId: string;
  validVisitors: number;
  revenue: bigint;
  /** 동점 셋째 기준. 신청 시각이 없으면 행이 생긴 시각 */
  appliedAt: Date;
};

/**
 * 잠정 순위 — 유효 이용자 내림차순.
 *
 * 같으면 매출이 큰 팀, 그다음은 먼저 신청한 팀이 앞이다. 기준서의 최종 동점
 * 처리는 R1 → T2 → 유료 결제자 수 → 최종 제출 시각인데, 잠정 단계에는 R·T가
 * 없어서 같은 뜻의 값으로 줄였다(매출 = R1의 입력, 신청 시각 = 빠른 팀 우선).
 */
export function rankProvisional<T extends RankInput>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      b.validVisitors - a.validVisitors ||
      (b.revenue > a.revenue ? 1 : b.revenue < a.revenue ? -1 : 0) ||
      a.appliedAt.getTime() - b.appliedAt.getTime(),
  );
}
