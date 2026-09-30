import { describe, expect, it } from "vitest";

import {
  CreditClaimStatus,
  CreditKind,
  CreditOfferStatus,
  CreditUnlockEvent,
  EntryStatus,
  SeasonPhase,
} from "@/generated/prisma/enums";
import {
  type CreditCardState,
  claimRefusal,
  creditCardState,
  creditLapsed,
  creditSeason,
  creditValueTotal,
  creditsPane,
  isOpenedCard,
  maskCreditCode,
  nextUnlock,
  parseCodeList,
  releaseDue,
  sumCreditValues,
} from "@/lib/credits";

const st = (over: Partial<Parameters<typeof creditCardState>[0]>) =>
  creditCardState({
    kind: CreditKind.c1,
    offerStatus: CreditOfferStatus.active,
    claimStatus: null,
    unlocked: false,
    season: "racing",
    status: EntryStatus.active,
    lapsed: false,
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
  it("참가가 멈춘 팀은 받은 것만 남고 나머지는 잠금이다(⑥, 운영 표의 실격 줄)", () => {
    const dq = EntryStatus.disqualified;
    const out = EntryStatus.eliminated;
    expect(st({ unlocked: true, status: out })).toBe("locked");
    expect(st({ offerStatus: CreditOfferStatus.negotiating, unlocked: true, status: dq })).toBe("locked");
    expect(st({ claimStatus: CreditClaimStatus.available, unlocked: true, status: out })).toBe("locked");
    expect(st({ claimStatus: CreditClaimStatus.delivered, status: dq })).toBe("delivered");
    expect(st({ unlocked: true, status: out, season: "over" })).toBe("expired");
  });
  it("나가지 않을 발급 예정은 예정으로 그리지 않는다", () => {
    const sched = CreditClaimStatus.scheduled;
    /* 게이트 1에서 떨어진 팀의 C1은 나간다 — 예정 그대로 */
    expect(st({ claimStatus: sched, status: EntryStatus.eliminated })).toBe("scheduled");
    /* 실격·포기 팀, 탈락 팀의 C1 아닌 카드는 안 나간다 — 잠금 */
    expect(st({ claimStatus: sched, status: EntryStatus.disqualified })).toBe("locked");
    expect(st({ claimStatus: sched, status: EntryStatus.withdrawn })).toBe("locked");
    expect(st({ kind: CreditKind.c2, claimStatus: sched, status: EntryStatus.eliminated })).toBe("locked");
    /* 끝난 카드·시즌이면 만료 */
    expect(st({ claimStatus: sched, offerStatus: CreditOfferStatus.ended })).toBe("expired");
    expect(st({ claimStatus: sched, season: "over" })).toBe("expired");
  });
  it("유효기간이 지나면 받은 코드도 만료다 — 안 받은 카드는 못 받는다", () => {
    expect(st({ claimStatus: CreditClaimStatus.delivered, lapsed: true })).toBe("expired");
    expect(st({ claimStatus: CreditClaimStatus.confirmed, lapsed: true })).toBe("expired");
    expect(st({ claimStatus: CreditClaimStatus.scheduled, lapsed: true })).toBe("expired");
    expect(st({ unlocked: true, lapsed: true })).toBe("expired");
  });
  it("시즌 구간", () => {
    expect(creditSeason(SeasonPhase.recruiting)).toBe("pre");
    expect(creditSeason(SeasonPhase.racing)).toBe("racing");
    expect(creditSeason(SeasonPhase.awarded)).toBe("over");
    expect(creditSeason(SeasonPhase.archived)).toBe("over");
  });
});

