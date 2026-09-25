/*
  심사 결과 — 시안 ver4 `#scr-judgments` 네 판(`.sb[data-pane]`)의 계산.

    ① jd-none   1차·2차 모두 심사 전
    ② jd-pass   1차 PASS, 2차 예정
    ③ jd-fail   1차 FAIL, 2차 해당 없음 — 사유 요지·이의신청 기한
    ④ jd-final  1차 PASS, 2차 확정 — 산식과 점수 전부

  화면(app/dashboard/judgments)은 여기서 만든 값을 그릴 뿐이고, DB를 읽는 것은
  `dashboard-read.ts`의 `loadJudgmentsView`다. 여기는 순수 함수라 테스트가 돈다.

  ⚠️ 판은 **게이트 둘의 최신 판정**이 정한다. 2차 판정이 있으면 ④, 없고 1차가
  fail이면 ③, 1차가 있으면 ②, 없으면 ①. `revision`(보완 요청)은 시안에 없다 —
  ②의 자리에 경고색 배지로 그린다(내가 정함, 2026-09-23, 수연 확인 대기).

  ⚠️ 1차는 배점과 통과선을 공개하지 않는다(규칙 제9조). `score_breakdown`은
  2차(s5)의 것만 읽고, 1차 것은 이 파일에 들어오지도 않는다.

  ⚠️ 2차 점수표는 **항목 점수와 원값만 저장**하고 축 점수·총점은 여기서 산식대로
  다시 센다 — 「산식 전면 공개」란 화면이 그 산식으로 같은 숫자를 내 보이는 것이다
  (시안 ④의 「자기 점수 계산기로 같은 숫자를 재현할 수 있어요」). 가중치·하한은
  심사 기준서 v0.3.1의 값(`FINAL_FORMULA`)이고, 순위는 셀 수 없어 저장값이다.
*/
import { addBusinessDays, APPEAL_BUSINESS_DAYS, endOfSeoulDay } from "@/lib/appeal";

export type JudgmentsPane = "none" | "pass" | "fail" | "final";

/** DB의 `judgments` 한 행 중 화면이 쓰는 것 */
export type GateJudgment = {
  /** `JudgmentResult` — pass · revision · fail */
  result: string;
  feedback: string | null;
  judgedAt: Date;
  scoreBreakdown: unknown;
};

/* ── 2차 산식(심사 기준서 v0.3.1) ─────────────────────────────────────── */

export type AxisKey = "T" | "R";
export type ItemKey = "T1" | "T2" | "T3" | "R1" | "R2" | "R3";

export const FINAL_FORMULA = {
  axes: [
    {
      key: "T" as const,
      weight: 0.6,
      /** 축 하한 — 못 미치면 순위에서 빠진다 */
      floor: 20,
      items: [
        { key: "T1" as const, weight: 0.5 },
        /*
          T2 후반 성장 추세는 레이스 기간을 이등분해 앞뒤를 견준다(심사 기준서). 레이스
          기간은 **팀마다 다르다** — [그 팀이 s3을 처음 낸 때, s5 마감](race.ts
          `teamRaceWindow`, 2026-09-26 수연 지시). 계산 코드는 아직 없다 — 생기면 그
          구간을 반으로 나눈다. 여기는 운영이 적은 값을 읽기만 한다.
        */
        { key: "T2" as const, weight: 0.3 },
        { key: "T3" as const, weight: 0.2 },
      ],
    },
    {
      key: "R" as const,
      weight: 0.4,
      floor: 10,
      items: [
        { key: "R1" as const, weight: 0.45 },
        { key: "R2" as const, weight: 0.3 },
        { key: "R3" as const, weight: 0.25 },
      ],
    },
  ],
} as const;

/** `judgments.score_breakdown`(2차)의 꼴. 심사 콘솔이 쓰고 여기서 읽는다 */
export type FinalScoreJson = {
  items: Record<ItemKey, { raw: string; score: number }>;
  compliance: { raw: string; factor: number };
  rank: { position: number; teams: number; floorsMet: boolean };
};

export type FinalScore = {
  axes: {
    key: AxisKey;
    weight: number;
    score: number;
    items: { key: ItemKey; weight: number; raw: string; score: number }[];
  }[];
  compliance: { raw: string; factor: number };
  total: number;
  rank: { position: number; teams: number; floorsMet: boolean };
};

const round1 = (n: number) => Math.round(n * 10) / 10;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";

