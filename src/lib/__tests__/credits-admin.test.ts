/*
  운영 콘솔 스폰서 화면의 쓰기 — 등록 폼이 있는 카드를 덮지 않는가(admin-store
  `saveCreditOffer`), 수동 발급이 화면과 같은 판정을 거치는가(`deliverCreditManually`).

  돌리는 법:  npm test
  DB를 부르지 않는다. 판정 자체(카드 상태)는 credits.test.ts·credits-store.test.ts가 본다.
*/
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    creditOffer: { findUnique: vi.fn() },
    entry: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/credits-store", () => ({
  gate1Settled: vi.fn(),
  issueCredit: vi.fn(),
  judgeCredit: vi.fn(),
  noticeCreditDelivered: vi.fn(async () => ({ mailFailed: [] })),
  resendCreditDelivery: vi.fn(),
}));

import { CreditDelivery, CreditKind, CreditOfferStatus, CreditUnlockEvent } from "@/generated/prisma/enums";
import { batchDeliverCredits, deliverCreditManually, resendCreditMail, saveCreditOffer } from "@/lib/admin-store";
import { issueCredit, judgeCredit, noticeCreditDelivered, resendCreditDelivery } from "@/lib/credits-store";
import { prisma } from "@/lib/prisma";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const OFFER = {
  seasonId: "s-1",
  kind: CreditKind.c1,
  status: CreditOfferStatus.negotiating,
  sponsorName: null,
  unlockEvent: CreditUnlockEvent.s1_submitted,
  deliveryMethod: CreditDelivery.manual,
  releaseDate: null,
  validUntil: null,
  inviteUrl: null,
  howtoUrl: null,
  redeemNote: null,
  description: null,
  value: null,
  fallbackUrl: null,
  reason: "스폰서 확정 메일",
  actorId: "admin-1",
};

