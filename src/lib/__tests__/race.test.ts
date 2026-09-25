import { describe, expect, it } from "vitest";

import { DeployStatus, SeasonPhase, StageKey } from "@/generated/prisma/enums";
import {
  capBefore,
  leaderboardMayOpen,
  leaderboardOpen,
  notDeployed,
  raceEndAt,
  raceStartOnSave,
  raceStarted,
  raceWeekBase,
  rollupHealth,
  teamRaceWindow,
} from "@/lib/race";
import { currentWeek, participantStages, weekDue, weekRange } from "@/lib/submission";

/*
  팀별 레이스(2026-09-26 수연 지시 「팀별 집계로 바꿔」) — DB 없이 도는 판정만 본다.
  구간을 실제로 거는 곳(롤업·참가작 상세·허브)은 전부 이 판정을 부른다.
*/
const KST = (iso: string) => new Date(`${iso}+09:00`);
/* metric_date는 서울 날짜의 UTC 0시다(measure.ts seoulDateOnly) */
const DAY = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

describe("teamRaceWindow — 팀의 레이스 구간", () => {
  const endsAt = KST("2026-11-17T00:00");

  it("시작이 없으면 레이스 전이다", () => {
    expect(teamRaceWindow({ startedAt: null, endsAt, now: KST("2026-11-01T12:00") })).toBeNull();
  });

  it("시작부터 지금까지 — 시작한 날은 통째로, 오늘까지", () => {
    const win = teamRaceWindow({
      startedAt: KST("2026-10-20T21:14"),
      endsAt,
      now: KST("2026-10-25T09:30"),
    });
    expect(win).toEqual({
      from: KST("2026-10-20T21:14"),
      to: KST("2026-10-25T09:30"),
      firstDay: DAY("2026-10-20"),
      lastDay: DAY("2026-10-25"),
    });
  });

  it("서울 자정 직전에 시작해도 그날이 첫날이다", () => {
    const win = teamRaceWindow({
      startedAt: KST("2026-10-20T23:59"),
      endsAt,
      now: KST("2026-10-21T08:00"),
    });
    expect(win?.firstDay).toEqual(DAY("2026-10-20"));
    expect(win?.lastDay).toEqual(DAY("2026-10-21"));
  });

  it("s5 마감 뒤에는 마감에서 멈춘다 — 자정 마감이면 전날까지", () => {
    const win = teamRaceWindow({
      startedAt: KST("2026-10-20T21:14"),
      endsAt,
      now: KST("2026-11-20T12:00"),
    });
    expect(win?.to).toEqual(endsAt);
    expect(win?.lastDay).toEqual(DAY("2026-11-16"));
  });

  it("23:59 마감이면 그날까지 센다", () => {
    const win = teamRaceWindow({
      startedAt: KST("2026-10-20T21:14"),
      endsAt: KST("2026-11-16T23:59"),
      now: KST("2026-11-20T12:00"),
    });
    expect(win?.lastDay).toEqual(DAY("2026-11-16"));
  });

  it("시작이 끝보다 늦으면 레이스를 뛰지 않았다", () => {
    expect(
      teamRaceWindow({
        startedAt: KST("2026-11-17T09:00"),
        endsAt,
        now: KST("2026-11-20T12:00"),
      }),
    ).toBeNull();
    expect(teamRaceWindow({ startedAt: endsAt, endsAt, now: KST("2026-11-20T12:00") })).toBeNull();
  });

  it("시작이 지금보다 뒤면 아직 시작 전이다(개발 시계)", () => {
    expect(
      teamRaceWindow({
        startedAt: KST("2026-11-02T00:00"),
        endsAt,
        now: KST("2026-10-26T12:00"),
      }),
    ).toBeNull();
  });

  it("끝이 비어 있으면(일정 잠정) 지금까지다", () => {
    const win = teamRaceWindow({
      startedAt: KST("2026-10-20T21:14"),
      endsAt: null,
      now: KST("2026-12-01T12:00"),
    });
    expect(win?.lastDay).toEqual(DAY("2026-12-01"));
  });

  it("팀마다 구간이 다르다 — 먼저 낸 팀이 더 길게 센다", () => {
    const now = KST("2026-10-30T12:00");
    const early = teamRaceWindow({ startedAt: KST("2026-10-14T10:00"), endsAt, now });
    const late = teamRaceWindow({ startedAt: KST("2026-10-24T10:00"), endsAt, now });
    expect(early?.firstDay).toEqual(DAY("2026-10-14"));
    expect(late?.firstDay).toEqual(DAY("2026-10-24"));
    expect(early?.lastDay).toEqual(late?.lastDay);
  });
});

