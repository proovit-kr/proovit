/*
  크레딧 저장소 — 판정(`judgeCredit`·`claimCredit`)과 발급 몸통(`issueCredit`),
  언락 사건 읽기(`gate1PassedAt`·`deployVerifiedAt`).

  돌리는 법:  npm test
  DB를 부르지 않는다. prisma를 목으로 두고 「무엇을 읽고 무엇을 쓰는가」만 본다.
  순수 규칙(카드 상태·받기 거절)은 credits.test.ts가 본다.
*/
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    creditOffer: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findMany: vi.fn() },
    creditClaim: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    teamMember: { findMany: vi.fn() },
    notification: { createMany: vi.fn() },
    auditLog: { create: vi.fn() },
    entry: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    submission: { findFirst: vi.fn() },
    judgment: { findFirst: vi.fn() },
    award: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/dev-clock", () => ({ devNow: () => new Date("2026-10-20T12:00:00+09:00") }));
vi.mock("@/lib/mail", () => ({ sendCreditMail: vi.fn(async () => ({ ok: true })) }));

import {
  CreditClaimStatus,
  CreditDelivery,
  CreditDeliveredVia,
  CreditKind,
  CreditOfferStatus,
  CreditStatus,
  DeployStatus,
  EntryStage,
  EntryStatus,
  JudgmentResult,
  SeasonPhase,
} from "@/generated/prisma/enums";
import {
  UNKNOWN_AT,
  claimCredit,
  deployVerifiedAt,
  gate1PassedAt,
  issueCredit,
  judgeCredit,
  loadCreditCenter,
  noticeCreditDelivered,
  releaseScheduledCredits,
  resendCreditDelivery,
} from "@/lib/credits-store";
import { sendCreditMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const NOW = new Date("2026-10-20T12:00:00+09:00");
const at = (s: string) => new Date(`${s}+09:00`);

describe("게이트 1 통과 — 진도와 마지막 판정", () => {
  const judged = at("2026-10-12T10:00:00");
  it("진도가 s3에 못 닿으면 안 열린다", () => {
    expect(gate1PassedAt(EntryStage.s2, { result: JudgmentResult.pass, judgedAt: judged })).toBeNull();
  });
  it("마지막 판정이 통과면 그 때", () => {
    expect(gate1PassedAt(EntryStage.s3, { result: JudgmentResult.pass, judgedAt: judged })).toBe(judged);
  });
  it("통과 뒤 미통과로 번복되면 닫힌다 — 진도는 뒤로 안 내려간다", () => {
    expect(gate1PassedAt(EntryStage.s3, { result: JudgmentResult.fail, judgedAt: judged })).toBeNull();
  });
  it("판정 행이 없으면 때를 모른 채 연다", () => {
    expect(gate1PassedAt(EntryStage.s4, null)).toBe(UNKNOWN_AT);
  });
});

describe("배포 검증 — 리더보드의 「미배포」와 같은 정의", () => {
  const host = (verifiedAt: Date | null, status: DeployStatus = DeployStatus.active) => ({
    deployStatus: status,
    ownershipVerifiedAt: verifiedAt,
  });
  it("측정 연동만 끝낸 팀(레이스 전)은 안 열린다 — 온보딩에서 검증이 끝나도", () => {
    expect(deployVerifiedAt({ raceStartedAt: null, hostname: host(at("2026-09-29T10:00:00")) }, NOW)).toBeNull();
  });
  it("레이스를 시작했고 주소가 확인되면 둘 중 늦은 때", () => {
    const verified = at("2026-09-29T10:00:00");
    const started = at("2026-10-16T09:00:00");
    expect(deployVerifiedAt({ raceStartedAt: started, hostname: host(verified) }, NOW)).toBe(started);
    const late = at("2026-10-18T09:00:00");
    expect(deployVerifiedAt({ raceStartedAt: started, hostname: host(late) }, NOW)).toBe(late);
  });
  it("주소가 확인 안 됐거나 배포가 죽었으면 안 열린다", () => {
    const started = at("2026-10-16T09:00:00");
    expect(deployVerifiedAt({ raceStartedAt: started, hostname: host(null) }, NOW)).toBeNull();
    expect(
      deployVerifiedAt({ raceStartedAt: started, hostname: host(started, DeployStatus.failed) }, NOW),
    ).toBeNull();
  });
});

/* judgeCredit의 재료 — 레이스 중 active 팀, C1 활성 카드, s1 냄 */
function seed(over: {
  offer?: Record<string, unknown>;
  entry?: Record<string, unknown>;
  claim?: Record<string, unknown> | null;
  s1?: boolean;
} = {}) {
  db.creditOffer.findUnique.mockResolvedValue({
    id: "o-1",
    seasonId: "s-1",
    kind: CreditKind.c1,
    status: CreditOfferStatus.active,
    deliveryMethod: CreditDelivery.code_pool,
    releaseDate: null,
    validUntil: null,
    season: { phase: SeasonPhase.racing, featureFlags: { credits: true } },
    ...over.offer,
  });
  db.entry.findUnique.mockResolvedValue({
    seasonId: "s-1",
    status: EntryStatus.active,
    stage: EntryStage.s2,
    ...over.entry,
  });
  db.creditClaim.findUnique.mockResolvedValue(over.claim === undefined ? null : over.claim);
  db.entry.findUniqueOrThrow.mockResolvedValue({
    stage: EntryStage.s2,
    raceStartedAt: null,
    hostname: null,
  });
  db.submission.findFirst.mockResolvedValue(
    over.s1 === false ? null : { submittedAt: at("2026-10-03T10:00:00"), updatedAt: NOW },
  );
  db.judgment.findFirst.mockResolvedValue(null);
  db.award.findFirst.mockResolvedValue(null);
}

describe("judgeCredit — 화면과 같은 판정", () => {
  beforeEach(() => vi.clearAllMocks());

  it("열린 카드는 발급 가능", async () => {
    seed();
    expect(await judgeCredit({ entryId: "e-1", offerId: "o-1" })).toMatchObject({
      ok: true,
      state: "available",
    });
  });
  it("다른 시즌의 카드는 없는 것으로 본다", async () => {
    seed({ offer: { seasonId: "s-old" } });
    expect(await judgeCredit({ entryId: "e-1", offerId: "o-1" })).toEqual({ ok: false, code: "NOT_FOUND" });
  });
  it("s1을 낸 뒤 임시 저장한 팀도 C1이 열려 있다 — 낸 적이 있으면 연다", async () => {
    seed();
    await judgeCredit({ entryId: "e-1", offerId: "o-1" });
    const where = db.submission.findFirst.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ submittedAt: { not: null } });
  });
});

