/*
  혜택과 크레딧 — 시안 `#scr-credits` 일곱 판과 `/dashboard/credits`를 대조한다.

    STATE=build node scripts/design-diff/credits.mjs   # 한 판만
    node scripts/design-diff/credits.mjs               # pend … end 전부

  ⚠️ **상태가 데이터로 갈린다.** 시안은 `.sb[data-cr]`가 `CR_LIVE`를 바꿔 다시
  그리지만 우리는 카드·발급 기록·시즌 구간이 정한다 — `credits-state.mts`가 그
  판을 만들고 세션 토큰을 준다. 구현본이 실제로 그 판을 그리는지(`data-state`)
  먼저 확인한다.

  ⚠️ 시안의 레일 라임 선(`--fill`)은 렌더 때 한 번 재고 폭이 바뀌어도 안 잰다.
  폭을 바꾼 뒤 시안의 `crRender()`를 다시 불러 맞춘다(전역 함수).

  글자는 시안 문구를 우리가 정본으로 쓰는 자리만 — 날짜·D-day·발송 시각·수상
  이름은 데이터라 뺀다. 카드 본문·폴백·스폰서·코드는 개발 바가 시안 목업 그대로
  심으므로 대조한다.

  헤더(`.db-top`)와 사이드바(`.db-side`)는 크롬이라 `header-states.mjs`가 본다.
  네 축 — 값·상태(hover)·글자·구조.
*/
import { execFileSync } from "node:child_process";

import {
  withPage, diffTable, diffText, textNodes,
  SPEC_URL, IMPL_URL, WIDTHS, shotDir, REPO,
} from "./cdp.mjs";

const OUT = shotDir("credits");

const CSS = [
  "font-size", "font-weight", "line-height", "letter-spacing",
  "color", "background-color", "background-image",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-bottom", "margin-left",
  "border-radius", "box-shadow", "gap", "display", "flex-wrap",
  "align-items", "justify-content", "text-align",
  "width", "height", "font-family",
  "flex-grow", "flex-shrink", "flex-basis",
  "grid-template-columns",
  "border-top-width", "border-top-style", "border-top-color",
  "border-bottom-width", "border-bottom-style", "border-bottom-color",
  "border-left-width", "border-left-style", "border-left-color",
  "opacity", "position", "top", "left",
];
const SVG = ["stroke", "stroke-width"];

const S = "#scr-credits ";

const I = (n) => `{{${n}}}`;
const H = (n) => `{{hub:${n}}}`;
const BADGE = '[class*="Badge-module"]';

/*
  ⚠️ 인라인 요소(배지·워드마크·`.k`·복사 버튼)의 `width`는 1/64px(LayoutUnit)
  어긋난다 — 다른 화면과 같은 사정. 폭+여백 합은 같다.
*/
const INLINE = ["width"];

const HEAD = [
  ["h1", S + ".hb-h1", H("h1"), [], INLINE],
  ["sub", S + ".hb-sub", H("sub"), [], INLINE],
  ["sum", S + ".cr-sum", I("sum")],
  ["sum 1", S + ".cr-sum .card:nth-child(1)", `${I("sum")} > div:nth-child(1)`],
  ["sum 2", S + ".cr-sum .card:nth-child(2)", `${I("sum")} > div:nth-child(2)`],
  ["sum 3", S + ".cr-sum .card:nth-child(3)", `${I("sum")} > div:nth-child(3)`],
  ["sum small", S + ".cr-sum small", `${I("sum")} small`],
  ["sum score", S + ".cr-sum .score", `${I("sum")} .score`, [], INLINE],
  ["sum score i", S + ".cr-sum .score i", `${I("sum")} .score i`, [], INLINE],
  ["sum score 2", S + ".cr-sum .card:nth-child(2) .score", `${I("sum")} > div:nth-child(2) .score`, [], INLINE],
  ["sum nx", S + ".cr-sum .nx", I("nx")],
  /*
    ⚠️ 390에서는 높이를 안 본다 — 카드 본문을 절 단위로 끊어(Clauses) 시안보다 한
    줄 길어질 수 있다(s1 페르소나 힌트와 같은 결정, 2026-09-23). 라임 선은 마지막
    열린 카드까지라 그 뒤 카드의 높이와 무관하다.
  */
  ["rail", S + ".cr-rail", I("rail"), ["--fill"], [], ["height"]],
  ["foot", S + ".cr-foot", I("foot")],
  ["foot b", S + ".cr-foot b", `${I("foot")} b`, [], INLINE],
];

