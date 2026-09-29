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
    creditOffer: { findUnique: vi.fn() },
    creditClaim: { findUnique: vi.fn() },
    entry: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    submission: { findFirst: vi.fn() },
    judgment: { findFirst: vi.fn() },
    award: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/dev-clock", () => ({ devNow: () => new Date("2026-10-20T12:00:00+09:00") }));

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
} from "@/lib/credits-store";
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
    season: { phase: SeasonPhase.racing },
    ...over.offer,
  });
  db.entry.findUnique.mockResolvedValue({ seasonId: "s-1", status: EntryStatus.active, ...over.entry });
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

  it("탈락·실격 팀은 새로 받지 못한다", async () => {
    seed({ entry: { status: EntryStatus.eliminated } });
    expect(await claimCredit({ entryId: "e-1", offerId: "o-1" })).toEqual({ ok: false, code: "INACTIVE" });
    seed({ entry: { status: EntryStatus.disqualified } });
    expect(await claimCredit({ entryId: "e-1", offerId: "o-1" })).toEqual({ ok: false, code: "INACTIVE" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("시상 발표 뒤에는 활성 카드라도 받지 못한다", async () => {
    seed({ offer: { season: { phase: SeasonPhase.awarded } } });
    expect(await claimCredit({ entryId: "e-1", offerId: "o-1" })).toEqual({ ok: false, code: "ENDED" });
  });
  it("안 연 카드·협의 중·이미 받은 카드", async () => {
    seed({ s1: false });
    expect(await claimCredit({ entryId: "e-1", offerId: "o-1" })).toEqual({ ok: false, code: "LOCKED" });
    seed({ offer: { status: CreditOfferStatus.negotiating } });
    expect(await claimCredit({ entryId: "e-1", offerId: "o-1" })).toEqual({ ok: false, code: "NEGOTIATING" });
    seed({ claim: { status: CreditClaimStatus.delivered } });
    expect(await claimCredit({ entryId: "e-1", offerId: "o-1" })).toEqual({ ok: false, code: "ALREADY_CLAIMED" });
  });
});

describe("issueCredit — 발급 몸통", () => {
  const offer = {
    id: "o-1",
    kind: CreditKind.c1,
    deliveryMethod: CreditDelivery.code_pool,
    releaseDate: null as Date | null,
  };
  const args = { entryId: "e-1", via: CreditDeliveredVia.manual, now: NOW, today: NOW };

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
  it("지급 예정일 전이면 코드를 태우지 않고 발급 예정으로 둔다", async () => {
    const tx = txOf({});
    const later = { ...offer, releaseDate: at("2026-10-26T00:00:00") };
    expect(await issueCredit(tx as any, { offer: later, ...args })).toEqual({ ok: true, code: null, scheduled: true });
    expect(tx.creditCode.findFirst).not.toHaveBeenCalled();
  });
});