describe("claimCredit — 받기", () => {
  beforeEach(() => vi.clearAllMocks());

  it("게이트 1 전의 C1은 발급 예정으로 적고 알리지 않는다", async () => {
    seed();
    const tx = {
      creditCode: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
      creditClaim: {
        updateMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async () => ({ count: 1 })),
      },
      auditLog: { create: vi.fn() },
    };
    db.$transaction.mockImplementation((fn: (t: unknown) => unknown) => fn(tx));
    expect(await claimCredit({ entryId: "e-1", offerId: "o-1", actorId: "u-1" })).toEqual({ ok: true, scheduled: true });
    expect(tx.creditCode.findFirst).not.toHaveBeenCalled();
    /* 누가 눌렀는지 남는다 — 운영 콘솔 발송 이력이 읽는다 */
    expect(tx.auditLog.create.mock.calls[0][0].data).toMatchObject({
      actorId: "u-1",
      action: "credit.claim",
      targetId: "e-1",
    });
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  it("탈락·실격 팀은 새로 받지 못한다", async () => {
    seed({ entry: { status: EntryStatus.eliminated } });
    expect(await claimCredit({ entryId: "e-1", offerId: "o-1", actorId: "u-1" })).toEqual({ ok: false, code: "INACTIVE" });
    seed({ entry: { status: EntryStatus.disqualified } });
    expect(await claimCredit({ entryId: "e-1", offerId: "o-1", actorId: "u-1" })).toEqual({ ok: false, code: "INACTIVE" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("시상 발표 뒤에는 활성 카드라도 받지 못한다", async () => {
    seed({ offer: { season: { phase: SeasonPhase.awarded } } });
    expect(await claimCredit({ entryId: "e-1", offerId: "o-1", actorId: "u-1" })).toEqual({ ok: false, code: "ENDED" });
  });
  it("안 연 카드·협의 중·이미 받은 카드", async () => {
    seed({ s1: false });
    expect(await claimCredit({ entryId: "e-1", offerId: "o-1", actorId: "u-1" })).toEqual({ ok: false, code: "LOCKED" });
    seed({ offer: { status: CreditOfferStatus.negotiating } });
    expect(await claimCredit({ entryId: "e-1", offerId: "o-1", actorId: "u-1" })).toEqual({ ok: false, code: "NEGOTIATING" });
    seed({ claim: { status: CreditClaimStatus.delivered } });
    expect(await claimCredit({ entryId: "e-1", offerId: "o-1", actorId: "u-1" })).toEqual({ ok: false, code: "ALREADY_CLAIMED" });
  });
});

describe("issueCredit — 발급 몸통", () => {
  const offer = {
    id: "o-1",
    kind: CreditKind.c1,
    deliveryMethod: CreditDelivery.code_pool,
    releaseDate: null as Date | null,
  };
  const args = { entryId: "e-1", via: CreditDeliveredVia.manual, now: NOW, due: true };

  const txOf = (over: {
    codes?: { id: string; code: string }[];
    taken?: number[];
    moved?: number;
    created?: number;
  }) => {
    const codes = [...(over.codes ?? [{ id: "c-1", code: "RPL-1" }])];
    const taken = [...(over.taken ?? [1])];
    return {
      creditCode: {
        findFirst: vi.fn(async ({ where }: any) => codes.find((c) => !where.id.notIn.includes(c.id)) ?? null),
        updateMany: vi.fn(async () => ({ count: taken.shift() ?? 1 })),
        update: vi.fn(),
      },
      creditClaim: {
        updateMany: vi.fn<(arg: any) => Promise<{ count: number }>>(async () => ({ count: over.moved ?? 0 })),
        createMany: vi.fn<(arg: any) => Promise<{ count: number }>>(async () => ({ count: over.created ?? 1 })),
      },
    };
  };

  it("코드를 하나 붙여 발급 완료로 적는다", async () => {
    const tx = txOf({});
    expect(await issueCredit(tx as any, { offer, ...args })).toEqual({ ok: true, code: "RPL-1", scheduled: false });
    expect(tx.creditClaim.createMany.mock.calls[0][0].data[0]).toMatchObject({
      status: CreditClaimStatus.delivered,
      creditCodeId: "c-1",
      deliveredVia: CreditDeliveredVia.manual,
    });
  });
  it("다른 쪽이 먼저 집은 코드는 건너뛰고 다음 코드를 집는다", async () => {
    const tx = txOf({ codes: [{ id: "c-1", code: "A" }, { id: "c-2", code: "B" }], taken: [0, 1] });
    expect(await issueCredit(tx as any, { offer, ...args })).toMatchObject({ ok: true, code: "B" });
  });
  it("남은 코드가 없으면 소진", async () => {
    const tx = txOf({ codes: [] });
    expect(await issueCredit(tx as any, { offer, ...args })).toEqual({ ok: false, code: "SOLD_OUT" });
  });
  it("팀원이 먼저 받았으면 물러나고 집어 둔 코드를 되돌린다", async () => {
    const tx = txOf({ moved: 0, created: 0 });
    expect(await issueCredit(tx as any, { offer, ...args })).toEqual({ ok: false, code: "ALREADY_CLAIMED" });
    expect(tx.creditCode.update).toHaveBeenCalledWith({
      where: { id: "c-1" },
      data: { status: CreditStatus.issued },
    });
  });
  it("발급 가능으로 남은 행이 있으면 그 행을 옮긴다", async () => {
    const tx = txOf({ moved: 1 });
    expect(await issueCredit(tx as any, { offer, ...args })).toMatchObject({ ok: true });
    expect(tx.creditClaim.updateMany.mock.calls[0][0].where).toMatchObject({
      status: CreditClaimStatus.available,
    });
    expect(tx.creditClaim.createMany).not.toHaveBeenCalled();
  });
  describe("수동형 — 운영자가 코드를 적는다", () => {
    const manual = { ...offer, deliveryMethod: CreditDelivery.manual };
    const txManual = (over: { clash?: boolean; moved?: number[]; created?: number } = {}) => {
      const moved = [...(over.moved ?? [0, 0])];
      return {
        creditCode: {
          findFirst: vi.fn(),
          findUnique: vi.fn(async () => (over.clash ? { id: "c-old" } : null)),
          create: vi.fn(async ({ data }: any) => ({ id: "c-new", code: data.code })),
          delete: vi.fn(),
          updateMany: vi.fn(),
          update: vi.fn(),
        },
        creditClaim: {
          updateMany: vi.fn<(arg: any) => Promise<{ count: number }>>(async () => ({ count: moved.shift() ?? 0 })),
          createMany: vi.fn<(arg: any) => Promise<{ count: number }>>(async () => ({ count: over.created ?? 1 })),
        },
      };
    };

    it("코드 없이 받으면 발급 예정으로 두고 운영자를 기다린다 — 빈 「발급 완료」가 아니다", async () => {
      const tx = txManual();
      expect(await issueCredit(tx as any, { offer: manual, ...args })).toEqual({ ok: true, code: null, scheduled: true });
      expect(tx.creditCode.create).not.toHaveBeenCalled();
      expect(tx.creditClaim.createMany.mock.calls[0][0].data[0]).toMatchObject({ status: CreditClaimStatus.scheduled });
    });
    it("적은 코드로 코드 행을 만들어 붙이고 발급 완료로 적는다", async () => {
      const tx = txManual();
      expect(await issueCredit(tx as any, { offer: manual, ...args, manualCode: " HAND-1 " })).toEqual({
        ok: true,
        code: "HAND-1",
        scheduled: false,
      });
      expect(tx.creditCode.create.mock.calls[0][0].data).toMatchObject({
        offerId: "o-1",
        code: "HAND-1",
        status: CreditStatus.claimed,
      });
      expect(tx.creditClaim.createMany.mock.calls[0][0].data[0]).toMatchObject({
        status: CreditClaimStatus.delivered,
        creditCodeId: "c-new",
      });
    });
    it("참가자가 받아 두고 기다리던 칸을 채운다 — 받은 때는 안 덮는다", async () => {
      const tx = txManual({ moved: [0, 1] });
      expect(await issueCredit(tx as any, { offer: manual, ...args, manualCode: "HAND-1" })).toMatchObject({ ok: true });
      const fill = tx.creditClaim.updateMany.mock.calls[1][0];
      expect(fill.where).toMatchObject({ status: CreditClaimStatus.scheduled, creditCodeId: null });
      expect(fill.data.claimedAt).toBeUndefined();
      expect(tx.creditClaim.createMany).not.toHaveBeenCalled();
    });
    it("이미 있는 코드는 거절한다 — 같은 코드가 두 팀에 가지 않게", async () => {
      const tx = txManual({ clash: true });
      expect(await issueCredit(tx as any, { offer: manual, ...args, manualCode: "HAND-1" })).toEqual({
        ok: false,
        code: "CODE_TAKEN",
      });
      expect(tx.creditCode.create).not.toHaveBeenCalled();
    });
    it("보낼 때가 아니면 코드를 붙인 채 발급 예정으로 둔다", async () => {
      const tx = txManual();
      expect(
        await issueCredit(tx as any, { offer: manual, ...args, due: false, manualCode: "HAND-1" }),
      ).toMatchObject({ ok: true, scheduled: true });
      expect(tx.creditClaim.createMany.mock.calls[0][0].data[0]).toMatchObject({
        status: CreditClaimStatus.scheduled,
        creditCodeId: "c-new",
      });
    });
    it("붙일 칸이 없으면(이미 발급됨) 만든 코드 행을 지운다", async () => {
      const tx = txManual({ created: 0 });
      expect(await issueCredit(tx as any, { offer: manual, ...args, manualCode: "HAND-1" })).toEqual({
        ok: false,
        code: "ALREADY_CLAIMED",
      });
      expect(tx.creditCode.delete).toHaveBeenCalledWith({ where: { id: "c-new" } });
    });
  });

  it("보낼 때가 아니면 코드를 태우지 않고 발급 예정으로 둔다", async () => {
    const tx = txOf({});
    expect(await issueCredit(tx as any, { offer, ...args, due: false })).toEqual({ ok: true, code: null, scheduled: true });
    expect(tx.creditCode.findFirst).not.toHaveBeenCalled();
    expect(tx.creditClaim.createMany.mock.calls[0][0].data[0]).toMatchObject({
      status: CreditClaimStatus.scheduled,
    });
  });
});

describe("releaseScheduledCredits — 발급 예정 보내기", () => {
  type Offer = {
    id: string;
    kind: CreditKind;
    deliveryMethod: CreditDelivery;
    releaseDate: Date | null;
    validUntil: Date | null;
    season: { phase: SeasonPhase; featureFlags: Record<string, unknown> };
  };
  const c1: Offer = {
    id: "o-1",
    kind: CreditKind.c1,
    deliveryMethod: CreditDelivery.code_pool,
    releaseDate: null,
    validUntil: null,
    season: { phase: SeasonPhase.racing, featureFlags: { credits: true } },
  };
  const row = (id: string, entry: { stage: EntryStage; status: EntryStatus }, offer: Offer = c1) => ({
    id,
    entryId: `e-${id}`,
    offer,
    entry,
  });
  let tx: any;

  beforeEach(() => {
    vi.clearAllMocks();
    tx = {
      creditCode: {
        findFirst: vi.fn(async () => ({ id: "c-1", code: "RPL-1" })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(),
      },
      creditClaim: { updateMany: vi.fn(async () => ({ count: 1 })) },
    };
    db.$transaction.mockImplementation((fn: (t: unknown) => unknown) => fn(tx));
    db.creditOffer.findUniqueOrThrow.mockResolvedValue({
      kind: CreditKind.c1,
      deliveryMethod: CreditDelivery.code_pool,
      inviteUrl: null,
      validUntil: null,
      redeemNote: null,
      sponsor: { name: "Replit" },
    });
    db.teamMember.findMany.mockResolvedValue([
      { userId: "u-1", user: { email: "a@gmail.com" }, team: { entries: [{ id: "e-pass" }] } },
    ]);
  });

  it("게이트 1을 통과한 팀과 떨어진 팀의 C1을 보내고, 아직인 팀은 둔다", async () => {
    db.creditClaim.findMany.mockResolvedValue([
      row("pass", { stage: EntryStage.s3, status: EntryStatus.active }),
      row("wait", { stage: EntryStage.s2, status: EntryStatus.active }),
      row("fail", { stage: EntryStage.s2, status: EntryStatus.eliminated }),
      row("dq", { stage: EntryStage.s3, status: EntryStatus.disqualified }),
    ]);
    expect(await releaseScheduledCredits()).toEqual({ released: 2, soldOut: 0, failed: 0 });
    const moved = tx.creditClaim.updateMany.mock.calls.map((c: any) => c[0].where.id);
    expect(moved).toEqual(["pass", "fail"]);
    expect(tx.creditClaim.updateMany.mock.calls[0][0].data).toMatchObject({
      status: CreditClaimStatus.delivered,
      creditCodeId: "c-1",
      deliveredVia: CreditDeliveredVia.email,
    });
    expect(db.notification.createMany).toHaveBeenCalledTimes(1);
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
      actorId: null,
      action: "credit.release",
      meta: { teams: 2, entryIds: ["e-pass", "e-fail"] },
    });
    expect(sendCreditMail).toHaveBeenCalledWith(
      expect.objectContaining({ card: "C1 빌더 크레딧", josa: "이", code: "RPL-1", sponsor: "Replit" }),
    );
  });

  it("유효기간이 지난 카드는 보내지 않는다", async () => {
    db.creditClaim.findMany.mockResolvedValue([
      row("pass", { stage: EntryStage.s3, status: EntryStatus.active }, {
        ...c1,
        validUntil: at("2026-10-01T00:00:00"),
      }),
    ]);
    expect(await releaseScheduledCredits()).toEqual({ released: 0, soldOut: 0, failed: 0 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("크레딧 센터가 꺼진 시즌·끝난 시즌은 보내지 않는다", async () => {
    const pass = { stage: EntryStage.s3, status: EntryStatus.active };
    db.creditClaim.findMany.mockResolvedValue([
      row("off", pass, { ...c1, season: { phase: SeasonPhase.racing, featureFlags: { credits: false } } }),
      row("over", pass, { ...c1, season: { phase: SeasonPhase.awarded, featureFlags: { credits: true } } }),
    ]);
    expect(await releaseScheduledCredits()).toEqual({ released: 0, soldOut: 0, failed: 0 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("탈락 팀의 C1 아닌 예정, 실격 팀의 예정은 날짜가 와도 보내지 않는다", async () => {
    const c2 = { ...c1, id: "o-2", kind: CreditKind.c2 };
    db.creditClaim.findMany.mockResolvedValue([
      row("out", { stage: EntryStage.s4, status: EntryStatus.eliminated }, c2),
      row("dq", { stage: EntryStage.s4, status: EntryStatus.disqualified }, c2),
    ]);
    expect(await releaseScheduledCredits()).toEqual({ released: 0, soldOut: 0, failed: 0 });
  });

  it("한 줄이 실패해도 다음 줄은 보낸다", async () => {
    db.$transaction
      .mockImplementationOnce(async () => {
        throw new Error("connection reset");
      })
      .mockImplementation((fn: (t: unknown) => unknown) => fn(tx));
    db.creditClaim.findMany.mockResolvedValue([
      row("a", { stage: EntryStage.s3, status: EntryStatus.active }),
      row("pass", { stage: EntryStage.s3, status: EntryStatus.active }),
    ]);
    expect(await releaseScheduledCredits()).toEqual({ released: 1, soldOut: 0, failed: 1 });
  });

  it("수동형인데 운영자가 코드를 안 적었으면 보내지 않고 기다린다", async () => {
    const manual = { ...c1, deliveryMethod: CreditDelivery.manual };
    db.creditClaim.findMany.mockResolvedValue([
      { ...row("pass", { stage: EntryStage.s3, status: EntryStatus.active }, manual), creditCode: null },
    ]);
    expect(await releaseScheduledCredits()).toEqual({ released: 0, soldOut: 0, failed: 0 });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(sendCreditMail).not.toHaveBeenCalled();
  });

  it("수동형에 운영자가 적어 둔 코드가 있으면 풀을 안 보고 그 코드로 보낸다", async () => {
    const manual = { ...c1, deliveryMethod: CreditDelivery.manual };
    db.creditOffer.findUniqueOrThrow.mockResolvedValue({
      kind: CreditKind.c1,
      deliveryMethod: CreditDelivery.manual,
      inviteUrl: null,
      validUntil: null,
      redeemNote: null,
      sponsor: null,
    });
    db.creditClaim.findMany.mockResolvedValue([
      {
        ...row("pass", { stage: EntryStage.s3, status: EntryStatus.active }, manual),
        creditCode: { id: "c-9", code: "HAND-9" },
      },
    ]);
    expect(await releaseScheduledCredits()).toEqual({ released: 1, soldOut: 0, failed: 0 });
    expect(tx.creditCode.findFirst).not.toHaveBeenCalled();
    /* 이미 붙은 코드라 다시 붙이지 않는다 */
    expect(tx.creditClaim.updateMany.mock.calls[0][0].data.creditCodeId).toBeUndefined();
    expect(sendCreditMail).toHaveBeenCalledWith(expect.objectContaining({ code: "HAND-9" }));
  });

  it("코드가 모자라면 예정으로 남긴다", async () => {
    tx.creditCode.findFirst.mockResolvedValue(null);
    db.creditClaim.findMany.mockResolvedValue([
      row("pass", { stage: EntryStage.s3, status: EntryStatus.active }),
    ]);
    expect(await releaseScheduledCredits()).toEqual({ released: 0, soldOut: 1, failed: 0 });
    expect(tx.creditClaim.updateMany).not.toHaveBeenCalled();
  });

  it("다른 실행이 먼저 보냈으면 집어 둔 코드를 되돌린다", async () => {
    tx.creditClaim.updateMany.mockResolvedValue({ count: 0 });
    db.creditClaim.findMany.mockResolvedValue([
      row("pass", { stage: EntryStage.s3, status: EntryStatus.active }),
    ]);
    expect(await releaseScheduledCredits()).toEqual({ released: 0, soldOut: 0, failed: 0 });
    expect(tx.creditCode.update).toHaveBeenCalledWith({
      where: { id: "c-1" },
      data: { status: CreditStatus.issued },
    });
  });
});

describe("발급 메일 결과 — 칸에 적고, 못 보낸 팀은 감사 로그에", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.creditOffer.findUniqueOrThrow.mockResolvedValue({
      kind: CreditKind.c1,
      deliveryMethod: CreditDelivery.code_pool,
      inviteUrl: null,
      validUntil: null,
      redeemNote: null,
      sponsor: { name: "Replit" },
    });
    db.teamMember.findMany.mockResolvedValue([
      { userId: "u-1", user: { email: "a@gmail.com" }, team: { name: "리틀포션", entries: [{ id: "e-1" }] } },
      { userId: "u-2", user: { email: "b@gmail.com" }, team: { name: "새벽창고", entries: [{ id: "e-2" }] } },
    ]);
  });

  it("메일이 실패한 팀은 mail_failed_at을 적고 시스템 줄을 남긴다, 나간 팀은 비운다", async () => {
    vi.mocked(sendCreditMail)
      .mockResolvedValueOnce({ ok: false, reason: "UNAVAILABLE" } as any)
      .mockResolvedValueOnce({ ok: true, skipped: false } as any);
    const r = await noticeCreditDelivered({
      offerId: "o-1",
      deliveries: [
        { entryId: "e-1", code: "RPL-1" },
        { entryId: "e-2", code: "RPL-2" },
      ],
    });
    expect(r).toEqual({ mailFailed: ["e-1"] });
    const [failedCall, okCall] = db.creditClaim.updateMany.mock.calls.map((c: any) => c[0]);
    expect(failedCall).toMatchObject({ where: { offerId: "o-1", entryId: { in: ["e-1"] } } });
    expect(failedCall.data.mailFailedAt).toBeInstanceOf(Date);
    expect(okCall).toMatchObject({ where: { entryId: { in: ["e-2"] } }, data: { mailFailedAt: null } });
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
      actorId: null,
      action: "credit.mail_failed",
      targetId: "o-1",
      meta: { kind: CreditKind.c1, entryIds: ["e-1"], target: "C1, 리틀포션" },
    });
    /* 인앱은 메일과 무관하게 나간다 */
    expect(db.notification.createMany).toHaveBeenCalledTimes(1);
  });

  it("알림이 통째로 실패해도 던지지 않고 전부 못 보낸 것으로 적는다", async () => {
    db.teamMember.findMany.mockRejectedValue(new Error("connection reset"));
    const r = await noticeCreditDelivered({ offerId: "o-1", deliveries: [{ entryId: "e-1", code: "RPL-1" }] });
    expect(r).toEqual({ mailFailed: ["e-1"] });
    expect(db.creditClaim.updateMany.mock.calls[0][0]).toMatchObject({ where: { entryId: { in: ["e-1"] } } });
  });

  it("재발송 — 같은 코드를 다시 보내고, 나가면 실패 표시를 비운다(시스템 줄은 안 쓴다)", async () => {
    db.creditClaim.findUnique.mockResolvedValue({
      creditCode: { code: "RPL-1" },
      offer: {
        kind: CreditKind.c1,
        deliveryMethod: CreditDelivery.code_pool,
        inviteUrl: null,
        validUntil: null,
        redeemNote: null,
        sponsor: null,
      },
    });
    db.teamMember.findMany.mockResolvedValue([
      { userId: "u-1", user: { email: "a@gmail.com" }, team: { name: "리틀포션", entries: [{ id: "e-1" }] } },
    ]);
    vi.mocked(sendCreditMail).mockResolvedValue({ ok: true, skipped: false } as any);
    expect(await resendCreditDelivery({ offerId: "o-1", entryId: "e-1" })).toEqual({
      ok: true,
      failed: false,
      kind: CreditKind.c1,
      teamName: "리틀포션",
    });
    expect(sendCreditMail).toHaveBeenCalledWith(expect.objectContaining({ code: "RPL-1" }));
    expect(db.creditClaim.updateMany.mock.calls[0][0]).toMatchObject({ data: { mailFailedAt: null } });
    expect(db.notification.createMany).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("재발송 — 보낼 코드도 링크도 없으면 거절한다", async () => {
    db.creditClaim.findUnique.mockResolvedValue({
      creditCode: null,
      offer: {
        kind: CreditKind.c2,
        deliveryMethod: CreditDelivery.email_list,
        inviteUrl: null,
        validUntil: null,
        redeemNote: null,
        sponsor: null,
      },
    });
    expect(await resendCreditDelivery({ offerId: "o-2", entryId: "e-1" })).toEqual({ ok: false });
    expect(sendCreditMail).not.toHaveBeenCalled();
  });
});

describe("judgeCredit — 수동형 코드 대기", () => {
  beforeEach(() => vi.clearAllMocks());

  it("수동형을 받아 두고 코드가 없으면 코드 대기다", async () => {
    seed({
      offer: { deliveryMethod: CreditDelivery.manual },
      claim: { status: CreditClaimStatus.scheduled, creditCodeId: null },
    });
    expect(await judgeCredit({ entryId: "e-1", offerId: "o-1" })).toMatchObject({
      ok: true,
      state: "scheduled",
      awaitingCode: true,
    });
  });
  it("코드를 적어 둔 예정·코드 풀의 예정은 기다리는 칸이 아니다", async () => {
    seed({
      offer: { deliveryMethod: CreditDelivery.manual },
      claim: { status: CreditClaimStatus.scheduled, creditCodeId: "c-1" },
    });
    expect(await judgeCredit({ entryId: "e-1", offerId: "o-1" })).toMatchObject({ awaitingCode: false });
    seed({ claim: { status: CreditClaimStatus.scheduled, creditCodeId: null } });
    expect(await judgeCredit({ entryId: "e-1", offerId: "o-1" })).toMatchObject({ awaitingCode: false });
  });
});

describe("크레딧 센터가 꺼져 있으면 폴백 카드만 — 탭은 연다", () => {
  beforeEach(() => vi.clearAllMocks());

  it("받기도 화면처럼 협의 중으로 읽어 거절한다", async () => {
    seed({ offer: { season: { phase: SeasonPhase.racing, featureFlags: { credits: false } } } });
    expect(await judgeCredit({ entryId: "e-1", offerId: "o-1" })).toMatchObject({ ok: true, state: "negotiating" });
    expect(await claimCredit({ entryId: "e-1", offerId: "o-1", actorId: "u-1" })).toEqual({
      ok: false,
      code: "NEGOTIATING",
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("카드는 협의 중, 스폰서·가치는 감추고, 폴백은 적은 것이 없으면 설계서 기본 목록", async () => {
    seed();
    db.creditOffer.findMany.mockResolvedValue([
      {
        id: "o-1",
        kind: CreditKind.c1,
        status: CreditOfferStatus.active,
        description: null,
        value: "$75",
        releaseDate: null,
        validUntil: null,
        deliveryMethod: CreditDelivery.code_pool,
        inviteUrl: null,
        howtoUrl: null,
        redeemNote: null,
        fallbackUrl: null,
        fallbackItems: [],
        sponsor: { name: "Replit", mark: "R", logoUrl: null },
      },
      {
        id: "o-2",
        kind: CreditKind.c2,
        status: CreditOfferStatus.negotiating,
        description: null,
        value: null,
        releaseDate: null,
        validUntil: null,
        deliveryMethod: CreditDelivery.invite_link,
        inviteUrl: null,
        howtoUrl: null,
        redeemNote: null,
        fallbackUrl: null,
        fallbackItems: [{ name: "운영이 적은 폴백" }],
        sponsor: null,
      },
    ]);
    db.creditClaim.findMany.mockResolvedValue([]);
    const view = await loadCreditCenter({
      entryId: "e-1",
      seasonId: "s-1",
      phase: SeasonPhase.racing,
      status: EntryStatus.active,
      creditsOn: false,
    });
    const [c1, c2, c3, c4] = view.cards;
    expect(c1).toMatchObject({ state: "negotiating", sponsorName: null, value: null });
    expect(c1.fallbackItems.map((x) => x.name)).toEqual(["빌더 무료 티어 가이드", "무료 배포 경로"]);
    expect(c2.fallbackItems).toEqual([{ name: "운영이 적은 폴백" }]);
    /* 카드 행이 없어도 폴백이 선다 */
    expect(c3.fallbackItems.map((x) => x.name)).toEqual(["GA4", "Search Console", "Threads 운영 가이드"]);
    expect(c4.fallbackItems).toEqual([]);
  });

  it("켜져 있으면 스폰서 카드 그대로", async () => {
    seed();
    db.creditOffer.findMany.mockResolvedValue([
      {
        id: "o-1",
        kind: CreditKind.c1,
        status: CreditOfferStatus.active,
        description: null,
        value: "$75",
        releaseDate: null,
        validUntil: null,
        deliveryMethod: CreditDelivery.code_pool,
        inviteUrl: null,
        howtoUrl: null,
        redeemNote: null,
        fallbackUrl: null,
        fallbackItems: [],
        sponsor: { name: "Replit", mark: "R", logoUrl: null },
      },
    ]);
    db.creditClaim.findMany.mockResolvedValue([]);
    const view = await loadCreditCenter({
      entryId: "e-1",
      seasonId: "s-1",
      phase: SeasonPhase.racing,
      status: EntryStatus.active,
      creditsOn: true,
    });
    expect(view.cards[0]).toMatchObject({ state: "available", sponsorName: "Replit", value: "$75" });
  });
});
