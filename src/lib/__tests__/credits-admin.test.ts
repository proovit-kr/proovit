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
  },
}));
vi.mock("@/lib/credits-store", () => ({
  gate1Settled: vi.fn(),
  issueCredit: vi.fn(),
  judgeCredit: vi.fn(),
  noticeCreditDelivered: vi.fn(),
}));

import { CreditDelivery, CreditKind, CreditOfferStatus, CreditUnlockEvent } from "@/generated/prisma/enums";
import { deliverCreditManually, saveCreditOffer } from "@/lib/admin-store";
import { issueCredit, judgeCredit } from "@/lib/credits-store";
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