describe("capBefore — 참가작 상세는 어제까지", () => {
  const endsAt = KST("2026-11-17T00:00");

  it("오늘은 뺀다", () => {
    const win = teamRaceWindow({ startedAt: KST("2026-10-20T21:14"), endsAt, now: KST("2026-10-25T09:30") });
    expect(capBefore(win, KST("2026-10-25T09:30"))?.lastDay).toEqual(DAY("2026-10-24"));
  });

  it("오늘 시작한 팀은 아직 보여 줄 날이 없다", () => {
    const now = KST("2026-10-25T21:00");
    const win = teamRaceWindow({ startedAt: KST("2026-10-25T10:00"), endsAt, now });
    expect(capBefore(win, now)).toBeNull();
  });

  it("레이스가 끝났으면 마지막 날 그대로다", () => {
    const now = KST("2026-11-20T12:00");
    const win = teamRaceWindow({ startedAt: KST("2026-10-20T21:14"), endsAt, now });
    expect(capBefore(win, now)?.lastDay).toEqual(DAY("2026-11-16"));
  });

  it("레이스 전이면 null", () => {
    expect(capBefore(null, KST("2026-10-25T09:30"))).toBeNull();
  });
});

describe("raceEndAt — 레이스 끝은 s5 마감", () => {
  it("s5 행의 마감이다", () => {
    expect(
      raceEndAt([
        { stageKey: StageKey.s4, closesAt: KST("2026-10-25T23:59") },
        { stageKey: StageKey.s5, closesAt: KST("2026-11-17T00:00") },
      ]),
    ).toEqual(KST("2026-11-17T00:00"));
    expect(raceEndAt([{ stageKey: StageKey.s4, closesAt: null }])).toBeNull();
  });
});

describe("s4 주차 — 팀의 레이스 시작부터 7일씩", () => {
  const s4Opens = KST("2026-11-02T00:00");
  const started = KST("2026-10-20T21:14");

  it("기산일은 레이스 시작한 날(서울) 0시, 없으면 s4 달력 시작일", () => {
    expect(raceWeekBase(started, s4Opens)).toEqual(KST("2026-10-20T00:00"));
    /* 서울 자정 직후에 시작해도 그날이다 */
    expect(raceWeekBase(KST("2026-10-21T00:05"), s4Opens)).toEqual(KST("2026-10-21T00:00"));
    expect(raceWeekBase(null, s4Opens)).toEqual(s4Opens);
    expect(raceWeekBase(null, null)).toBeNull();
  });

  it("주차는 1부터, 시작한 날에서 7일마다 넘어간다", () => {
    const base = raceWeekBase(started, s4Opens);
    expect(currentWeek(base, KST("2026-10-20T21:14"))).toBe(1);
    expect(currentWeek(base, KST("2026-10-26T23:59"))).toBe(1);
    expect(currentWeek(base, KST("2026-10-27T00:00"))).toBe(2);
    /* s4 달력 시작일(11.02)과 무관하다 — 11.02는 여전히 2주차, 11.03부터 3주차 */
    expect(currentWeek(base, KST("2026-11-02T12:00"))).toBe(2);
    expect(currentWeek(base, KST("2026-11-03T00:00"))).toBe(3);
  });

  it("그 주차의 구간·마감도 시작한 날에서 선다 — 레이스 구간처럼 그날을 통째로 센다", () => {
    const base = raceWeekBase(started, s4Opens);
    expect(weekRange(base, 1)).toEqual({
      from: KST("2026-10-20T00:00"),
      to: KST("2026-10-26T23:59"),
    });
    expect(weekDue(base, 2, KST("2026-11-17T00:00"))).toEqual(KST("2026-11-02T23:59"));
  });

  it("참가자 헤더의 s4 마감도 같은 기준이다", () => {
    const stages = [
      { key: StageKey.s1, isGate: false, opensAt: KST("2026-10-12T00:00"), closesAt: KST("2026-10-18T23:59") },
      { key: StageKey.s2, isGate: true, opensAt: KST("2026-10-19T00:00"), closesAt: KST("2026-10-25T23:59") },
      { key: StageKey.s3, isGate: false, opensAt: KST("2026-10-26T00:00"), closesAt: KST("2026-11-01T23:59") },
      { key: StageKey.s4, isGate: false, opensAt: s4Opens, closesAt: KST("2026-11-08T23:59") },
      { key: StageKey.s5, isGate: true, opensAt: KST("2026-11-09T00:00"), closesAt: KST("2026-11-17T00:00") },
    ];
    const s4 = (now: Date, race: Date | null) =>
      participantStages(stages, now, race).find((s) => s.key === StageKey.s4)?.closesAt;
    const now = KST("2026-10-29T10:00");
    expect(s4(now, KST("2026-10-27T09:00"))).toEqual(KST("2026-11-02T23:59"));
    /* 레이스 전이면 지금처럼 s4 달력 시작일로 센다 */
    expect(s4(now, null)).toEqual(KST("2026-11-08T23:59"));
  });
});

