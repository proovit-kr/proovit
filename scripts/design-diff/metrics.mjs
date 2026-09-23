/*
  내 지표 — 시안 `#scr-mymetrics` 두 판과 `/dashboard/metrics`를 대조한다.

    STATE=empty node scripts/design-diff/metrics.mjs   # 한 판만
    node scripts/design-diff/metrics.mjs               # data · empty 전부

  ⚠️ **판이 데이터로 갈린다.** 시안은 `.sb[data-pane]`로 `.pane.on`을 바꾸지만
  우리는 어제까지 14일의 집계 행이 정한다 — `metrics-state.mts`가 그 판을 만들고
  세션 토큰을 준다. 구현본이 실제로 그 판을 그리는지(`data-state`) 먼저 확인한다.

  ⚠️ 숫자·날짜·비율은 데이터라 글자 대조에서 뺀다(IGNORE). 채널 이름은 목업을
  시안 그대로 심었으니 본다. 채널 막대의 `width`(인라인 %)도 데이터라 뺀다.

  ⚠️ 시안과 일부러 다른 자리(연동 전 빈 판)는 재지 않는다 — page.tsx 머리 주석.

  헤더(`.db-top`)와 사이드바(`.db-side`)는 크롬이라 `header-states.mjs`가 본다.
  네 축 — 값·상태(hover)·글자·구조.
*/
import { execFileSync } from "node:child_process";

import {
  withPage, diffTable, diffText, textNodes,
  SPEC_URL, IMPL_URL, WIDTHS, shotDir, REPO,
} from "./cdp.mjs";

const OUT = shotDir("metrics");

const CSS = [
  "font-size", "font-weight", "line-height", "letter-spacing",
  "color", "background-color", "background-image",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-bottom", "margin-left",
  "border-radius", "box-shadow", "gap", "display", "flex-wrap",
  "align-items", "justify-content", "text-align",
  "width", "height", "font-family",
  "flex-grow", "flex-shrink", "flex-basis",
  "border-top-width", "border-top-style", "border-top-color",
  "border-bottom-width", "border-bottom-style", "border-bottom-color",
  "opacity", "overflow-x", "position",
];

const S = "#scr-mymetrics ";
/* 판 안은 켜진 `.pane` 아래. 머리(h1·sub)는 판 밖 */
const P = "#scr-mymetrics .pane.on ";
const ROOT = '[data-probe="metrics"] ';

const I = (n) => `{{${n}}}`;
const H = (n) => `{{hub:${n}}}`;
const CARD = `${I("ch")} + [class*="Surface-module"]`;

const COMMON = [
  ["h1", S + ".hb-h1", H("h1"), [], ["width"]],
  ["sub", S + ".hb-sub", H("sub"), [], ["width"]],
];

const kpi = (k) => [
  [`card ${k}`, P + `.hb-cards .card:nth-child(${k})`, `${H("cards")} > :nth-child(${k})`],
  [`card ${k} small`, P + `.hb-cards .card:nth-child(${k}) small`, `${H("cards")} > :nth-child(${k}) small`],
  [`card ${k} score`, P + `.hb-cards .card:nth-child(${k}) .score`, `${H("cards")} > :nth-child(${k}) .score`, [], ["width"]],
];
const bar = (k) => [
  [`bar ${k}`, P + `.ch + .card > div:nth-of-type(${k})`, `${CARD} > div:nth-of-type(${k})`],
  [`bar ${k} nm`, P + `.ch + .card > div:nth-of-type(${k}) .nm`, `${CARD} > div:nth-of-type(${k}) ${I("nm")}`],
  [`bar ${k} tr`, P + `.ch + .card > div:nth-of-type(${k}) .tr`, `${CARD} > div:nth-of-type(${k}) ${I("tr")}`],
  /* 막대 길이는 인라인 %(데이터) */
  [`bar ${k} tr i`, P + `.ch + .card > div:nth-of-type(${k}) .tr i`, `${CARD} > div:nth-of-type(${k}) ${I("tr")} i`, [], ["width"]],
  [`bar ${k} pc`, P + `.ch + .card > div:nth-of-type(${k}) .pc`, `${CARD} > div:nth-of-type(${k}) ${I("pc")}`],
];

