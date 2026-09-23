/*
  소명 — 시안 `#scr-appeal` 두 판과 `/dashboard/appeal`을 대조한다.

    STATE=sent node scripts/design-diff/appeal.mjs   # 한 판만
    node scripts/design-diff/appeal.mjs              # write · sent 전부

  ⚠️ **판이 데이터로 갈린다.** 시안은 `.sb[data-pane]`로 `.pane.on`을 바꾸지만
  우리는 접수 기록이 정한다 — `appeal-state.mts`가 그 판을 만들고 세션 토큰을
  준다. 구현본이 실제로 그 판을 그리는지(`data-state`) 먼저 확인한다.

  ⚠️ 통지일·접수·회신 시각은 「오늘」 기준 데이터라 글자 대조에서 뺀다(IGNORE).
  ①의 사유 칸 글과 파일 칩은 목업이라 재지 않는다 — 우리 칸은 비어 있고 칩은
  올려야 생긴다(`.fld` 셋째의 자식 수도 그래서 안 센다).

  헤더(`.db-top`)와 사이드바(`.db-side`)는 크롬이라 `header-states.mjs`가 본다.
  네 축 — 값·상태(hover)·글자·구조.
*/
import { execFileSync } from "node:child_process";

import {
  withPage, diffTable, diffText, textNodes,
  SPEC_URL, IMPL_URL, WIDTHS, shotDir, REPO,
} from "./cdp.mjs";

const OUT = shotDir("appeal");

const CSS = [
  "font-size", "font-weight", "line-height", "letter-spacing",
  "color", "background-color", "background-image",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-bottom", "margin-left", "margin-right",
  "border-radius", "box-shadow", "gap", "display", "flex-wrap",
  "align-items", "justify-content", "text-align",
  "width", "height", "font-family",
  "flex-grow", "flex-shrink", "flex-basis",
  "border-top-width", "border-top-style", "border-top-color",
  "border-bottom-width", "border-bottom-style", "border-bottom-color",
  "border-left-width", "border-left-style", "border-left-color",
  "border-right-width", "border-right-style", "border-right-color",
  "opacity", "overflow-x", "position", "white-space", "min-height",
];

const S = "#scr-appeal ";
/* 판 안은 켜진 `.pane` 아래. 머리(h1·wbar)는 판 밖 */
const P = "#scr-appeal .pane.on ";
const ROOT = '[data-probe="appeal"] ';

const H = (n) => `{{hub:${n}}}`;
const J = (n) => `{{jd:${n}}}`;

const COMMON = [
  ["h1", S + ".hb-h1", H("h1"), [], ["width"]],
  /* 경고줄 — 시안은 글자 하나, 우리는 span 하나(절 상자)라 자식 수는 안 센다. 높이는 절 단위 줄바꿈으로 는다 */
  ["wbar", S + ".wbar", H("wbar"), [], [], ["height"]],
];

/* k번째 입력 묶음(`.fld`) — 판의 k번째 div */
const sFld = (k) => `${P}> div:nth-of-type(${k})`;
const iFld = (k) => `${ROOT}form > div:nth-of-type(${k})`;
const fld = (k, extra = []) => [
  [`fld ${k}`, sFld(k), iFld(k), [], extra],
  [`fld ${k} label`, `${sFld(k)} > label`, `${iFld(k)} > label`, [], ["width"]],
];

/* k번째 `.hb-sum` 줄 */
const sumRow = (name, sbox, ibox, k) => [
  [`${name} row ${k}`, `${sbox} > div:nth-of-type(${k})`, `${ibox} > div:nth-of-type(${k})`],
  [`${name} row ${k} span`, `${sbox} > div:nth-of-type(${k}) > span`, `${ibox} > div:nth-of-type(${k}) > span`, [], ["width"]],
  [`${name} row ${k} b`, `${sbox} > div:nth-of-type(${k}) > b`, `${ibox} > div:nth-of-type(${k}) > b`, [], ["width"]],
];

const LIST = {
  write: [
    ...COMMON,
    ...fld(1),
    ["select", `${sFld(1)} select`, `${iFld(1)} select`],
    /* 사유 칸 — 시안은 목업 글이 들어 있다. 높이는 min-height가 같으면 된다 */
    ...fld(2, ["height"]),
    ["textarea", `${sFld(2)} textarea`, `${iFld(2)} textarea`, [], ["height"]],
    /* 파일 칩은 목업 — 셋째 묶음의 높이·자식 수는 안 본다 */
    ...fld(3, ["height"]),
    ["drop", `${sFld(3)} .drop`, `${iFld(3)} div[role="button"]`],
    ["drop b", `${sFld(3)} .drop b`, `${iFld(3)} div[role="button"] b`, [], ["width"]],
    ["sum", `${P}.hb-sum`, `${ROOT}form > ${H("sum")}`],
    ...sumRow("sum", `${P}.hb-sum`, `${ROOT}form > ${H("sum")}`, 1),
    ...sumRow("sum", `${P}.hb-sum`, `${ROOT}form > ${H("sum")}`, 2),
    ["btn", `${P}.btn-primary`, `${ROOT}form > button[type="submit"]`, [], ["width"]],
  ],
  sent: [
    ...COMMON,
    ["sum", `${P}.hb-sum`, `${ROOT}> ${H("sum")}`],
    ...sumRow("sum", `${P}.hb-sum`, `${ROOT}> ${H("sum")}`, 1),
    ...sumRow("sum", `${P}.hb-sum`, `${ROOT}> ${H("sum")}`, 2),
    ...sumRow("sum", `${P}.hb-sum`, `${ROOT}> ${H("sum")}`, 3),
    ["badge", `${P}.hb-sum .badge`, `${ROOT}${H("sum")} [class*="Badge-module"]`, [], ["width"]],
    /* 회신 카드 — 코멘트는 절 단위 줄바꿈이라 높이가 는다 */
    ["card", `${P}.card.jd`, `${ROOT}> ${J("jd")}`, [], ["height"]],
    ["card hd", `${P}.jd-hd`, `${ROOT}${J("jdHd")}`],
    ["card h3", `${P}.jd-hd h3`, `${ROOT}${J("jdHd")} h3`, [], ["width"]],
    /* `margin-left: auto`의 계산값은 LayoutUnit(1/64px)이 어긋난다 — 플레이북 */
    ["card tm", `${P}.jd-hd .tm`, `${ROOT}${J("tm")}`, [], ["width", "margin-left"]],
    ["q", `${P}.q`, `${ROOT}${J("q")}`, [], ["height"]],
    ["q b", `${P}.q b`, `${ROOT}${J("q")} b`, [], ["width"]],
  ],
};