describe("leaderboardOpen — 리더보드를 여는가", () => {
  const now = KST("2026-10-27T12:00");
  const racing = SeasonPhase.racing;

  it("플래그 켜짐 그리고 레이스를 시작한 팀이 있으면 연다", () => {
    expect(
      leaderboardOpen({ flag: true, phase: racing, firstRaceStartAt: KST("2026-10-27T09:00"), now }),
    ).toBe(true);
  });

  it("아무 팀도 시작하지 않았으면 닫는다", () => {
    expect(leaderboardOpen({ flag: true, phase: racing, firstRaceStartAt: null, now })).toBe(false);
  });

  it("플래그는 비상용 끄기다 — 꺼져 있으면 레이스 중이어도 닫는다", () => {
    expect(
      leaderboardOpen({ flag: false, phase: racing, firstRaceStartAt: KST("2026-10-20T09:00"), now }),
    ).toBe(false);
  });

  it("레이스 전 페이즈면 닫는다 — 라우트 정책과 같은 조건", () => {
    const first = KST("2026-10-20T09:00");
    for (const phase of [SeasonPhase.draft, SeasonPhase.pre_apply, SeasonPhase.recruiting]) {
      expect(leaderboardOpen({ flag: true, phase, firstRaceStartAt: first, now }), phase).toBe(false);
    }
  });

  it("끝난 뒤에도 연다 — 관전이 가장 몰리는 때다(access-policy `leaderboard`)", () => {
    const first = KST("2026-10-20T09:00");
    for (const phase of [SeasonPhase.awarded, SeasonPhase.archived]) {
      expect(leaderboardOpen({ flag: true, phase, firstRaceStartAt: first, now }), phase).toBe(true);
    }
  });

  it("시작 시각이 아직 안 왔으면 닫는다(개발 시계)", () => {
    expect(
      leaderboardOpen({ flag: true, phase: racing, firstRaceStartAt: KST("2026-11-02T00:00"), now }),
    ).toBe(false);
    expect(raceStarted(KST("2026-10-27T12:00"), now)).toBe(true);
  });
});

describe("leaderboardMayOpen — 레이스 시작을 읽기 전에 닫힘이 정해지는가", () => {
  const now = KST("2026-10-27T12:00");
  const starts = [null, KST("2026-10-20T09:00"), KST("2026-11-02T00:00")];

  it("플래그가 꺼졌거나 레이스 전 페이즈면 읽을 필요가 없다", () => {
    expect(leaderboardMayOpen({ flag: false, phase: SeasonPhase.racing })).toBe(false);
    expect(leaderboardMayOpen({ flag: true, phase: SeasonPhase.recruiting })).toBe(false);
    expect(leaderboardMayOpen({ flag: true, phase: SeasonPhase.racing })).toBe(true);
  });

  it("건너뛰어도 답이 같다 — 거짓이면 어떤 시작 시각이든 닫힘이다", () => {
    for (const flag of [true, false]) {
      for (const phase of Object.values(SeasonPhase)) {
        if (leaderboardMayOpen({ flag, phase })) continue;
        for (const firstRaceStartAt of starts) {
          expect(leaderboardOpen({ flag, phase, firstRaceStartAt, now }), `${flag} ${phase}`).toBe(
            false,
          );
        }
      }
    }
  });
});