/** 카드 k(0~3)의 공통 자리. `cond`는 열렸으면 ok */
function card(k, { cond, ds = true } = {}) {
  const sc = `${S}.cr[data-i="${k}"]`;
  const ic = `${I("cr")}[data-i="${k}"]`;
  const n = `카드 ${k + 1}`;
  const rows = [
    [n, sc, ic, [], [], ["height"]],
    [`${n} nd`, `${sc} .nd`, `${ic} ${I("nd")}`],
    [`${n} hd`, `${sc} .hd`, `${ic} ${I("hd")}`],
    [`${n} kd`, `${sc} .kd`, `${ic} ${I("kd")}`, [], INLINE],
    [`${n} h3`, `${sc} h3`, `${ic} h3`, [], INLINE],
    [`${n} badge`, `${sc} .hd .badge`, `${ic} ${I("hd")} ${BADGE}`, [], INLINE],
    [`${n} sp`, `${sc} .sp`, `${ic} ${I("sp")}`, [], INLINE],
    [`${n} wmk`, `${sc} .wmk`, `${ic} ${I("wmk")}`, [], INLINE],
    [`${n} wmk i`, `${sc} .wmk i`, `${ic} ${I("wmk")} i`],
    [`${n} cond`, `${sc} .cond`, `${ic} ${I("cond")}`, [], INLINE],
    [`${n} cond ic`, `${sc} .cond .ic`, `${ic} ${I("cond")} svg`, SVG],
    [`${n} meta`, `${sc} .meta`, `${ic} ${I("meta")}`],
    [`${n} meta div`, `${sc} .meta > div`, `${ic} ${I("meta")} > div`, [], INLINE],
    [`${n} meta small`, `${sc} .meta small`, `${ic} ${I("meta")} small`, [], INLINE],
    [`${n} meta k`, `${sc} .meta span.k`, `${ic} ${I("meta")} span${I("k")}`, [], INLINE],
  ];
  if (ds) rows.push([`${n} ds`, `${sc} .ds`, `${ic} ${I("ds")}`, [], [], ["height"]]);
  if (cond === "ok") {
    rows.push([`${n} cond mono`, `${sc} .cond .mono`, `${ic} ${I("cond")} .mono`, [], INLINE]);
  }
  return rows;
}

/* 노드 안의 아이콘(잠금·시계·체크·금지) — 글자 노드(C1·🏆)인 판은 없다 */
const nodeIcon = (k) => [
  `카드 ${k + 1} nd ic`, `${S}.cr[data-i="${k}"] .nd .ic`,
  `${I("cr")}[data-i="${k}"] ${I("nd")} svg`, SVG,
];
const metaB = (k, name = "meta b") => [
  `카드 ${k + 1} ${name}`, `${S}.cr[data-i="${k}"] .meta b`,
  `${I("cr")}[data-i="${k}"] ${I("meta")} b`, [], INLINE,
];
const metaLime = (k) => [
  `카드 ${k + 1} meta lime`, `${S}.cr[data-i="${k}"] .meta b.lime`,
  `${I("cr")}[data-i="${k}"] ${I("meta")} b${I("lime")}`, [], INLINE,
];

