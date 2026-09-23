import { describe, expect, it } from "vitest";

import { endOfSeoulDay } from "@/lib/appeal";
import {
  buildJudgmentsView,
  fmtScore,
  fmtWeights,
  formulaText,
  paneOf,
  parseFinalScore,
  splitFeedback,
} from "@/lib/judgments-view";

/* 개발 바 「심사 결과 ④」가 심는 시안 목업 */
const SPEC_SCORE = {
  items: {
    T1: { raw: "V 1,248", score: 80.8 },
    T2: { raw: "r 2.0배", score: 66.7 },
    T3: { raw: "유효 채널 3.35", score: 100 },
    R1: { raw: "W ₩126,000", score: 44.4 },
    R2: { raw: "0.62%", score: 35.2 },
    R3: { raw: "결제형 L3, 결제자 7인", score: 75 },
  },
  compliance: { raw: "주간 제출 누락 0, 증빙 불응 0", factor: 1 },
  rank: { position: 2, teams: 11, floorsMet: true },
};

const at = (iso: string) => new Date(iso);
const judgment = (result: string, feedback: string | null, iso: string, score?: unknown) => ({
  result,
  feedback,
  judgedAt: at(iso),
  scoreBreakdown: score ?? null,
});

describe("paneOf", () => {
  it("2차가 있으면 final, 1차 fail이면 fail, 1차가 있으면 pass, 없으면 none", () => {
    expect(paneOf({ gate1: null, gate2: null })).toBe("none");
    expect(paneOf({ gate1: { result: "pass" }, gate2: null })).toBe("pass");
    expect(paneOf({ gate1: { result: "revision" }, gate2: null })).toBe("pass");
    expect(paneOf({ gate1: { result: "fail" }, gate2: null })).toBe("fail");
    expect(paneOf({ gate1: { result: "pass" }, gate2: { result: "pass" } })).toBe("final");
  });
});

describe("splitFeedback", () => {
  it("첫 문단이 요지, 나머지가 본문", () => {
    expect(splitFeedback("수요 신호 부족\n\n문제 정의는 명확하나…")).toEqual({
      summary: "수요 신호 부족",
      body: "문제 정의는 명확하나…",
    });
    expect(splitFeedback("수요 신호 부족")).toEqual({ summary: "수요 신호 부족", body: null });
    expect(splitFeedback(null)).toEqual({ summary: null, body: null });
    expect(splitFeedback("  \n ")).toEqual({ summary: null, body: null });
  });
});

describe("parseFinalScore", () => {
  it("시안 ④ — 축 80.4·49.3, 총점 68.0, 순위 2/11", () => {
    const s = parseFinalScore(SPEC_SCORE)!;
    expect(s.axes.map((a) => a.score)).toEqual([80.4, 49.3]);
    expect(s.total).toBe(68);
    expect(s.axes[0].items.map((i) => i.key)).toEqual(["T1", "T2", "T3"]);
    expect(s.rank).toEqual({ position: 2, teams: 11, floorsMet: true });
    expect(formulaText(s)).toBe("0.6×80.4 + 0.4×49.3");
  });

  it("계수가 총점을 깎는다", () => {
    const s = parseFinalScore({
      ...SPEC_SCORE,
      compliance: { raw: "주간 제출 누락 1", factor: 0.9 },
    })!;
    expect(s.total).toBe(61.2);
  });

  it("꼴이 어긋나면 null — 항목이 빠지거나 숫자가 아니면", () => {
    expect(parseFinalScore(null)).toBeNull();
    expect(parseFinalScore({})).toBeNull();
    const { T3: _t3, ...rest } = SPEC_SCORE.items;
    void _t3;
    expect(parseFinalScore({ ...SPEC_SCORE, items: rest })).toBeNull();
    expect(
      parseFinalScore({
        ...SPEC_SCORE,
        items: { ...SPEC_SCORE.items, T1: { raw: "V", score: "80" } },
      }),
    ).toBeNull();
  });
});

describe("buildJudgmentsView", () => {
  it("③ — 요지에 게이트 숫자를 붙이고, 기한은 판정 + 5영업일의 23:59(서울)", () => {
    /* 2026-10-26(월) 14:20 서울 판정 → 5영업일 뒤 11-02(월) */
    const v = buildJudgmentsView({
      gate1: judgment("fail", "수요 신호 부족\n\n본문", "2026-10-26T05:20:00Z"),
      gate2: null,
      gateOneNumbers: " (신청 3명, 전환율 0.8%)",
    });
    expect(v.pane).toBe("fail");
    expect(v.reason).toBe("수요 신호 부족 (신청 3명, 전환율 0.8%)");
    expect(v.reasonBody).toBe("본문");
    expect(v.appealBy?.toISOString()).toBe("2026-11-02T14:59:00.000Z");
    expect(v.finalScore).toBeNull();
  });

  it("② — 요지·기한이 없고 점수표도 없다", () => {
    const v = buildJudgmentsView({
      gate1: judgment("pass", "충실합니다.", "2026-10-26T05:20:00Z"),
      gate2: null,
    });
    expect(v.pane).toBe("pass");
    expect(v.reason).toBeNull();
    expect(v.appealBy).toBeNull();
  });

  it("④ — 2차 점수표를 읽는다. 1차 것은 읽지 않는다", () => {
    const v = buildJudgmentsView({
      gate1: judgment("pass", "충실합니다.", "2026-10-26T05:20:00Z", SPEC_SCORE),
      gate2: judgment("pass", null, "2026-11-17T01:00:00Z", SPEC_SCORE),
    });
    expect(v.pane).toBe("final");
    expect(v.finalScore?.total).toBe(68);
    const noScore = buildJudgmentsView({
      gate1: v.gate1,
      gate2: judgment("pass", null, "2026-11-17T01:00:00Z", { broken: true }),
    });
    expect(noScore.pane).toBe("final");
    expect(noScore.finalScore).toBeNull();
  });
});

describe("표기", () => {
  it("정수는 소수점 없이, 가중치는 축 안에서 자릿수를 맞춘다", () => {
    expect([80.8, 100, 75].map(fmtScore)).toEqual(["80.8", "100", "75"]);
    expect(fmtWeights([0.5, 0.3, 0.2])).toEqual(["0.5", "0.3", "0.2"]);
    expect(fmtWeights([0.45, 0.3, 0.25])).toEqual(["0.45", "0.30", "0.25"]);
  });

  it("endOfSeoulDay — 그날 23:59 서울", () => {
    expect(endOfSeoulDay(at("2026-10-26T05:20:00Z")).toISOString()).toBe("2026-10-26T14:59:00.000Z");
    /* 서울로는 이미 다음 날인 UTC 저녁 */
    expect(endOfSeoulDay(at("2026-10-26T16:00:00Z")).toISOString()).toBe("2026-10-27T14:59:00.000Z");
  });
});
