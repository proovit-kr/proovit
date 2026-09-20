import { describe, expect, it } from "vitest";

import { untilNextRollup } from "@/app/seasons/[slug]/leaderboard/UpdatedAt";

/*
  「집계 시작됨, 첫 갱신까지 N분」의 N. 롤업이 15분마다 도니까 첫 결과는
  s4가 열린 뒤 한 주기다(2026-09-20 수연 지시). 그 시각이 지나도 멈추지 않고
  다음 주기를 가리킨다.
*/
const MIN = 60_000;
const opens = new Date("2026-11-02T00:00:00+09:00").getTime();
const at = (ms: number) => untilNextRollup(opens, opens + ms) / MIN;

describe("다음 롤업까지", () => {
  it("s4가 열리기 전에는 열린 뒤 한 주기까지 센다", () => {
    /* 열리기 10분 전 → 10분 + 15분 */
    expect(at(-10 * MIN)).toBe(25);
  });

  it("열린 직후는 15분이다", () => {
    expect(at(0)).toBe(15);
    expect(at(1 * MIN)).toBe(14);
  });

  it("첫 갱신 시각을 지나면 다음 주기를 가리킨다", () => {
    expect(at(15 * MIN)).toBe(15);
    expect(at(16 * MIN)).toBe(14);
    /* 크론이 멈춰 한참 지나도 0이나 음수가 되지 않는다 */
    expect(at(3 * 60 * MIN + 2 * MIN)).toBe(13);
  });

  it("남은 시간은 늘 0보다 크고 한 주기 이하다", () => {
    for (let m = -120; m <= 600; m += 7) {
      const left = at(m * MIN);
      expect(left, `${m}분`).toBeGreaterThan(0);
      if (m >= 0) expect(left, `${m}분`).toBeLessThanOrEqual(15);
    }
  });
});
