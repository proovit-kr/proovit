/*
  마감 알림 — 언제 보내나(`remindLabel`, 순수)와 누구에게 보내나(`runDeadlineReminders`).

  돌리는 법:  npm test
  DB도 Resend도 부르지 않는다. 받는 사람을 거르는 것(스위치·주소)은 mail.test.ts가 본다.
*/
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    season: { findMany: vi.fn() },
    entry: { findMany: vi.fn() },
    submission: { count: vi.fn() },
  },
}));
vi.mock("@/lib/mail", () => ({ sendAlertMails: vi.fn() }));
vi.mock("@/lib/dev-clock", () => ({ devNow: () => new Date() }));

import { NOTI_DEADLINE } from "@/content/notifications";
import { EntryStage, EntryStatus, StageKey } from "@/generated/prisma/enums";
import { remindLabel, runDeadlineReminders } from "@/lib/deadline-remind";
import { sendAlertMails } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

/** 서울 시각으로 */
const kst = (s: string) => new Date(`${s}+09:00`);
/** s2 마감 10.11 00:00(= 10.10 24:00), s5 마감 11.02 00:00 */
const S2_CLOSE = kst("2026-10-11T00:00:00");
const S5_CLOSE = kst("2026-11-02T00:00:00");

describe("remindLabel — 언제", () => {
  it("게이트는 마감 전날 09시부터", () => {
    expect(remindLabel(S2_CLOSE, kst("2026-10-09T08:45:00"), 1)).toBeNull(); // D-1이지만 9시 전
    expect(remindLabel(S2_CLOSE, kst("2026-10-09T09:00:00"), 1)).toBe("D-1");
    expect(remindLabel(S2_CLOSE, kst("2026-10-08T12:00:00"), 1)).toBeNull(); // D-2
  });

  it("자정 마감은 전날이 마감일이다 — 10.10 낮은 D-day", () => {
    expect(remindLabel(S2_CLOSE, kst("2026-10-10T12:00:00"), 1)).toBe("D-day");
  });

  it("지났으면 안 보낸다", () => {
    expect(remindLabel(S2_CLOSE, kst("2026-10-11T09:00:00"), 1)).toBeNull();
  });
});

describe("runDeadlineReminders — 누구에게", () => {
  const tx = {
    teamMember: {
      findMany: vi.fn().mockResolvedValue([
        { userId: "u-1", user: { email: "leader@gmail.com", notifyEmail: true } },
      ]),
    },
    notification: { createMany: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.$transaction).mockImplementation(((run: any) => run(tx)) as any);
    vi.mocked(prisma.season.findMany).mockResolvedValue([
      {
        id: "season-1",
        stages: [
          { stageKey: StageKey.s1, isGate: false, opensAt: kst("2026-09-28T00:00:00"), closesAt: null },
          { stageKey: StageKey.s2, isGate: true, opensAt: null, closesAt: S2_CLOSE },
          { stageKey: StageKey.s3, isGate: false, opensAt: null, closesAt: null },
          { stageKey: StageKey.s4, isGate: false, opensAt: kst("2026-10-12T00:00:00"), closesAt: null },
          { stageKey: StageKey.s5, isGate: true, opensAt: kst("2026-10-26T00:00:00"), closesAt: S5_CLOSE },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
  });

  it("s2 전날 — s2를 안 낸 팀에만, 인앱과 같은 글로 메일", async () => {
    vi.mocked(prisma.entry.findMany).mockImplementation((async (q: { where: { raceStartedAt?: unknown } }) =>
      q.where.raceStartedAt
        ? []
        : [
            { id: "late", status: EntryStatus.active, stage: EntryStage.s1, raceStartedAt: null },
            { id: "done", status: EntryStatus.active, stage: EntryStage.s2, raceStartedAt: null },
          ]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any);

    const r = await runDeadlineReminders({ now: kst("2026-10-09T09:00:00") });

    expect(r.sent).toEqual([{ entryId: "late", kind: "s2", people: 1 }]);
    expect(sendAlertMails).toHaveBeenCalledWith(expect.any(Array), {
      title: "s2 마감 D-1",
      body: NOTI_DEADLINE.s2.body,
      linkUrl: NOTI_DEADLINE.s2.linkUrl,
    });
  });

  it("이미 받은 팀원만 남으면(중복 창) 아무것도 안 쓴다", async () => {
    vi.mocked(prisma.entry.findMany).mockImplementation((async (q: { where: { raceStartedAt?: unknown } }) =>
      q.where.raceStartedAt
        ? []
        : [{ id: "late", status: EntryStatus.active, stage: EntryStage.s1, raceStartedAt: null }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any);
    tx.teamMember.findMany.mockResolvedValueOnce([]);

    const r = await runDeadlineReminders({ now: kst("2026-10-09T09:00:00") });

    expect(r.sent).toEqual([]);
    expect(tx.notification.createMany).not.toHaveBeenCalled();
    expect(sendAlertMails).not.toHaveBeenCalled();
  });

  it("s4 이번 주 마감 이틀 전 — 이번 주 것을 안 낸 레이스 팀", async () => {
    /* 10.13 레이스 시작 → 1주차는 10.13~10.19, 이번 주 마감 10.19 23:59 */
    vi.mocked(prisma.entry.findMany).mockImplementation((async (q: { where: { raceStartedAt?: unknown } }) =>
      q.where.raceStartedAt
        ? [
            { id: "idle", raceStartedAt: kst("2026-10-13T15:00:00") },
            { id: "busy", raceStartedAt: kst("2026-10-13T15:00:00") },
          ]
        : []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any);
    vi.mocked(prisma.submission.count).mockImplementation((async (q: { where: { entryId: string } }) =>
      q.where.entryId === "busy" ? 1 : 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any);

    const r = await runDeadlineReminders({ now: kst("2026-10-17T10:00:00") });

    expect(r.sent).toEqual([{ entryId: "idle", kind: "week", people: 1 }]);
    expect(vi.mocked(sendAlertMails).mock.calls[0]?.[1].title).toBe("이번 주 활동 제출 D-2");
  });
});
