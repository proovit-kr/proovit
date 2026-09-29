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
    creditOffer: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    creditClaim: { findUnique: vi.fn(), findMany: vi.fn() },
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
  releaseScheduledCredits,
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
    season: { phase: SeasonPhase.racing },
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

  it("보낼 것이 없는 발급(수동 방식, 코드·링크 없음)에는 「발급됐어요」를 보내지 않는다", async () => {
    const manual = { ...c1, deliveryMethod: CreditDelivery.manual };
    db.creditOffer.findUniqueOrThrow.mockResolvedValue({
      kind: CreditKind.c1,
      deliveryMethod: CreditDelivery.manual,
      inviteUrl: null,
      validUntil: null,
      redeemNote: null,
      sponsor: null,
    });
    db.creditClaim.findMany.mockResolvedValue([row("pass", { stage: EntryStage.s3, status: EntryStatus.active }, manual)]);
    expect(await releaseScheduledCredits()).toMatchObject({ released: 1 });
    expect(db.notification.createMany).not.toHaveBeenCalled();
    expect(sendCreditMail).not.toHaveBeenCalled();
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