const LIST = {
  data: [
    ...COMMON,
    ["cards", P + ".hb-cards", H("cards")],
    ...kpi(1), ...kpi(2), ...kpi(3),
    ["ch", P + ".ch", I("ch")],
    ["ch hd", P + ".ch-hd", I("chHd")],
    ["ch hd b", P + ".ch-hd b", `${I("chHd")} b`, [], ["width"]],
    ["lg 1", P + ".ch-hd .lg:nth-of-type(1)", `${I("chHd")} ${I("lg")}:nth-of-type(1)`, [], ["width"]],
    ["lg 1 i", P + ".ch-hd .lg:nth-of-type(1) i", `${I("chHd")} ${I("lg")}:nth-of-type(1) i`],
    ["lg 2", P + ".ch-hd .lg:nth-of-type(2)", `${I("chHd")} ${I("lg")}:nth-of-type(2)`, [], ["width"]],
    ["lg 2 i", P + ".ch-hd .lg:nth-of-type(2) i", `${I("chHd")} ${I("lg")}:nth-of-type(2) i`],
    ["svg", P + ".ch svg", `${I("ch")} svg`],
    ["svg text", P + ".ch svg text", `${I("ch")} svg text`, ["fill"], ["width", "height"]],
    ["svg grid", P + ".ch svg .grid", `${I("ch")} svg ${I("grid")}`, ["stroke", "stroke-width"], ["width", "height"]],
    ["svg line", P + ".ch svg polyline", `${I("ch")} svg polyline`, ["stroke", "stroke-width", "fill"], ["width", "height"]],
    ["chan", P + ".ch + .card", CARD],
    ["chan b", P + ".ch + .card > b", `${CARD} > b`, [], ["width"]],
    ...bar(1), ...bar(2), ...bar(3),
  ],
  empty: [
    ...COMMON,
    ["badge", P + "> .badge", `${ROOT}[class*="Badge-module"]`],
    /*
      390에서 높이를 뺀다 — 본문을 절 단위로 끊어(`Clauses`) 시안의 두 줄이 세
      줄이 된다. 혜택과 크레딧 카드 본문·s1 힌트와 같은 결정(내가 정함).
    */
    ["empty", P + ".lb-empty", I("empty"), [], [], ["height"]],
    ["big", P + ".lb-empty .big", I("big")],
    ["p", P + ".lb-empty p", `${I("empty")} p`, [], [], ["height"]],
    ["btn", P + ".lb-empty .btn", `${I("empty")} button`],
  ],
};

const HOVER_CSS = ["color", "background-color", "background-image", "box-shadow",
  "border-top-color", "filter"];
const HOVER = {
  data: [],
  empty: [["btn hover", P + ".lb-empty .btn", `${I("empty")} button`]],
};

const TEXT = {
  data: [
    ["머리", S + ".hb-h1", H("h1")], ["부제", S + ".hb-sub", H("sub")],
    ["카드", P + ".hb-cards", H("cards")],
    ["차트 머리", P + ".ch-hd", I("chHd")],
    ["차트 눈금", P + ".ch svg", `${I("ch")} svg`],
    ["채널", P + ".ch + .card", CARD],
  ],
  empty: [
    ["머리", S + ".hb-h1", H("h1")], ["부제", S + ".hb-sub", H("sub")],
    ["배지", P + "> .badge", `${ROOT}[class*="Badge-module"]`],
    ["빈 판", P + ".lb-empty", I("empty")],
  ],
};

/* 데이터 — 숫자·비율·날짜 */
const IGNORE = [/^[\d,]+$/, /^[\d.]+%$/, /^\d{2}\.\d{2}$/];

const probe = () => `(() => {
  const CSS = ${JSON.stringify(CSS)};
  const out = {}, missing = [];
  for (const [name, sel, extra, skip] of LIST) {
    const el = document.querySelector(sel);
    if (!el) { missing.push(name + "  ← " + sel); continue; }
    const cs = getComputedStyle(el);
    for (const p of CSS.concat(extra || [])) {
      if ((skip || []).includes(p)) continue;
      if (p.startsWith("border-") && !p.endsWith("width")) {
        const side = p.split("-")[1];
        if (cs.getPropertyValue("border-" + side + "-width") === "0px") continue;
      }
      let v = cs.getPropertyValue(p);
      if (p.startsWith("background")) v = v.replace(/ 0%/g, " 0px");
      out[name + " " + p] = v;
    }
    out[name + " ▸가로 넘침"] = String(el.scrollWidth > el.clientWidth + 1);
    if (/^(cards|card \\d|ch|ch hd|svg|chan|bar \\d|empty)$/.test(name)) {
      out[name + " ▸자식 수"] = String(
        [...el.children].filter((c) => getComputedStyle(c).display !== "none").length,
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
  return { hub: pick("hub"), m: pick("metrics") };
})()`;