/** 행동 줄 — `btn`·`lnk`·`when` 중 있는 것. `btnSel`은 시안의 버튼 셀렉터 */
function act(k, { btn, lnk, when, whenNarrow = true } = {}) {
  const sc = `${S}.cr[data-i="${k}"] .cr-act`;
  const ic = `${I("cr")}[data-i="${k}"] ${I("act")}`;
  const n = `카드 ${k + 1} act`;
  const rows = [[n, sc, ic]];
  if (btn) rows.push([`${n} btn`, `${sc} ${btn}`, `${ic} > :is(button, a[class*="Button"])`, [], INLINE]);
  if (lnk) rows.push([`${n} lnk`, `${sc} .lnk`, `${ic} ${I("lnk")}`, [], INLINE]);
  /*
    `.when`은 `margin-left:auto`라 옆 요소의 글자 폭(수상 이름은 데이터, 버튼은
    LayoutUnit)에 따라 계산값이 갈린다 — 뺀다. 390에서는 flex-basis 100%라 폭이
    칸 폭이 되고 글자에 따라 높이가 갈린다.
  */
  if (when) rows.push([`${n} when`, `${sc} .when`, `${ic} ${I("when")}`, [], ["width", "margin-left"], whenNarrow ? ["height"] : []]);
  return rows;
}

function fb(k) {
  const sc = `${S}.cr[data-i="${k}"] .fb`;
  const ic = `${I("cr")}[data-i="${k}"] ${I("fb")}`;
  const n = `카드 ${k + 1} fb`;
  return [
    [n, sc, ic],
    [`${n} t`, `${sc} .t`, `${ic} ${I("t")}`],
    [`${n} t mono`, `${sc} .t .mono`, `${ic} ${I("t")} .mono`, [], INLINE],
    [`${n} ul`, `${sc} ul`, `${ic} ul`],
    [`${n} li`, `${sc} li`, `${ic} li`, [], INLINE],
    [`${n} li small`, `${sc} li small`, `${ic} li small`, [], INLINE],
  ];
}

function code(k, on) {
  const sc = `${S}.cr[data-i="${k}"]`;
  const ic = `${I("cr")}[data-i="${k}"]`;
  const n = `카드 ${k + 1}`;
  return [
    [`${n} code`, `${sc} .code`, `${ic} ${I("code")}`],
    [`${n} code v`, `${sc} .code .v`, `${ic} ${I("v")}`, [], INLINE],
    [`${n} code cp`, `${sc} .code .cp`, `${ic} ${I("cp")}`, [], ["width", "margin-left"]],
    [`${n} code cp btn`, `${sc} .code .cp .btn`, `${ic} ${I("cp")} button`, [], INLINE],
    [`${n} code cp lnk`, `${sc} .code .cp .lnk`, `${ic} ${I("cp")} ${I("lnk")}`, [], INLINE],
    [`${n} code sent`, `${sc} .code .sent`, `${ic} ${I("sent")}`],
    [`${n} code sent mono`, `${sc} .code .sent .mono`, `${ic} ${I("sent")} .mono`, [], INLINE],
    [`${n} okrow`, `${sc} .okrow${on ? ".on" : ""}`, `${ic} ${I("okrow")}`],
    [`${n} chk`, `${sc} .chk`, `${ic} ${I("chk")}`],
    [`${n} chk ic`, `${sc} .chk .ic`, `${ic} ${I("chk")} svg`, SVG],
  ];
}

const sched = (k) => [
  [`카드 ${k + 1} sched`, `${S}.cr[data-i="${k}"] .sched`, `${I("cr")}[data-i="${k}"] ${I("sched")}`],
  [`카드 ${k + 1} sched ic`, `${S}.cr[data-i="${k}"] .sched .ic`, `${I("cr")}[data-i="${k}"] ${I("sched")} svg`, SVG],
  [`카드 ${k + 1} sched b`, `${S}.cr[data-i="${k}"] .sched b`, `${I("cr")}[data-i="${k}"] ${I("sched")} b`, [], INLINE],
  [`카드 ${k + 1} sched dd`, `${S}.cr[data-i="${k}"] .sched .dd`, `${I("cr")}[data-i="${k}"] ${I("dd")}`, [], INLINE],
];

/* 카드 넷의 자리 — 시안 st별. lock·award(협의 중 아님)는 잠금 노드 */
const LOCK = (k) => [...card(k), nodeIcon(k), ...act(k, { btn: ".btn", lnk: true })];
const AWARD = (k) => [...card(k), nodeIcon(k), ...act(k, { when: true, whenNarrow: false })];
const PEND = (k, opened) => [
  ...card(k, { cond: opened ? "ok" : undefined }), ...fb(k),
  ...act(k, { btn: ".btn-outline", lnk: true, when: opened }),
];

