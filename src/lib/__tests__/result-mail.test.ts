/*
  심사 결과 메일의 **경계** — 운영자 판정(judging-store)과 게이트 미제출 탈락
  (gate-miss)이 인앱 통지와 같은 글을 메일로도 보내는가, 그리고 트랜잭션 밖인가.

  돌리는 법:  npm test
  DB도 Resend도 부르지 않는다. 받는 사람을 거르는 것은 mail.test.ts가 본다 —
  여기서는 「팀원 전부를 넘겼나, 언제 넘겼나」만 본다.
*/
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    submission: { findUnique: vi.fn() },
    season: { findMany: vi.fn() },
    entry: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/mail", () => ({ sendResultMails: vi.fn() }));
vi.mock("@/lib/admin-store", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/final-submit", () => ({ runFinalAutoSubmit: vi.fn() }));
vi.mock("@/lib/dev-clock", () => ({
  devNow: () => new Date("2026-10-05T00:00:00Z"),
}));

import { NOTI_GATE_MISSED, NOTI_JUDGMENT } from "@/content/notifications";
import {
  EntryStage,
  EntryStatus,
  JudgmentResult,
  StageKey,
  SubmissionStatus,
} from "@/generated/prisma/enums";
import { runGateMiss } from "@/lib/gate-miss";
import { judgeSubmission } from "@/lib/judging-store";
import { sendResultMails } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

const MEMBERS = [
  { userId: "u-1", user: { email: "leader@gmail.com", notifyEmail: true } },
  { userId: "u-2", user: { email: "mate@gmail.com", notifyEmail: false } },
];

function makeTx() {
  return {
    judgment: { create: vi.fn() },
    entry: { update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    submission: { update: vi.fn() },
    auditLog: { create: vi.fn() },
    teamMember: { findMany: vi.fn().mockResolvedValue(MEMBERS) },
    notification: { createMany: vi.fn() },
  };
}

let tx: ReturnType<typeof makeTx>;
/** 트랜잭션이 닫힌 횟수. 메일이 불린 때의 값을 적어 「닫힌 뒤」를 본다 */
let closed: number;
let mailAt: number[];

beforeEach(() => {
  vi.clearAllMocks();
  tx = makeTx();
  closed = 0;
  mailAt = [];
  vi.mocked(prisma.$transaction).mockImplementation((async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    run: any,
  ) => {
    const value = await run(tx);
    closed += 1;
    return value;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any);
  vi.mocked(sendResultMails).mockImplementation(async () => {
    mailAt.push(closed);
  });
});

describe("운영자 판정", () => {
  const FEEDBACK = "수요 검증 근거가 충분합니다.";

  function submitted(prev: { result: JudgmentResult; feedback: string } | null) {
    vi.mocked(prisma.submission.findUnique).mockResolvedValue({
      id: "sub-1",
      status: SubmissionStatus.submitted,
      stageKey: StageKey.s2,
      entryId: "entry-1",
      entry: { stage: EntryStage.s2, status: EntryStatus.active },
      judgments: prev ? [prev] : [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }

  it("인앱 통지와 같은 글을 팀원 전부에게 넘긴다 — 트랜잭션이 닫힌 뒤에", async () => {
    submitted(null);
    const r = await judgeSubmission({
      submissionId: "sub-1",
      result: JudgmentResult.pass,
      feedback: FEEDBACK,
      judgeId: "admin-1",
    });

    expect(r).toEqual({ ok: true });
    expect(sendResultMails).toHaveBeenCalledWith(
      MEMBERS.map((m) => m.user),
      NOTI_JUDGMENT.pass[1],
    );
    expect(mailAt).toEqual([1]);
  });

  it("사유만 고친 재판정은 다시 보내지 않는다", async () => {
    submitted({ result: JudgmentResult.pass, feedback: "이전 사유 열 글자 이상" });
    await judgeSubmission({
      submissionId: "sub-1",
      result: JudgmentResult.pass,
      feedback: FEEDBACK,
      judgeId: "admin-1",
    });

    expect(tx.notification.createMany).not.toHaveBeenCalled();
    expect(sendResultMails).not.toHaveBeenCalled();
  });

  it("결과가 뒤집히면 다시 보낸다", async () => {
    submitted({ result: JudgmentResult.fail, feedback: "이전 사유 열 글자 이상" });
    await judgeSubmission({
      submissionId: "sub-1",
      result: JudgmentResult.pass,
      feedback: FEEDBACK,
      judgeId: "admin-1",
    });

    expect(sendResultMails).toHaveBeenCalledWith(expect.any(Array), NOTI_JUDGMENT.pass[1]);
  });
});

describe("게이트 미제출 탈락", () => {
  beforeEach(() => {
    vi.mocked(prisma.season.findMany).mockResolvedValue([
      {
        id: "season-1",
        stages: [{ stageKey: StageKey.s2, closesAt: new Date("2026-10-04T15:00:00Z") }],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    vi.mocked(prisma.entry.findMany).mockResolvedValue([
      { id: "entry-1", status: EntryStatus.active, stage: EntryStage.s1, raceStartedAt: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
  });

  it("탈락 통지를 팀원 전부에게 넘긴다 — 트랜잭션이 닫힌 뒤에", async () => {
    const r = await runGateMiss();

    expect(r.eliminated).toHaveLength(1);
    expect(sendResultMails).toHaveBeenCalledWith(
      MEMBERS.map((m) => m.user),
      NOTI_GATE_MISSED[1],
    );
    expect(mailAt).toEqual([1]);
  });

  it("그 사이 제출해 떨어뜨리지 않은 팀에는 보내지 않는다", async () => {
    tx.entry.updateMany.mockResolvedValue({ count: 0 });
    const r = await runGateMiss();

    expect(r.raced).toBe(1);
    expect(sendResultMails).not.toHaveBeenCalled();
  });
});
