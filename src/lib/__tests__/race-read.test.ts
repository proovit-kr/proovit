/*
  리더보드 공개 판정의 **DB 래퍼** — `withLeaderboardOpen`이 판정을 직접 하지 않고
  race.ts `leaderboardOpen`을 거치는지, 닫힘이 정해진 때 DB를 안 읽는지 본다.

  DB는 부르지 않는다. prisma를 목으로 세우고 「가장 이른 레이스 시작」 조회가
  불렸는지만 본다. 순수 판정 자체는 race.test.ts가 본다.
*/
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { entry: { aggregate: vi.fn() } },
}));

import { SeasonPhase } from "@/generated/prisma/enums";
import { parseFeatureFlags } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import { withLeaderboardOpen } from "@/lib/race-read";

const KST = (iso: string) => new Date(`${iso}+09:00`);
const now = KST("2026-10-27T12:00");
const aggregate = prisma.entry.aggregate as unknown as ReturnType<typeof vi.fn>;

/* 시즌마다 id를 달리한다 — `loadFirstRaceStart`가 요청 캐시(react `cache`)를 쓴다 */
let n = 0;
const season = (phase: SeasonPhase) => ({ id: `season-${(n += 1)}`, phase });
const flags = (leaderboard: boolean) => ({ ...parseFeatureFlags({}), leaderboard });

beforeEach(() => {
  aggregate.mockReset();
  aggregate.mockResolvedValue({ _min: { raceStartedAt: KST("2026-10-20T09:00") } });
});

describe("withLeaderboardOpen — 화면과 접근 판정이 읽는 플래그", () => {
  it("레이스 중이고 시작한 팀이 있으면 연다", async () => {
    const out = await withLeaderboardOpen(season(SeasonPhase.racing), flags(true), now);
    expect(out.leaderboard).toBe(true);
    expect(aggregate).toHaveBeenCalledTimes(1);
  });

  it("시작한 팀이 없으면 닫는다", async () => {
    aggregate.mockResolvedValue({ _min: { raceStartedAt: null } });
    const out = await withLeaderboardOpen(season(SeasonPhase.racing), flags(true), now);
    expect(out.leaderboard).toBe(false);
  });

  it("모집 중이면 닫고, DB를 읽지 않는다", async () => {
    const out = await withLeaderboardOpen(season(SeasonPhase.recruiting), flags(true), now);
    expect(out.leaderboard).toBe(false);
    expect(aggregate).not.toHaveBeenCalled();
  });

  it("플래그가 꺼져 있으면 닫고, DB를 읽지 않는다", async () => {
    const out = await withLeaderboardOpen(season(SeasonPhase.racing), flags(false), now);
    expect(out.leaderboard).toBe(false);
    expect(aggregate).not.toHaveBeenCalled();
  });

  it("다른 플래그는 그대로 둔다", async () => {
    const input = { ...flags(true), notifications: false };
    const out = await withLeaderboardOpen(season(SeasonPhase.racing), input, now);
    expect(out).toEqual({ ...input, leaderboard: true });
  });
});