describe("유효기간과 지급 시점", () => {
  const kst = (x: string) => new Date(`${x}+09:00`);
  it("유효기간 날짜는 그날 끝까지 쓴다", () => {
    const until = kst("2026-11-30T00:00:00");
    expect(creditLapsed(until, kst("2026-11-30T23:59:00"))).toBe(false);
    expect(creditLapsed(until, kst("2026-12-01T00:00:00"))).toBe(true);
    expect(creditLapsed(null, kst("2030-01-01T00:00:00"))).toBe(false);
  });
  it("C1은 달력이 아니라 그 팀의 게이트 1이다 — 통과든 탈락이든 가려지면 보낸다", () => {
    const today = kst("2026-10-05T12:00:00");
    const later = kst("2026-10-12T00:00:00");
    const active = EntryStatus.active;
    expect(releaseDue({ kind: CreditKind.c1, releaseDate: later, gate1Settled: true, status: active, today })).toBe(true);
    expect(releaseDue({ kind: CreditKind.c1, releaseDate: null, gate1Settled: false, status: active, today })).toBe(false);
    expect(releaseDue({ kind: CreditKind.c1, releaseDate: null, gate1Settled: true, status: EntryStatus.eliminated, today })).toBe(true);
    expect(releaseDue({ kind: CreditKind.c1, releaseDate: null, gate1Settled: true, status: EntryStatus.disqualified, today })).toBe(false);
  });
  it("그 밖의 카드는 지급 예정일이 오면", () => {
    const today = kst("2026-10-05T12:00:00");
    const active = EntryStatus.active;
    expect(releaseDue({ kind: CreditKind.c2, releaseDate: kst("2026-10-12T00:00:00"), gate1Settled: true, status: active, today })).toBe(false);
    expect(releaseDue({ kind: CreditKind.c2, releaseDate: kst("2026-10-05T00:00:00"), gate1Settled: false, status: active, today })).toBe(true);
    expect(releaseDue({ kind: CreditKind.c3, releaseDate: null, gate1Settled: false, status: active, today })).toBe(true);
    /* 탈락 팀의 C1 아닌 카드는 날짜가 와도 안 나간다 */
    expect(releaseDue({ kind: CreditKind.c2, releaseDate: null, gate1Settled: true, status: EntryStatus.eliminated, today })).toBe(false);
  });
});

describe("다음 언락 — 실격·포기", () => {
  it("새로 열릴 카드가 없다고 말한다(채운 조건을 다시 안내하지 않는다)", () => {
    expect(nextUnlock({ season: "racing", active: false, eliminated: false, failedGate: 1, cards: [] })).toEqual({ kind: "closed" });
  });
});

