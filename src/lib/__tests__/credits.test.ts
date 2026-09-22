import { describe, expect, it } from "vitest";

import {
  CreditClaimStatus,
  CreditKind,
  CreditOfferStatus,
  CreditUnlockEvent,
  SeasonPhase,
} from "@/generated/prisma/enums";
import {
  type CreditCardState,
  creditCardState,
  creditSeason,
  creditValueTotal,
  creditsPane,
  isOpenedCard,
  maskCreditCode,
  nextUnlock,
  sumCreditValues,
} from "@/lib/credits";

const st = (over: Partial<Parameters<typeof creditCardState>[0]>) =>
  creditCardState({
    kind: CreditKind.c1,
    offerStatus: CreditOfferStatus.active,
    claimStatus: null,
    unlocked: false,
    season: "racing",
    ...over,
  });

describe("카드 상태 — 시안 일곱 판의 규칙", () => {
  it("모집 중엔 스폰서 없는 카드가 전부 협의 중이다(①)", () => {
    expect(st({ offerStatus: CreditOfferStatus.negotiating, season: "pre" })).toBe("negotiating");
    expect(
      st({ kind: CreditKind.c4, offerStatus: CreditOfferStatus.negotiating, season: "pre" }),
    ).toBe("negotiating");
  });
  it("레이스 중 안 열린 카드는 스폰서가 없어도 잠금이다(②③④의 C3)", () => {
    expect(st({ offerStatus: CreditOfferStatus.negotiating })).toBe("locked");
    expect(st({})).toBe("locked");
  });
  it("열렸는데 스폰서가 없으면 협의 중, 열림(⑤의 C3)", () => {
    expect(st({ offerStatus: CreditOfferStatus.negotiating, unlocked: true })).toBe("negotiating");
  });
  it("발급 기록이 카드 상태를 이긴다", () => {
    expect(st({ claimStatus: CreditClaimStatus.scheduled })).toBe("scheduled");
    expect(st({ claimStatus: CreditClaimStatus.delivered, season: "over" })).toBe("delivered");
    expect(
      st({ claimStatus: CreditClaimStatus.confirmed, offerStatus: CreditOfferStatus.negotiating }),
    ).toBe("confirmed");
    expect(st({ claimStatus: CreditClaimStatus.available, unlocked: true })).toBe("available");
  });
  it("시즌이 끝나면 못 연 카드는 만료(⑦의 C3), 시상 카드는 확정이거나 만료", () => {
    expect(st({ offerStatus: CreditOfferStatus.negotiating, unlocked: true, season: "over" })).toBe("expired");
    expect(st({ season: "over" })).toBe("expired");
    expect(st({ claimStatus: CreditClaimStatus.available, unlocked: true, season: "over" })).toBe("expired");
    expect(st({ kind: CreditKind.c4, unlocked: true, season: "over" })).toBe("awarded");
    expect(st({ kind: CreditKind.c4, season: "over" })).toBe("expired");
    expect(st({ kind: CreditKind.c4 })).toBe("award");
  });
  it("시즌 구간", () => {
    expect(creditSeason(SeasonPhase.recruiting)).toBe("pre");
    expect(creditSeason(SeasonPhase.racing)).toBe("racing");
    expect(creditSeason(SeasonPhase.awarded)).toBe("over");
    expect(creditSeason(SeasonPhase.archived)).toBe("over");
  });
});

describe("열린 혜택 — 시안 `last`와 같은 규칙", () => {
  it("협의 중·만료는 조건이 채워졌을 때만 센다", () => {
    expect(isOpenedCard("negotiating", false)).toBe(false);
    expect(isOpenedCard("negotiating", true)).toBe(true);
    expect(isOpenedCard("expired", true)).toBe(true);
    expect(isOpenedCard("locked", true)).toBe(false);
    expect(isOpenedCard("award", false)).toBe(false);
    expect(isOpenedCard("awarded", true)).toBe(true);
    expect(isOpenedCard("scheduled", true)).toBe(true);
  });
});

describe("예상 가치 합계", () => {
  it("통화별로 더하고 못 읽는 표기는 뺀다", () => {
    expect(sumCreditValues(["$75", "$50"])).toBe("$125");
    expect(sumCreditValues(["$75", "₩10,000", "상위 3팀"])).toBe("$75 + ₩10,000");
    expect(sumCreditValues([null, "상당"])).toBeNull();
  });
  const card = (kind: CreditKind, state: CreditCardState, unlocked: boolean, value: string | null) => ({
    kind, state, unlocked, value,
  });
  it("① 「-」, ② 「$0」, ④ 「$125」", () => {
    expect(creditValueTotal([
      card(CreditKind.c1, "negotiating", false, null),
      card(CreditKind.c4, "negotiating", false, null),
    ])).toBe("-");
    expect(creditValueTotal([
      card(CreditKind.c1, "locked", false, "$75"),
      card(CreditKind.c4, "award", false, "상위 3팀"),
    ])).toBe("$0");
    expect(creditValueTotal([
      card(CreditKind.c1, "delivered", true, "$75"),
      card(CreditKind.c2, "available", true, "$50"),
      card(CreditKind.c3, "locked", false, null),
      card(CreditKind.c4, "award", false, "상위 3팀"),
    ])).toBe("$125");
  });
});

