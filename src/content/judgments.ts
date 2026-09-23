/*
  심사 결과 화면의 문안 — 시안 ver4 `#scr-judgments`가 정본이다.
  화면(app/dashboard/judgments)이 이 값을 그대로 그린다.

  ⚠️ 「5영업일」·「48시간」은 규칙의 값이다. 영업일은 `appeal.ts`의 상수를
  화면이 끼운다(조항이 바뀌면 그쪽만 고친다).
*/

export const JUDGMENTS_HEAD = {
  title: "심사 결과",
  sub: "게이트는 두 번이에요. 1차는 판정과 운영진 코멘트를, 2차는 산식과 점수 전부를 여기서 볼 수 있어요.",
} as const;

/** 카드 둘 — 시안 `.jd-hd`의 제목과 게이트 칩 */
export const GATE = {
  first: { title: "1차 심사(사업성)", chip: "GATE 1, s2" },
  second: { title: "2차 심사(최종)", chip: "GATE 2, s5" },
} as const;

/** 카드 머리의 배지 */
export const GATE_BADGE = {
  before: "심사 전",
  pass: "PASS",
  fail: "FAIL",
  /** 시안에 없다 — `revision` 판정(내가 정함, 2026-09-23, 수연 확인 대기) */
  revision: "보완 요청",
  scheduled: "예정",
  notApplicable: "해당 없음",
  final: "확정",
} as const;

/** 「판정 10.12 14:20」·「확정 11.03 10:00」의 앞말 */
export const GATE_STAMP = {
  judged: "판정",
  final: "확정",
} as const;

/** ① 심사 전 — 카드 본문 */
export const GATE_BEFORE = {
  first:
    "s2 마감 후 48시간 안에 판정이 도착해요. 판정은 pass와 fail 두 가지고, 운영진이 직접 읽고 판정해요.",
  second:
    "레이스 종료 후 플랫폼 집계 지표로 산정돼요. 산식과 배점은 규칙에 전부 공개돼 있어요.",
} as const;

/** 🔒 줄 — 시안 `.pub-note`. 아이콘은 `Icon lock` */
export const PUB_NOTE = {
  pass: "1차 심사는 배점 숫자와 통과선을 공개하지 않아요. 평가 항목과 기준은 규칙 제3조에 있어요.",
  fail: "1차 심사는 배점 숫자와 통과선을 공개하지 않아요. 미통과는 제재가 아니고, 대시보드와 이 결과는 계속 볼 수 있어요.",
} as const;

/** ③ — 시안 `.hb-sum`의 한 줄 */
export const REASON_SUMMARY = "사유 요지";

/** ③ 이의신청 */
export const APPEAL = {
  button: "판정에 이의신청하기",
  /** 「통지 후 5영업일 내, 10.19 23:59까지. 접수 후 5영업일 내 회신」 */
  note: (args: { appealDays: number; by: string; responseDays: number }) =>
    `통지 후 ${args.appealDays}영업일 내, ${args.by}까지. 접수 후 ${args.responseDays}영업일 내 회신`,
} as const;

/** ④ — 점수표 아래 한 줄 */
export const FINAL_NOTE =
  "환산표와 앵커는 규칙 별표 1과 동일하고, 자기 점수 계산기 스프레드시트로 같은 숫자를 재현할 수 있어요. 이의신청은 확정 공개 후 5영업일 내예요.";

/** ④ 점수표의 이름 — 심사 기준서 v0.3.1 */
export const SCORE_LABEL = {
  T: "유입 T",
  T1: "T1 유효 방문자 규모",
  T2: "T2 후반 성장 추세",
  T3: "T3 유입 채널 다양성",
  R: "전환 R",
  R1: "R1 유효 매출 규모",
  R2: "R2 유료 전환율(보정)",
  R3: "R3 수익화 단계",
  compliance: "규칙 준수 계수 C",
  rank: "종합 순위",
} as const;

export const SCORE_TEXT = {
  /** 「유입 T, 가중 0.6」 */
  axis: (label: string, weight: number) => `${label}, 가중 ${weight}`,
  /** 「총점 S = (0.6×80.4 + 0.4×49.3) × 1.00」 */
  total: (formula: string, factor: string) => `총점 S = (${formula}) × ${factor}`,
  /** 「68.0 / 100」 */
  outOf: (total: string) => `${total} / 100`,
  /** 「축 하한 T≥20, R≥10 충족」 */
  floors: (met: boolean, floors: { key: string; floor: number }[]) =>
    `축 하한 ${floors.map((f) => `${f.key}≥${f.floor}`).join(", ")} ${met ? "충족" : "미충족"}`,
  /** 「2위 / 11팀」 */
  rank: (position: number, teams: number) => `${position}위 / ${teams}팀`,
} as const;