const LIST = {
  pend: [
    ...HEAD, ["nx mono", S + ".cr-sum .nx .mono", `${I("nx")} .mono`, [], INLINE],
    ...PEND(0), ...PEND(1), ...PEND(2),
    ...card(3), ...act(3, { when: true, whenNarrow: false }),
  ],
  locked: [
    ...HEAD, ["nx b", S + ".cr-sum .nx b", `${I("nx")} b`, [], INLINE],
    ...LOCK(0), metaLime(0), metaB(0), ...LOCK(1), metaLime(1), ...LOCK(2), ...AWARD(3), metaB(3),
  ],
  sched: [
    ...HEAD, ["nx mono", S + ".cr-sum .nx .mono", `${I("nx")} .mono`, [], INLINE],
    ...card(0, { cond: "ok" }), nodeIcon(0), metaLime(0), ...sched(0), ...act(0, { lnk: true, when: true }),
    ...LOCK(1), metaLime(1), ...LOCK(2), ...AWARD(3), metaB(3),
  ],
  build: [
    ...HEAD, ["nx b", S + ".cr-sum .nx b", `${I("nx")} b`, [], INLINE],
    ...card(0, { cond: "ok" }), nodeIcon(0), metaLime(0), ...code(0, false),
    ...card(1, { cond: "ok" }), metaLime(1), ...act(1, { btn: ".btn-primary", lnk: true, when: true }),
    ...LOCK(2), ...AWARD(3), metaB(3),
  ],
  race: [
    ...HEAD, ["nx b", S + ".cr-sum .nx b", `${I("nx")} b`, [], INLINE],
    ...card(0, { cond: "ok" }), nodeIcon(0), metaLime(0), ...code(0, true),
    ...card(1, { cond: "ok" }), nodeIcon(1), metaLime(1), ...code(1, false),
    ...PEND(2, true), ...AWARD(3), metaB(3),
  ],
  tester: [
    ...HEAD, ["nx b", S + ".cr-sum .nx b", `${I("nx")} b`, [], INLINE],
    /* 경고줄·안내줄도 절 단위로 끊어 390에서 한 줄 길어질 수 있다(카드 본문과 같은 결정) */
    ["wbar", S + ".wbar", H("wbar"), [], [], ["height"]],
    ...card(0, { cond: "ok" }), nodeIcon(0), metaLime(0), ...code(0, false),
    ...LOCK(1), metaLime(1), ...LOCK(2), ...AWARD(3), metaB(3),
  ],
  end: [
    ...HEAD, ["nx mono", S + ".cr-sum .nx .mono", `${I("nx")} .mono`, [], INLINE],
    ["info-strip", S + ".info-strip", H("infoStrip"), [], [], ["height"]],
    ...card(0, { cond: "ok" }), nodeIcon(0), metaLime(0), ...code(0, true),
    ...card(1, { cond: "ok" }), nodeIcon(1), metaLime(1), ...code(1, false),
    ...card(2, { cond: "ok" }), nodeIcon(2), ...act(2, { when: true, whenNarrow: false }),
    ...card(3, { cond: "ok" }), metaB(3),
    ...act(3, { btn: ".btn-outline", when: true }),
    ["카드 4 act badge", `${S}.cr[data-i="3"] .cr-act .badge`, `${I("cr")}[data-i="3"] ${I("act")} ${BADGE}`, [], INLINE],
  ],
};

/* 상태 축 — hover에만 있는 규칙 */
const HOVER_CSS = ["color", "background-color", "background-image", "box-shadow",
  "border-top-color", "filter"];