describe("다음 언락", () => {
  const base = (kind: CreditKind, code: string, unlockEvent: CreditUnlockEvent) => ({
    kind, code, title: code, unlockEvent, releaseDate: null, validUntil: null,
  });
  const c1 = base(CreditKind.c1, "C1", CreditUnlockEvent.s1_submitted);
  const c2 = base(CreditKind.c2, "C2", CreditUnlockEvent.gate1_passed);
  const c3 = base(CreditKind.c3, "C3", CreditUnlockEvent.deploy_verified);
  const c4 = base(CreditKind.c4, "C4", CreditUnlockEvent.final_confirmed);
  const at = (state: CreditCardState, unlocked: boolean) => ({ state, unlocked });

  it("② 다음은 C1, ④ C2가 발급 가능이어도 다음은 잠긴 C3", () => {
    const locked = nextUnlock({
      season: "racing", eliminated: false, failedGate: 1,
      cards: [{ ...c1, ...at("locked", false) }, { ...c2, ...at("locked", false) }, { ...c3, ...at("locked", false) }, { ...c4, ...at("award", false) }],
    });
    expect(locked).toMatchObject({ kind: "unlock", card: { code: "C1" }, via: null });
    const build = nextUnlock({
      season: "racing", eliminated: false, failedGate: 1,
      cards: [{ ...c1, ...at("delivered", true) }, { ...c2, ...at("available", true) }, { ...c3, ...at("locked", false) }, { ...c4, ...at("award", false) }],
    });
    expect(build).toMatchObject({ kind: "unlock", card: { code: "C3" } });
  });
  it("③ 발급 예정이 먼저, ⑤ 협의 중인 C3을 거쳐 시상으로", () => {
    const release = new Date("2026-10-26T00:00:00+09:00");
    const sched = nextUnlock({
      season: "racing", eliminated: false, failedGate: 1,
      cards: [{ ...c1, ...at("scheduled", true), releaseDate: release }, { ...c2, ...at("locked", false) }, { ...c3, ...at("locked", false) }, { ...c4, ...at("award", false) }],
    });
    expect(sched).toMatchObject({ kind: "scheduled", card: { code: "C1" }, at: release });
    const race = nextUnlock({
      season: "racing", eliminated: false, failedGate: 1,
      cards: [{ ...c1, ...at("confirmed", true) }, { ...c2, ...at("delivered", true) }, { ...c3, ...at("negotiating", true) }, { ...c4, ...at("award", false) }],
    });
    expect(race).toMatchObject({ kind: "unlock", card: { code: "C4" }, via: { code: "C3" } });
  });
  it("⑥ 테스터, ⑦ 종료(가장 이른 유효기간)", () => {
    const tester = nextUnlock({
      season: "racing", eliminated: true, failedGate: 1,
      cards: [{ ...c1, ...at("delivered", true) }, { ...c2, ...at("locked", false) }, { ...c3, ...at("locked", false) }, { ...c4, ...at("award", false) }],
    });
    expect(tester).toMatchObject({ kind: "tester", gate: 1, next: { code: "C2" } });
    const nov = new Date("2026-11-30T00:00:00+09:00");
    const dec = new Date("2026-12-31T00:00:00+09:00");
    const end = nextUnlock({
      season: "over", eliminated: false, failedGate: 1,
      cards: [{ ...c1, ...at("confirmed", true), validUntil: nov }, { ...c2, ...at("delivered", true), validUntil: dec }, { ...c3, ...at("expired", true) }, { ...c4, ...at("awarded", true) }],
    });
    expect(end).toMatchObject({ kind: "over", until: nov });
  });
});

describe("시안 판 되짚기", () => {
  const cards = (s1: CreditCardState, s3: CreditCardState, u3 = false) => [
    { kind: CreditKind.c1, state: s1, unlocked: s1 !== "locked" },
    { kind: CreditKind.c2, state: "locked" as CreditCardState, unlocked: false },
    { kind: CreditKind.c3, state: s3, unlocked: u3 },
    { kind: CreditKind.c4, state: "award" as CreditCardState, unlocked: false },
  ];
  it("일곱 판", () => {
    expect(creditsPane({ season: "pre", eliminated: false, cards: cards("negotiating", "negotiating").map((c) => ({ ...c, state: "negotiating" as const })) })).toBe("pend");
    expect(creditsPane({ season: "racing", eliminated: false, cards: cards("locked", "locked") })).toBe("locked");
    expect(creditsPane({ season: "racing", eliminated: false, cards: cards("scheduled", "locked") })).toBe("sched");
    expect(creditsPane({ season: "racing", eliminated: false, cards: cards("delivered", "locked") })).toBe("build");
    expect(creditsPane({ season: "racing", eliminated: false, cards: cards("confirmed", "negotiating", true) })).toBe("race");
    expect(creditsPane({ season: "racing", eliminated: true, cards: cards("delivered", "locked") })).toBe("tester");
    expect(creditsPane({ season: "over", eliminated: false, cards: cards("confirmed", "expired", true) })).toBe("end");
  });
});

describe("코드 가리기", () => {
  it("시안처럼 마지막 앞 마디를 가린다", () => {
    expect(maskCreditCode("RPL-PRV-7K2Q-M3XA")).toBe("RPL-PRV-••••-M3XA");
  });
  it("마디가 없으면 뒤 넷만 남긴다", () => {
    expect(maskCreditCode("vercel.com/claim/prv-s1-4f8b")).toBe("••••••.•••/•••••/•••-••-4f8b");
    expect(maskCreditCode("abcd")).toBe("abcd");
  });
});