describe("받기를 막는 까닭 — 카드 상태 그대로", () => {
  it("발급 가능만 통과한다", () => {
    expect(claimRefusal("available", true)).toBeNull();
    expect(claimRefusal("negotiating", true)).toBe("NEGOTIATING");
    expect(claimRefusal("locked", true)).toBe("LOCKED");
    expect(claimRefusal("award", true)).toBe("LOCKED");
    expect(claimRefusal("scheduled", true)).toBe("ALREADY_CLAIMED");
    expect(claimRefusal("delivered", true)).toBe("ALREADY_CLAIMED");
    expect(claimRefusal("confirmed", true)).toBe("ALREADY_CLAIMED");
    expect(claimRefusal("expired", true)).toBe("ENDED");
  });
  it("참가가 멈춘 팀의 잠금은 까닭을 따로 댄다", () => {
    expect(claimRefusal("locked", false)).toBe("INACTIVE");
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
      season: "racing", active: true, eliminated: false, failedGate: 1,
      cards: [{ ...c1, ...at("locked", false) }, { ...c2, ...at("locked", false) }, { ...c3, ...at("locked", false) }, { ...c4, ...at("award", false) }],
    });
    expect(locked).toMatchObject({ kind: "unlock", card: { code: "C1" }, via: null });
    const build = nextUnlock({
      season: "racing", active: true, eliminated: false, failedGate: 1,
      cards: [{ ...c1, ...at("delivered", true) }, { ...c2, ...at("available", true) }, { ...c3, ...at("locked", false) }, { ...c4, ...at("award", false) }],
    });
    expect(build).toMatchObject({ kind: "unlock", card: { code: "C3" } });
  });
  it("③ 발급 예정이 먼저, ⑤ 협의 중인 C3을 거쳐 시상으로", () => {
    const release = new Date("2026-10-26T00:00:00+09:00");
    const sched = nextUnlock({
      season: "racing", active: true, eliminated: false, failedGate: 1,
      cards: [{ ...c1, ...at("scheduled", true), releaseDate: release }, { ...c2, ...at("locked", false) }, { ...c3, ...at("locked", false) }, { ...c4, ...at("award", false) }],
    });
    /* C1은 날짜가 아니라 게이트 1이다 — 때를 비운다 */
    expect(sched).toMatchObject({ kind: "scheduled", card: { code: "C1" }, at: null });
    const dated = nextUnlock({
      season: "racing", active: true, eliminated: false, failedGate: 1,
      cards: [{ ...c1, ...at("delivered", true) }, { ...c2, ...at("scheduled", true), releaseDate: release }, { ...c3, ...at("locked", false) }, { ...c4, ...at("award", false) }],
    });
    expect(dated).toMatchObject({ kind: "scheduled", card: { code: "C2" }, at: release });
    const race = nextUnlock({
      season: "racing", active: true, eliminated: false, failedGate: 1,
      cards: [{ ...c1, ...at("confirmed", true) }, { ...c2, ...at("delivered", true) }, { ...c3, ...at("negotiating", true) }, { ...c4, ...at("award", false) }],
    });
    expect(race).toMatchObject({ kind: "unlock", card: { code: "C4" }, via: { code: "C3" } });
  });
  it("⑥ 테스터, ⑦ 종료(가장 이른 유효기간)", () => {
    const tester = nextUnlock({
      season: "racing", active: false, eliminated: true, failedGate: 1,
      cards: [{ ...c1, ...at("delivered", true) }, { ...c2, ...at("locked", false) }, { ...c3, ...at("locked", false) }, { ...c4, ...at("award", false) }],
    });
    expect(tester).toMatchObject({ kind: "tester", gate: 1, next: { code: "C2" } });
    const nov = new Date("2026-11-30T00:00:00+09:00");
    const dec = new Date("2026-12-31T00:00:00+09:00");
    const end = nextUnlock({
      season: "over", active: true, eliminated: false, failedGate: 1,
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

describe("코드 풀 업로드 — 글에서 코드만", () => {
  it("한 줄에 하나, 쉼표로 이은 한 줄", () => {
    expect(parseCodeList("A-1\nA-2\r\n\nA-3\n")).toEqual({ ok: true, codes: ["A-1", "A-2", "A-3"] });
    expect(parseCodeList("\uFEFFA-1, A-2;A-3")).toEqual({ ok: true, codes: ["A-1", "A-2", "A-3"] });
  });
  it("표면 머리 줄의 코드 열만 쓰고 머리 줄은 뺀다", () => {
    const csv = 'id,Promo Code,amount,expires\n1,"RPL-1",75,2026-11-30\n2,RPL-2,75,2026-11-30';
    expect(parseCodeList(csv)).toEqual({ ok: true, codes: ["RPL-1", "RPL-2"] });
  });
  it("한 열짜리 표의 머리 줄은 코드가 아니다", () => {
    expect(parseCodeList("Code\nRPL-AAAA-1111\nRPL-BBBB-2222")).toEqual({ ok: true, codes: ["RPL-AAAA-1111", "RPL-BBBB-2222"] });
    expect(parseCodeList("Promo Code\r\nRPL-1")).toEqual({ ok: true, codes: ["RPL-1"] });
    expect(parseCodeList("code")).toMatchObject({ ok: false });
  });
  it("코드 열을 못 찾으면 추측하지 않고 거절한다", () => {
    expect(parseCodeList("id,amount\n1,75\n2,75")).toMatchObject({ ok: false });
  });
  it("빈칸 섞인 값·빈 글은 거절한다", () => {
    expect(parseCodeList("RPL-1\n코드 발급 안내드립니다")).toMatchObject({ ok: false });
    expect(parseCodeList(" \n ")).toMatchObject({ ok: false });
  });
});