const lnkHover = (k) => [`카드 ${k + 1} lnk hover`, `${S}.cr[data-i="${k}"] .cr-act .lnk`, `${I("cr")}[data-i="${k}"] ${I("act")} ${I("lnk")}`];
const HOVER = {
  pend: [lnkHover(0), ["카드 1 btn hover", `${S}.cr[data-i="0"] .cr-act .btn-outline`, `${I("cr")}[data-i="0"] ${I("act")} > a`]],
  locked: [lnkHover(0)],
  sched: [lnkHover(0)],
  build: [
    ["카드 2 btn hover", `${S}.cr[data-i="1"] .cr-act .btn-primary`, `${I("cr")}[data-i="1"] ${I("act")} > button`],
    ["카드 1 copy hover", `${S}.cr[data-i="0"] .code .cp .btn`, `${I("cr")}[data-i="0"] ${I("cp")} button`],
    ["카드 1 code lnk hover", `${S}.cr[data-i="0"] .code .cp .lnk`, `${I("cr")}[data-i="0"] ${I("cp")} ${I("lnk")}`],
  ],
  race: [lnkHover(2)],
  tester: [lnkHover(1)],
  end: [["카드 4 btn hover", `${S}.cr[data-i="3"] .cr-act .btn-outline`, `${I("cr")}[data-i="3"] ${I("act")} > a`]],
};

/* 글자 — 정본으로 쓰는 자리. 카드는 통째로 본다(본문·폴백·코드는 목업 그대로 심는다) */
const TEXT_COMMON = [
  ["머리", S + ".hb-h1", H("h1")], ["부제", S + ".hb-sub", H("sub")],
  ["요약", S + ".cr-sum", I("sum")],
  ["카드 1", `${S}.cr[data-i="0"]`, `${I("cr")}[data-i="0"]`],
  ["카드 2", `${S}.cr[data-i="1"]`, `${I("cr")}[data-i="1"]`],
  ["카드 3", `${S}.cr[data-i="2"]`, `${I("cr")}[data-i="2"]`],
  ["카드 4", `${S}.cr[data-i="3"]`, `${I("cr")}[data-i="3"]`],
  ["바닥글", S + ".cr-foot", I("foot")],
];
const TEXT = {
  pend: TEXT_COMMON, locked: TEXT_COMMON, sched: TEXT_COMMON, build: TEXT_COMMON, race: TEXT_COMMON,
  tester: [["경고줄", S + ".wbar", H("wbar")], ...TEXT_COMMON],
  end: [["안내줄", S + ".info-strip", H("infoStrip")], ...TEXT_COMMON],
};
/* 날짜·D-day·발송 시각·수상 이름은 데이터 */
const IGNORE = [
  /^\d{2}\.\d{2}$/, /^~ \d{2}\.\d{2}$/, /^D-\d+$/, /^\d{2}\.\d{2} \d{2}:\d{2}$/, /^🏆/,
];

const probe = () => `(() => {
  const CSS = ${JSON.stringify(CSS)};
  const out = {}, missing = [];
  for (const [name, sel, extra, skip0] of LIST) {
    const skip = skip0 || [];
    const el = document.querySelector(sel);
    if (!el) { missing.push(name + "  ← " + sel); continue; }
    const cs = getComputedStyle(el);
    for (const p of CSS.concat(extra || [])) {
      if (skip.includes(p)) continue;
      if (p.startsWith("border-") && !p.endsWith("width")) {
        const side = p.split("-")[1];
        if (cs.getPropertyValue("border-" + side + "-width") === "0px") continue;
      }
      let v = cs.getPropertyValue(p);
      if (p.startsWith("background")) v = v.replace(/ 0%/g, " 0px");
      out[name + " " + p] = v;
    }
    if (!skip.includes("overflow")) {
      out[name + " ▸가로 넘침"] = String(el.scrollWidth > el.clientWidth + 1);
    }
    if (/(^sum$|^rail$| hd$| meta$| act$| code$| cp$| fb$| ul$| okrow$|^카드 \\d$)/.test(name)) {
      out[name + " ▸자식 수"] = String(
        [...el.children].filter((c) => c.tagName !== "BR" && getComputedStyle(c).display !== "none").length,
      );
    }
  }
  return { out, missing };
})()`;