/** 꼴이 어긋나면 null — 없는 숫자를 지어내지 않는다 */
export function parseFinalScore(json: unknown): FinalScore | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Partial<FinalScoreJson>;
  const items = j.items;
  const c = j.compliance;
  const r = j.rank;
  if (!items || typeof items !== "object" || !c || !r) return null;
  if (!isStr(c.raw) || !isNum(c.factor)) return null;
  if (!isNum(r.position) || !isNum(r.teams) || typeof r.floorsMet !== "boolean") return null;

  const axes: FinalScore["axes"] = [];
  for (const ax of FINAL_FORMULA.axes) {
    const rows: FinalScore["axes"][number]["items"] = [];
    for (const it of ax.items) {
      const row = (items as Record<string, unknown>)[it.key] as
        | { raw?: unknown; score?: unknown }
        | undefined;
      if (!row || !isStr(row.raw) || !isNum(row.score)) return null;
      rows.push({ key: it.key, weight: it.weight, raw: row.raw, score: row.score });
    }
    const score = round1(rows.reduce((s, it) => s + it.weight * it.score, 0));
    axes.push({ key: ax.key, weight: ax.weight, score, items: rows });
  }
  const total = round1(
    axes.reduce((s, ax) => s + ax.weight * ax.score, 0) * c.factor,
  );
  return {
    axes,
    compliance: { raw: c.raw, factor: c.factor },
    total,
    rank: { position: r.position, teams: r.teams, floorsMet: r.floorsMet },
  };
}

/* ── 판 ───────────────────────────────────────────────────────────────── */

export type JudgmentsView = {
  pane: JudgmentsPane;
  gate1: GateJudgment | null;
  gate2: GateJudgment | null;
  /** ③ 사유 요지 — 코멘트 첫 문단 + 1차 게이트 숫자(허브 h12와 같은 규칙) */
  reason: string | null;
  /** ③ 코멘트 본문 — 첫 문단 뒤 */
  reasonBody: string | null;
  /** ③ 이의신청 마감 — 판정 통지 + 5영업일, 그날 23:59(서울) */
  appealBy: Date | null;
  /** ④ 점수표. 저장된 꼴이 어긋나면 null */
  finalScore: FinalScore | null;
};

/**
 * 코멘트의 첫 문단과 나머지. 미통과 코멘트는 「요지\n\n본문」으로 적는다 —
 * 허브 h12의 사유 요지 줄과 이 화면의 `.hb-sum`이 같은 첫 문단을 읽는다.
 */
export function splitFeedback(feedback: string | null): {
  summary: string | null;
  body: string | null;
} {
  const text = feedback?.trim() ?? "";
  if (!text) return { summary: null, body: null };
  const at = text.search(/\n\s*\n/);
  if (at < 0) return { summary: text, body: null };
  return {
    summary: text.slice(0, at).trim(),
    body: text.slice(at).trim() || null,
  };
}

export function paneOf(args: {
  gate1: { result: string } | null;
  gate2: { result: string } | null;
}): JudgmentsPane {
  if (args.gate2) return "final";
  if (!args.gate1) return "none";
  return args.gate1.result === "fail" ? "fail" : "pass";
}

export function buildJudgmentsView(args: {
  gate1: GateJudgment | null;
  gate2: GateJudgment | null;
  /** 1차 게이트가 본 숫자 — 「 (신청 3명, 전환율 0.8%)」. 요지 뒤에 붙는다 */
  gateOneNumbers?: string;
}): JudgmentsView {
  const { gate1, gate2 } = args;
  const pane = paneOf({ gate1, gate2 });
  const failed = pane === "fail" && gate1 ? gate1 : null;
  const { summary, body } = splitFeedback(failed?.feedback ?? null);
  return {
    pane,
    gate1,
    gate2,
    reason: summary ? `${summary}${args.gateOneNumbers ?? ""}` : null,
    reasonBody: body,
    appealBy: failed
      ? endOfSeoulDay(addBusinessDays(failed.judgedAt, APPEAL_BUSINESS_DAYS))
      : null,
    finalScore: pane === "final" && gate2 ? parseFinalScore(gate2.scoreBreakdown) : null,
  };
}

/* ── 표기 ─────────────────────────────────────────────────────────────── */

/** 「80.8」·「100」 — 정수면 소수점을 안 쓴다(시안 ④) */
export const fmtScore = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** 총점은 늘 소수 한 자리(「68.0」), 계수는 두 자리(「1.00」) */
export const fmtTotal = (n: number) => n.toFixed(1);
export const fmtFactor = (n: number) => n.toFixed(2);

const decimalsOf = (n: number) => (String(n).split(".")[1] ?? "").length;

/**
 * 항목 가중치는 **같은 축 안에서 자릿수를 맞춘다** — 시안 ④가 T는 ×0.5·×0.3·
 * ×0.2, R은 ×0.45·×0.30·×0.25다. 열이 나란해야 눈으로 더할 수 있다.
 */
export function fmtWeights(weights: readonly number[]): string[] {
  const d = Math.max(...weights.map(decimalsOf));
  return weights.map((w) => w.toFixed(d));
}

/** 「0.6×80.4 + 0.4×49.3」 */
export function formulaText(score: FinalScore): string {
  return score.axes.map((ax) => `${ax.weight}×${fmtScore(ax.score)}`).join(" + ");
}
