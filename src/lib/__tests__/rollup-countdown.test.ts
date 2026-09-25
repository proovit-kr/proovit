import { describe, expect, it } from "vitest";

import { untilNextRollup } from "@/app/seasons/[slug]/leaderboard/UpdatedAt";

/*
  「집계 시작됨, 첫 갱신까지 N분」의 N. 롤업이 벽시계 15분 격자(:00 :15 :30 :45)
  에서 도니까 첫 결과는 레이스가 시작된 뒤 **다음 격자 칸**이다(2026-09-20 수연 지시,
  기준은 09-26부터 s4 달력 시작일이 아니라 가장 이른 레이스 시작). 그 시각이
  지나도 멈추지 않고 다음 칸을 가리킨다.

  아래 `opens`는 서울 00:00이라 격자 위에 있다 — 옛 계산(시작 + n주기)과 답이
  같은 경우다. 격자 밖의 시작은 맨 아래 묶음이 본다(2026-09-26 리뷰 지적).
*/
const MIN = 60_000;
const opens = new Date("2026-11-02T00:00:00+09:00").getTime();
const at = (ms: number) => untilNextRollup(opens, opens + ms) / MIN;

describe("다음 롤업까지", () => {
  it("레이스 시작 전에는 시작 뒤 한 주기까지 센다", () => {
    /* 시작 10분 전 → 10분 + 15분 */
    expect(at(-10 * MIN)).toBe(25);
  });

  it("시작 직후는 15분이다", () => {
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

describe("격자 밖에서 시작해도 벽시계 격자를 따른다", () => {
  /* 제출 시각은 아무 분·초다 — 21:14:37에 낸 팀의 첫 롤업은 21:15다 */
  const start = new Date("2026-10-27T21:14:37+09:00").getTime();
  const KST = (hms: string) => new Date(`2026-10-27T${hms}+09:00`).getTime();
  const left = (hms: string) => untilNextRollup(start, KST(hms));

  it("시작 직후는 다음 격자 칸까지다 — 한 주기가 아니다", () => {
    expect(left("21:14:37")).toBe(23_000);
    expect(left("21:14:40")).toBe(20_000);
  });

  it("그 칸을 지나면 벽시계 격자를 따라간다", () => {
    expect(left("21:15:00")).toBe(15 * MIN);
    expect(left("21:20:00")).toBe(10 * MIN);
    expect(left("21:44:59")).toBe(1_000);
  });

  it("시작 전이면(개발 시계) 시작 뒤 첫 칸까지다", () => {
    expect(left("21:10:00")).toBe(5 * MIN);
  });
});