const HOVER_CSS = ["color", "background-color", "background-image", "box-shadow",
  "border-top-color", "filter"];
const HOVER = {
  write: [["btn hover", `${P}.btn-primary`, `${ROOT}form > button[type="submit"]`]],
  sent: [],
};

const TEXT = {
  write: [
    ["머리", S + ".hb-h1", H("h1")], ["경고줄", S + ".wbar", H("wbar")],
    ["대상 라벨", `${sFld(1)} > label`, `${iFld(1)} > label`],
    ["대상 고르개", `${sFld(1)} select`, `${iFld(1)} select`],
    ["사유 라벨", `${sFld(2)} > label`, `${iFld(2)} > label`],
    ["증빙 라벨", `${sFld(3)} > label`, `${iFld(3)} > label`],
    ["파일 칸", `${sFld(3)} .drop`, `${iFld(3)} div[role="button"]`],
    ["기한 상자", `${P}.hb-sum`, `${ROOT}form > ${H("sum")}`],
    ["버튼", `${P}.btn-primary`, `${ROOT}form > button[type="submit"]`],
  ],
  sent: [
    ["머리", S + ".hb-h1", H("h1")], ["경고줄", S + ".wbar", H("wbar")],
    ["접수 상자", `${P}.hb-sum`, `${ROOT}> ${H("sum")}`],
    ["회신 카드", `${P}.card.jd`, `${ROOT}> ${J("jd")}`],
  ],
};

/* 데이터 — 통지일·접수·회신 시각과 기한 */
const IGNORE = [
  /^\d{2}\.\d{2} \d{2}:\d{2}/,
  /\(\d{2}\.\d{2} 통지\)$/,
];

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
    if (/^(fld [12]|sum( row \\d)?|card( hd)?)$/.test(name)) {
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

/* 회신 카드는 심사 결과 모듈의 클래스를 빌려 쓴다 — 그 해시도 집는다 */
const hashOf = `(() => {
  const pick = (mod) => {
    const e = document.querySelector('[class*="' + mod + '-module__"]');
    return e ? (e.className.match(new RegExp(mod + '-module__([A-Za-z0-9_-]+?)__')) || [])[1] : null;
  };
  return { hub: pick("hub"), jd: pick("judgments") };
})()`;

const fixer = ({ hub, jd }) => (sel) =>
  sel
    .replace(/\{\{hub:(\w+)\}\}/g, (_, n) => `.hub-module__${hub}__${n}`)
    .replace(/\{\{jd:(\w+)\}\}/g, (_, n) => `.judgments-module__${jd}__${n}`);

/* 다섯째 칸(narrow)은 390px에서만 더 빼는 속성 */
const run = (list, side, w, fix = (v) => v) =>
  probe().replace("LIST", JSON.stringify(list.map(([n, s, i, x, k, narrow]) => {
    const skip = [...(k || []), ...(w <= 390 ? narrow || [] : [])];
    return side === "spec" ? [n, s, x, skip] : [n, fix(i), x, skip];
  })));

/** 시안의 판 고르개. `stripViewerShell()`이 상태 바를 가리기 전에 누른다 */
const pickState = (st) => `(() => {
  document.querySelector('#scr-appeal .sb[data-pane="ap-${st}"]').click();
  return document.querySelector('#scr-appeal .pane.on')?.dataset.id ?? "없음";
})()`;

const stateOf = `(document.querySelector('[data-probe="appeal"]')?.dataset.state ?? "없음")`;

const hideScrollbars = (p) =>
  p.send("Emulation.setScrollbarsHidden", { hidden: true });
const reduceMotion = (p) =>
  p.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });

const state = (...args) =>
  execFileSync("node", [
    "--env-file=.env.development.local", "--import", "tsx",
    "scripts/design-diff/appeal-state.mts", ...args,
  ], { cwd: REPO, encoding: "utf8" });

const STATES = process.env.STATE ? [process.env.STATE] : ["write", "sent"];
for (const st of STATES) {
  if (!LIST[st]) throw new Error(`STATE는 write·sent 중 하나: ${st}`);
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
        await p.goto(SPEC_URL + "#appeal");
        const picked = await p.eval(pickState(st));
        if (picked !== `ap-${st}`) throw new Error(`시안 판 전환 실패: ${picked}`);
        await p.stripViewerShell();
        await p.eval(`(() => {
          document.getElementById("scr-appeal").getAnimations({ subtree: true })
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
        await p.goto(IMPL_URL + "/dashboard/appeal");
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
      total += diffTable(`${st} ${w}px — 소명`, spec.out, impl.out);
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