const hoverProbe = (name, sel) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return { [${JSON.stringify(name)} + " ▸없음"]: "true" };
  const cs = getComputedStyle(el), out = {};
  for (const p of ${JSON.stringify(HOVER_CSS)}) {
    let v = cs.getPropertyValue(p);
    if (p.startsWith("background")) v = v.replace(/ 0%/g, " 0px");
    out[${JSON.stringify(name)} + " " + p] = v;
  }
  return out;
})()`;

const hashOf = `(() => {
  const pick = (mod) => {
    const e = document.querySelector('[class*="' + mod + '-module__"]');
    return e ? (e.className.match(new RegExp(mod + '-module__([A-Za-z0-9_-]+?)__')) || [])[1] : null;
  };
  return { hub: pick("hub"), m: pick("credits") };
})()`;

const fixer = ({ hub, m }) => (sel) =>
  sel
    .replace(/\{\{hub:(\w+)\}\}/g, (_, n) => `.hub-module__${hub}__${n}`)
    .replace(/\{\{(\w+)\}\}/g, (_, n) => `.credits-module__${m}__${n}`);

/* 다섯째 칸(narrow)은 390px에서만 더 빼는 속성 */
const run = (list, side, w, fix = (v) => v) =>
  probe().replace("LIST", JSON.stringify(list.map(([n, s, i, x, k, narrow]) => {
    const skip = [...(k || []), ...(w <= 390 ? narrow || [] : [])];
    return side === "spec" ? [n, s, x, skip] : [n, fix(i), x, skip];
  })));

/* 시안 판 → 첫 카드의 st 클래스(전환이 됐는지 본다) */
const FIRST_ST = { pend: "st-pend", locked: "st-lock", sched: "st-sched", build: "st-sent", race: "st-ok", tester: "st-sent", end: "st-ok" };

/** 시안의 판 고르개. `stripViewerShell()`이 상태 바를 가리기 전에 누른다 */
const pickState = (st) => `(() => {
  document.querySelector('#scr-credits .sb[data-cr="${st}"]').click();
  return document.querySelector('#scr-credits .cr[data-i="0"]')?.classList.contains("${FIRST_ST[st]}") ? "${st}" : "없음";
})()`;

/*
  폭을 바꾼 뒤 라임 선을 다시 잰다(시안은 안 잰다). `crRender()`는 카드를 새로
  그리며 진입 애니메이션(스태거)을 다시 걸고 그 **도중에** 노드 거리를 재므로,
  애니메이션을 끝낸 뒤 시안과 같은 식으로 한 번 더 잰다 — 뷰어의 사정이지
  시안 값이 아니다.
*/
const refill = `new Promise((r) => { crRender(); requestAnimationFrame(() => {
  document.getElementById("scr-credits").getAnimations({ subtree: true })
    .forEach(a => { if (a.effect?.getTiming().iterations !== Infinity) a.finish(); });
  const S = CR_LIVE, rail = document.getElementById("crRail");
  let last = -1;
  S.st.forEach((s, i) => { if (s !== "lock" && !(s === "pend" && !S.co[i]) && !(s === "award" && !S.fin) && !(s === "exp" && !S.co[i])) last = i; });
  /* 뷰어가 좁은 폭에서 무대를 축소해 rect가 줄어든다 — 변형을 안 타는 offsetTop으로 잰다 */
  const cards = rail.querySelectorAll(".cr");
  if (last < 0) rail.style.setProperty("--fill", "0px");
  else rail.style.setProperty("--fill", Math.max(0, cards[last].offsetTop - cards[0].offsetTop + 8) + "px");
  requestAnimationFrame(() => r(1));
}); })`;
const settle = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))`;

const stateOf = `(document.querySelector('[data-probe="credits"]')?.dataset.state ?? "없음")`;

const hideScrollbars = (p) =>
  p.send("Emulation.setScrollbarsHidden", { hidden: true });

const state = (...args) =>
  execFileSync("node", [
    "--env-file=.env.development.local", "--import", "tsx",
    "scripts/design-diff/credits-state.mts", ...args,
  ], { cwd: REPO, encoding: "utf8" });