const fixer = ({ hub, m }) => (sel) =>
  sel
    .replace(/\{\{hub:(\w+)\}\}/g, (_, n) => `.hub-module__${hub}__${n}`)
    .replace(/\{\{(\w+)\}\}/g, (_, n) => `.metrics-module__${m}__${n}`);

/* 다섯째 칸(narrow)은 390px에서만 더 빼는 속성 */
const run = (list, side, w, fix = (v) => v) =>
  probe().replace("LIST", JSON.stringify(list.map(([n, s, i, x, k, narrow]) => {
    const skip = [...(k || []), ...(w <= 390 ? narrow || [] : [])];
    return side === "spec" ? [n, s, x, skip] : [n, fix(i), x, skip];
  })));

/** 시안의 판 고르개. `stripViewerShell()`이 상태 바를 가리기 전에 누른다 */
const pickState = (st) => `(() => {
  document.querySelector('#scr-mymetrics .sb[data-pane="mt-${st}"]').click();
  return document.querySelector('#scr-mymetrics .pane.on')?.dataset.id ?? "없음";
})()`;

const stateOf = `(document.querySelector('[data-probe="metrics"]')?.dataset.state ?? "없음")`;

const hideScrollbars = (p) =>
  p.send("Emulation.setScrollbarsHidden", { hidden: true });
const reduceMotion = (p) =>
  p.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });

const state = (...args) =>
  execFileSync("node", [
    "--env-file=.env.development.local", "--import", "tsx",
    "scripts/design-diff/metrics-state.mts", ...args,
  ], { cwd: REPO, encoding: "utf8" });

const STATES = process.env.STATE ? [process.env.STATE] : ["data", "empty"];
for (const st of STATES) {
  if (!LIST[st]) throw new Error(`STATE는 data·empty 중 하나: ${st}`);
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
        await reduceMotion(p);
        await p.goto(SPEC_URL + "#mymetrics");
        const picked = await p.eval(pickState(st));
        if (picked !== `mt-${st}`) throw new Error(`시안 판 전환 실패: ${picked}`);
        await p.stripViewerShell();
        await p.eval(`(() => {
          document.getElementById("scr-mymetrics").getAnimations({ subtree: true })
            .forEach(a => { if (a.effect?.getTiming().iterations !== Infinity) a.finish(); });
          return 1;
        })()`);
        await p.resize(w, 520);
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
        await p.shot(`${OUT}/spec-${st}-${w}.png`);
        return r;
      });

      const impl = await withPage(async (p) => {
        await hideScrollbars(p);
        await reduceMotion(p);
        await p.send("Network.clearBrowserCookies");
        await p.send("Network.setCookie", {
          name: "authjs.session-token", value: token,
          domain: new URL(IMPL_URL).hostname, path: "/",
        });
        await p.goto(IMPL_URL + "/dashboard/metrics");
        const fix = fixer(await p.eval(hashOf));
        const drawn = await p.eval(stateOf);
        if (drawn !== st) {
          throw new Error(`구현본이 ${drawn}을 그린다 — ${st}여야 한다`);
        }
        await p.resize(w, 520);
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
        await p.shot(`${OUT}/impl-${st}-${w}.png`);
        return r;
      });

      console.log(`\n\n████ ${st} · 폭 ${w}`);
      for (const m of spec.missing) console.log(`  ⚠️ 시안에서 못 찾음: ${m}`);
      for (const m of impl.missing) console.log(`  ⚠️ 구현본에서 못 찾음: ${m}`);
      total += spec.missing.length + impl.missing.length;
      total += diffTable(`${st} ${w}px — 내 지표`, spec.out, impl.out);
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
