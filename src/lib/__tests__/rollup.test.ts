import { describe, expect, it } from "vitest";

import { rankProvisional } from "@/lib/rollup-rank";

/*
  잠정 순위의 줄 세우기. DB 없이 도는 부분만 본다 — 집계 구간·트랜잭션은
  `runRollup`이 맡고, 여기서 지키려는 것은 **동점 처리 순서**다.
*/
const row = (
  entryId: string,
  validVisitors: number,
  revenue: number,
  applied: string,
) => ({
  entryId,
  validVisitors,
  revenue: BigInt(revenue),
  appliedAt: new Date(applied),
});

const order = (rows: ReturnType<typeof row>[]) =>
  rankProvisional(rows).map((r) => r.entryId);

describe("잠정 순위 — 유효 이용자 순", () => {
  it("유효 이용자가 많은 팀이 앞이다", () => {
    expect(
      order([
        row("a", 10, 0, "2026-10-01"),
        row("b", 300, 0, "2026-10-01"),
        row("c", 120, 0, "2026-10-01"),
      ]),
    ).toEqual(["b", "c", "a"]);
  });

  it("같으면 매출이 큰 팀이 앞이다", () => {
    expect(
      order([
        row("a", 100, 1000, "2026-10-01"),
        row("b", 100, 90000, "2026-10-01"),
      ]),
    ).toEqual(["b", "a"]);
  });

  it("매출까지 같으면 먼저 신청한 팀이 앞이다", () => {
    expect(
      order([
        row("늦게", 100, 0, "2026-10-02T10:00:00+09:00"),
        row("먼저", 100, 0, "2026-10-01T10:00:00+09:00"),
      ]),
    ).toEqual(["먼저", "늦게"]);
  });

  /* 집계 전에는 전원 0이다. 그때도 순서가 흔들리면 화면이 새로고침마다 바뀐다 */
  it("전원 0이어도 순서가 정해진다", () => {
    expect(
      order([
        row("나중", 0, 0, "2026-09-02"),
        row("처음", 0, 0, "2026-09-01"),
      ]),
    ).toEqual(["처음", "나중"]);
  });

  it("원본 배열을 건드리지 않는다", () => {
    const rows = [row("a", 1, 0, "2026-10-01"), row("b", 9, 0, "2026-10-01")];
    rankProvisional(rows);
    expect(rows.map((r) => r.entryId)).toEqual(["a", "b"]);
  });
});