const ALL = ["pend", "locked", "sched", "build", "race", "tester", "end"];
const STATES = process.env.STATE ? [process.env.STATE] : ALL;
for (const st of STATES) {
  if (!LIST[st]) throw new Error(`STATE는 ${ALL.join("·")} 중 하나: ${st}`);
}

console.log(state("save").trim());

let total = 0;
try {
  for (const st of STATES) {
    const token = state(st).trim().split("\n").pop();
    const list = LIST[st];
    const texts = TEXT[st];
    const hovers = HOVER[st];

    for (const w of WIDTHS) {
      const spec = await withPage(async (p) => {
        await hideScrollbars(p);
        await p.send("Emulation.setEmulatedMedia", {
          features: [{ name: "prefers-reduced-motion", value: "reduce" }],
        });
        await p.goto(SPEC_URL + "#credits");
        const picked = await p.eval(pickState(st));
        if (picked !== st) throw new Error(`시안 판 전환 실패: ${picked}`);
        await p.stripViewerShell();
        await p.eval(`(() => {
          document.getElementById("scr-credits").getAnimations({ subtree: true })
            .forEach(a => { if (a.effect?.getTiming().iterations !== Infinity) a.finish(); });
          return 1;
        })()`);
        await p.resize(w, 520);
        await p.eval(refill, true);
        const r = await p.eval(run(list, "spec", w));
        r.text = {};
        for (const [n, sel] of texts) r.text[n] = await p.eval(textNodes(sel));
        r.hover = {};
        for (const [n, sel] of hovers) {
          await p.hover(sel);
          Object.assign(r.hover, await p.eval(hoverProbe(n, sel)));
        }
        await p.hover();
        await p.resize(w, 900);
        await p.eval(refill, true);
        await p.shot(`${OUT}/spec-${st}-${w}.png`);
        return r;
      });

      const impl = await withPage(async (p) => {
        await hideScrollbars(p);
        await p.send("Emulation.setEmulatedMedia", {
          features: [{ name: "prefers-reduced-motion", value: "reduce" }],
        });
        await p.send("Network.clearBrowserCookies");
        await p.send("Network.setCookie", {
          name: "authjs.session-token", value: token,
          domain: new URL(IMPL_URL).hostname, path: "/",
        });
        await p.goto(IMPL_URL + "/dashboard/credits");
        const fix = fixer(await p.eval(hashOf));
        const drawn = await p.eval(stateOf);
        if (drawn !== st) {
          throw new Error(`구현본이 ${drawn}을 그린다 — ${st}여야 한다`);
        }
        await p.resize(w, 520);
        await p.eval(settle, true);
        const r = await p.eval(run(list, "impl", w, fix));
        r.text = {};
        for (const [n, , sel] of texts) r.text[n] = await p.eval(textNodes(fix(sel)));
        r.hover = {};
        for (const [n, , sel] of hovers) {
          await p.hover(fix(sel));
          Object.assign(r.hover, await p.eval(hoverProbe(n, fix(sel))));
        }
        await p.hover();
        await p.resize(w, 900);
        await p.eval(settle, true);
        await p.shot(`${OUT}/impl-${st}-${w}.png`);
        return r;
      });

      console.log(`\n\n████ ${st} · 폭 ${w}`);
      for (const m of spec.missing) console.log(`  ⚠️ 시안에서 못 찾음: ${m}`);
      for (const m of impl.missing) console.log(`  ⚠️ 구현본에서 못 찾음: ${m}`);
      total += spec.missing.length + impl.missing.length;
      total += diffTable(`${st} ${w}px — 혜택과 크레딧`, spec.out, impl.out);
      total += diffTable(`${st} ${w}px — hover`, spec.hover, impl.hover);
      for (const [n] of texts) {
        total += diffText(spec.text[n], impl.text[n], { label: n, ignore: IGNORE });
      }
    }
  }
} finally {
  console.log(state("restore").trim());
}

console.log(`\n═══════════════════════════\n합계 불일치 ${total}건`);
console.log(`스크린샷: ${OUT}`);