describe("혜택 등록 — 있는 카드를 덮지 않는다", () => {
  beforeEach(() => vi.clearAllMocks());

  it("등록 폼으로 이미 있는 카드를 고르면 거절한다", async () => {
    db.creditOffer.findUnique.mockResolvedValue({ id: "o-1", status: CreditOfferStatus.active });
    const r = await saveCreditOffer({ ...OFFER, mode: "create" });
    expect(r).toMatchObject({ ok: false });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("편집은 있는 카드를 고친다", async () => {
    db.creditOffer.findUnique.mockResolvedValue({ id: "o-1", status: CreditOfferStatus.active });
    db.$transaction.mockResolvedValue(undefined);
    expect(await saveCreditOffer({ ...OFFER, mode: "edit" })).toEqual({ ok: true });
  });
});

describe("수동 발급 — 화면이 「발급 가능」인 칸만", () => {
  beforeEach(() => vi.clearAllMocks());
  const args = { offerId: "o-1", entryId: "e-1", reason: "스폰서 요청으로 보냄", actorId: "admin-1" };

  it("잠긴 칸(실격 팀·안 연 카드)은 보내지 않는다", async () => {
    vi.mocked(judgeCredit).mockResolvedValue({ ok: true, state: "locked", active: false, due: true, offer: {} } as any);
    expect(await deliverCreditManually(args)).toMatchObject({ ok: false });
    expect(issueCredit).not.toHaveBeenCalled();
  });
  it("다른 시즌의 카드는 없는 것으로 본다", async () => {
    vi.mocked(judgeCredit).mockResolvedValue({ ok: false, code: "NOT_FOUND" });
    expect(await deliverCreditManually(args)).toMatchObject({ ok: false });
  });
});

describe("수동 발급 — 수동형은 운영자가 코드를 적는다", () => {
  beforeEach(() => vi.clearAllMocks());
  const args = { offerId: "o-1", entryId: "e-1", reason: "스폰서에게 받은 코드", actorId: "admin-1" };
  const manual = { id: "o-1", kind: CreditKind.c2, deliveryMethod: CreditDelivery.manual, releaseDate: null };
  const tx = { auditLog: { create: vi.fn() } };

  it("코드를 안 적으면 보내지 않는다", async () => {
    vi.mocked(judgeCredit).mockResolvedValue({ ok: true, state: "available", active: true, due: true, awaitingCode: false, offer: manual } as any);
    expect(await deliverCreditManually({ ...args, code: "  " })).toMatchObject({ ok: false });
    expect(issueCredit).not.toHaveBeenCalled();
  });
  it("빈칸이 든 코드는 거절한다 — 설명 글이 섞인 것이다", async () => {
    vi.mocked(judgeCredit).mockResolvedValue({ ok: true, state: "available", active: true, due: true, awaitingCode: false, offer: manual } as any);
    expect(await deliverCreditManually({ ...args, code: "HAND 1" })).toMatchObject({ ok: false });
  });
  it("코드를 기다리는 칸(받기를 눌러 둔 수동형)을 채우고 메일을 보낸다", async () => {
    vi.mocked(judgeCredit).mockResolvedValue({ ok: true, state: "scheduled", active: true, due: true, awaitingCode: true, offer: manual } as any);
    db.$transaction.mockImplementation((fn: (t: unknown) => unknown) => fn(tx));
    vi.mocked(issueCredit).mockResolvedValue({ ok: true, code: "HAND-1", scheduled: false });
    expect(await deliverCreditManually({ ...args, code: "HAND-1" })).toEqual({
      ok: true,
      kind: CreditKind.c2,
      scheduled: false,
      mailFailed: false,
    });
    expect(vi.mocked(issueCredit).mock.calls[0][1]).toMatchObject({ manualCode: "HAND-1" });
    expect(noticeCreditDelivered).toHaveBeenCalledWith({ offerId: "o-1", deliveries: [{ entryId: "e-1", code: "HAND-1" }] });
  });
  it("그냥 발급 예정인 칸(코드 풀)은 수동 발급하지 않는다", async () => {
    vi.mocked(judgeCredit).mockResolvedValue({ ok: true, state: "scheduled", active: true, due: false, awaitingCode: false, offer: { ...manual, deliveryMethod: CreditDelivery.code_pool } } as any);
    expect(await deliverCreditManually(args)).toMatchObject({ ok: false });
    expect(issueCredit).not.toHaveBeenCalled();
  });
  it("이미 있는 코드면 알려 준다", async () => {
    vi.mocked(judgeCredit).mockResolvedValue({ ok: true, state: "available", active: true, due: true, awaitingCode: false, offer: manual } as any);
    db.$transaction.mockImplementation((fn: (t: unknown) => unknown) => fn(tx));
    vi.mocked(issueCredit).mockResolvedValue({ ok: false, code: "CODE_TAKEN" });
    expect(await deliverCreditManually({ ...args, code: "HAND-1" })).toEqual({
      ok: false,
      message: expect.stringContaining("이미 등록된 코드"),
    });
  });
  it("메일이 실패하면 결과에 싣는다", async () => {
    vi.mocked(judgeCredit).mockResolvedValue({ ok: true, state: "available", active: true, due: true, awaitingCode: false, offer: manual } as any);
    db.$transaction.mockImplementation((fn: (t: unknown) => unknown) => fn(tx));
    vi.mocked(issueCredit).mockResolvedValue({ ok: true, code: "HAND-1", scheduled: false });
    vi.mocked(noticeCreditDelivered).mockResolvedValueOnce({ mailFailed: ["e-1"] });
    expect(await deliverCreditManually({ ...args, code: "HAND-1" })).toMatchObject({ ok: true, mailFailed: true });
  });
});

describe("재발송 — 발급된 칸만, 사유와 함께", () => {
  beforeEach(() => vi.clearAllMocks());
  const args = { offerId: "o-1", entryId: "e-1", reason: "팀이 메일을 못 받았다고 문의", actorId: "admin-1" };

  it("발급 전·만료 칸은 다시 보내지 않는다", async () => {
    vi.mocked(judgeCredit).mockResolvedValue({ ok: true, state: "available", active: true, due: true, awaitingCode: false, offer: {} } as any);
    expect(await resendCreditMail(args)).toMatchObject({ ok: false });
    vi.mocked(judgeCredit).mockResolvedValue({ ok: true, state: "expired", active: true, due: true, awaitingCode: false, offer: {} } as any);
    expect(await resendCreditMail(args)).toEqual({ ok: false, message: "만료된 칸입니다." });
    expect(resendCreditDelivery).not.toHaveBeenCalled();
  });
  it("사유가 짧으면 거절한다", async () => {
    expect(await resendCreditMail({ ...args, reason: "a" })).toMatchObject({ ok: false });
    expect(judgeCredit).not.toHaveBeenCalled();
  });
  it("보내고 감사 로그에 운영자 줄을 남긴다", async () => {
    const audit = vi.fn();
    vi.mocked(judgeCredit).mockResolvedValue({ ok: true, state: "delivered", active: true, due: true, awaitingCode: false, offer: {} } as any);
    vi.mocked(resendCreditDelivery).mockResolvedValue({ ok: true, failed: true, kind: CreditKind.c1, teamName: "리틀포션" });
    db.$transaction.mockImplementation((fn: (t: unknown) => unknown) => fn({ auditLog: { create: audit } }));
    expect(await resendCreditMail(args)).toEqual({ ok: true, mailFailed: true });
    expect(audit.mock.calls[0][0].data).toMatchObject({
      actorId: "admin-1",
      action: "credit.resend",
      targetType: "entry",
      targetId: "e-1",
      meta: { kind: CreditKind.c1, entryId: "e-1", failed: true },
    });
  });
});

describe("일괄 발송 — 수동형은 한꺼번에 보내지 않는다", () => {
  beforeEach(() => vi.clearAllMocks());
  it("수동형 카드는 거절한다 — 코드 없는 발급이 된다", async () => {
    db.creditOffer.findUnique.mockResolvedValue({
      id: "o-1",
      kind: CreditKind.c2,
      status: CreditOfferStatus.active,
      deliveryMethod: CreditDelivery.manual,
      releaseDate: null,
    });
    expect(await batchDeliverCredits({ offerId: "o-1", entryIds: ["e-1"], actorId: "admin-1" })).toMatchObject({
      ok: false,
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