describe("notDeployed — 리더보드와 참가작 상세의 「미배포」", () => {
  const now = KST("2026-10-27T12:00");
  const verified = { deployStatus: DeployStatus.active, ownershipVerifiedAt: KST("2026-10-10T10:00") };

  it("레이스를 시작했고 주소 확인이 끝났으면 배포됨이다", () => {
    expect(notDeployed({ raceStartedAt: KST("2026-10-20T09:00"), hostname: verified }, now)).toBe(false);
  });

  it("주소 확인이 끝났어도 레이스 전이면 미배포다", () => {
    expect(notDeployed({ raceStartedAt: null, hostname: verified }, now)).toBe(true);
    /* 개발 시계가 시작보다 앞이면 아직 레이스 전이다 */
    expect(notDeployed({ raceStartedAt: KST("2026-11-02T00:00"), hostname: verified }, now)).toBe(true);
  });

  it("레이스 중이어도 주소가 없거나 확인 전이면 미배포다", () => {
    const started = KST("2026-10-20T09:00");
    expect(notDeployed({ raceStartedAt: started, hostname: null }, now)).toBe(true);
    expect(
      notDeployed({ raceStartedAt: started, hostname: { ...verified, ownershipVerifiedAt: null } }, now),
    ).toBe(true);
    for (const deployStatus of Object.values(DeployStatus)) {
      if (deployStatus === DeployStatus.active) continue;
      expect(
        notDeployed({ raceStartedAt: started, hostname: { ...verified, deployStatus } }, now),
        deployStatus,
      ).toBe(true);
    }
  });
});

describe("raceStartOnSave — s3 첫 제출만 레이스 시작을 채운다", () => {
  const now = KST("2026-10-27T21:14");

  it("s3을 처음 내면 지금", () => {
    expect(raceStartOnSave({ stageKey: StageKey.s3, intent: "submit", current: null, now })).toEqual(now);
  });

  it("다시 내도 안 바뀐다", () => {
    expect(
      raceStartOnSave({
        stageKey: StageKey.s3,
        intent: "submit",
        current: KST("2026-10-25T10:00"),
        now,
      }),
    ).toBeNull();
  });

  it("임시저장은 제출이 아니다", () => {
    expect(raceStartOnSave({ stageKey: StageKey.s3, intent: "draft", current: null, now })).toBeNull();
  });

  it("다른 스테이지는 건드리지 않는다", () => {
    for (const stageKey of [StageKey.s1, StageKey.s2, StageKey.s4, StageKey.s5]) {
      expect(raceStartOnSave({ stageKey, intent: "submit", current: null, now })).toBeNull();
    }
  });
});

describe("rollupHealth — 운영 대시보드 「지연」", () => {
  const now = KST("2026-10-27T12:00");
  const late = 30;
  const minutesBefore = (m: number) => new Date(now.getTime() - m * 60_000);

  it("레이스를 시작한 팀이 없으면 돌 일이 없다", () => {
    expect(rollupHealth({ halted: false, firstRaceStartAt: null, lastRollupAt: null, now, lateMinutes: late })).toEqual({
      kind: "idle",
    });
  });

  it("레이스가 시작됐는데 롤업이 없으면 가장 이른 시작에서 센다", () => {
    expect(
      rollupHealth({ halted: false, firstRaceStartAt: minutesBefore(10), lastRollupAt: null, now, lateMinutes: late }),
    ).toEqual({ kind: "first", late: false });
    expect(
      rollupHealth({ halted: false, firstRaceStartAt: minutesBefore(45), lastRollupAt: null, now, lateMinutes: late }),
    ).toEqual({ kind: "first", late: true });
  });

  it("롤업이 돈 적이 있으면 마지막 롤업에서 센다", () => {
    expect(
      rollupHealth({
        halted: false,
        firstRaceStartAt: minutesBefore(600),
        lastRollupAt: minutesBefore(6),
        now,
        lateMinutes: late,
      }),
    ).toEqual({ kind: "ran", late: false, minutes: 6 });
    expect(
      rollupHealth({
        halted: false,
        firstRaceStartAt: minutesBefore(600),
        lastRollupAt: minutesBefore(31),
        now,
        lateMinutes: late,
      }),
    ).toEqual({ kind: "ran", late: true, minutes: 31 });
  });

  it("시작 시각이 아직 안 왔으면 돌 일이 없다(개발 시계)", () => {
    expect(
      rollupHealth({
        halted: false,
        firstRaceStartAt: KST("2026-11-02T00:00"),
        lastRollupAt: null,
        now,
        lateMinutes: late,
      }),
    ).toEqual({ kind: "idle" });
  });

  it("롤업이 쉬는 시즌이면 스냅샷이 낡아도 지연이 아니다", () => {
    expect(
      rollupHealth({
        halted: true,
        firstRaceStartAt: minutesBefore(600),
        lastRollupAt: minutesBefore(118),
        now,
        lateMinutes: late,
      }),
    ).toEqual({ kind: "idle" });
  });

  it("레이스를 시작한 팀이 없으면 픽스처 스냅샷이 있어도 판정하지 않는다", () => {
    expect(
      rollupHealth({ halted: false, firstRaceStartAt: null, lastRollupAt: minutesBefore(118), now, lateMinutes: late }),
    ).toEqual({ kind: "idle" });
  });
});
