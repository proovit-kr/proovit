/*
  심사 결과 — 시안 `#scr-judgments` 네 판과 `/dashboard/judgments`를 대조한다.

    STATE=fail node scripts/design-diff/judgments.mjs   # 한 판만
    node scripts/design-diff/judgments.mjs              # none · pass · fail · final 전부

  ⚠️ **판이 데이터로 갈린다.** 시안은 `.sb[data-pane]`로 `.pane.on`을 바꾸지만
  우리는 게이트 둘의 최신 판정이 정한다 — `judgments-state.mts`가 그 판을 만들고
  세션 토큰을 준다. 구현본이 실제로 그 판을 그리는지(`data-state`) 먼저 확인한다.

  ⚠️ 판정 시각·기한·점수·순위는 데이터라 글자 대조에서 뺀다(IGNORE). 코멘트와
  원값은 목업을 시안 그대로 심었으니 본다. ③ 사유 요지의 괄호는 시안(목업 문구)과
  우리(1차 게이트 숫자를 화면이 붙임)가 일부러 다르다 — `.hb-sum b`는 재지 않는다
  (page.tsx 머리 주석).

  헤더(`.db-top`)와 사이드바(`.db-side`)는 크롬이라 `header-states.mjs`가 본다.
  네 축 — 값·상태(hover)·글자·구조.
*/
import { execFileSync } from "node:child_process";

import {
  withPage, diffTable, diffText, textNodes,
  SPEC_URL, IMPL_URL, WIDTHS, shotDir, REPO,
} from "./cdp.mjs";

const OUT = shotDir("judgments");

const CSS = [
  "font-size", "font-weight", "line-height", "letter-spacing",
  "color", "background-color", "background-image",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-bottom", "margin-left", "margin-right",
  "border-radius", "box-shadow", "gap", "display", "flex-wrap",
  "align-items", "justify-content", "text-align",
  "width", "height", "font-family",
  "flex-grow", "flex-shrink", "flex-basis",
  "grid-template-columns", "grid-column-start", "grid-column-end",
  "border-top-width", "border-top-style", "border-top-color",
  "border-bottom-width", "border-bottom-style", "border-bottom-color",
  "border-left-width", "border-left-style", "border-left-color",
  "opacity", "overflow-x", "position", "white-space",
];

const S = "#scr-judgments ";
/* 판 안은 켜진 `.pane` 아래. 머리(h1·sub)는 판 밖 */
const P = "#scr-judgments .pane.on ";
const ROOT = '[data-probe="judgments"] ';

const I = (n) => `{{${n}}}`;
const H = (n) => `{{hub:${n}}}`;

/* k번째 카드(1차·2차) */
const sCard = (k) => P + `.card.jd:nth-of-type(${k})`;
const iCard = (k) => `${ROOT}> ${I("jd")}:nth-of-type(${k})`;

const COMMON = [
  ["h1", S + ".hb-h1", H("h1"), [], ["width"]],
  ["sub", S + ".hb-sub", H("sub"), [], ["width"]],
];

/* 카드 머리 — 제목·칩·배지·(시각). 시각은 데이터라 폭을 뺀다 */
/*
  카드 높이 — ① 안내문은 390에서만 뺀다(절 단위 줄바꿈으로 줄이 는다, 혜택과
  크레딧·내 지표와 같은 결정). 코멘트(`.q`)가 든 카드는 폭마다 뺀다 — 코멘트는
  데이터이고 절 단위로 끊어 1440에서도 시안의 두 줄이 세 줄이 된다(내가 정함).
*/
const head = (k, stamp, comment) => [
  comment
    ? [`card ${k}`, sCard(k), iCard(k), [], ["height"]]
    : [`card ${k}`, sCard(k), iCard(k), [], [], ["height"]],
  [`card ${k} hd`, `${sCard(k)} .jd-hd`, `${iCard(k)} ${I("jdHd")}`],
  [`card ${k} h3`, `${sCard(k)} .jd-hd h3`, `${iCard(k)} ${I("jdHd")} h3`, [], ["width"]],
  [`card ${k} chip`, `${sCard(k)} .gate-chip`, `${iCard(k)} ${I("gateChip")}`, [], ["width"]],
  [`card ${k} badge`, `${sCard(k)} .badge`, `${iCard(k)} [class*="Badge-module"]`, [], ["width"]],
  /* `margin-left: auto`의 계산값은 LayoutUnit(1/64px)이 어긋난다 — 플레이북 */
  ...(stamp
    ? [[`card ${k} tm`, `${sCard(k)} .tm`, `${iCard(k)} ${I("tm")}`, [], ["width", "margin-left"]]]
    : []),
];
/* 코멘트 — 글자가 데이터라 높이도 뺀다(③ 본문은 목업이 같아도 390에서 절 단위가 아니다) */
const quote = (k, name = "q") => [
  [`card ${k} ${name}`, `${sCard(k)} .q`, `${iCard(k)} ${I("q")}`, [], ["height"]],
];
const pubNote = (k) => [
  /* inline-flex의 너비는 LayoutUnit(1/64px)이 어긋난다 — 글자를 span에 담아서다 */
  [`card ${k} note`, `${sCard(k)} .pub-note`, `${iCard(k)} ${I("pubNote")}`, [], ["width"], ["height"]],
  [`card ${k} note ic`, `${sCard(k)} .pub-note .ic`, `${iCard(k)} ${I("pubNote")} svg`],
];

/* k는 상자 안 div의 순번(축 상자는 `.sc-ax`가 1이라 행은 2부터) */
const scRow = (box, sbox, ibox, k, tot) => [
  [`${box} row ${k}`, `${sbox} > div:nth-of-type(${k})`, `${ibox} > div:nth-of-type(${k})`],
  [`${box} row ${k} span`, `${sbox} > div:nth-of-type(${k}) > span`, `${ibox} > div:nth-of-type(${k}) > span`, [], ["width"]],
  [`${box} row ${k} b`, `${sbox} > div:nth-of-type(${k}) > b`, `${ibox} > div:nth-of-type(${k}) > b`, [], ["width"]],
  ...(tot ? [] : [
    [`${box} row ${k} raw`, `${sbox} > div:nth-of-type(${k}) .raw`, `${ibox} > div:nth-of-type(${k}) ${I("raw")}`, [], ["width"]],
  ]),
];
const axis = (k) => {
  const sbox = `${sCard(2)} .jd-final > div:nth-of-type(${k})`;
  const ibox = `${iCard(2)} ${I("jdFinal")} > div:nth-of-type(${k})`;
  return [
    [`axis ${k}`, sbox, ibox],
    [`axis ${k} ax`, `${sbox} .sc-ax`, `${ibox} ${I("scAx")}`],
    [`axis ${k} ax span`, `${sbox} .sc-ax > span`, `${ibox} ${I("scAx")} > span`, [], ["width"]],
    [`axis ${k} ax b`, `${sbox} .sc-ax > b`, `${ibox} ${I("scAx")} > b`, [], ["width"]],
    ...scRow(`axis ${k}`, sbox, ibox, 2),
    ...scRow(`axis ${k}`, sbox, ibox, 3),
    ...scRow(`axis ${k}`, sbox, ibox, 4),
    [`axis ${k} row 2 w`, `${sbox} > div:nth-of-type(2) .w`, `${ibox} > div:nth-of-type(2) ${I("w")}`, [], ["width"]],
  ];
};
const totalBox = () => {
  const sbox = `${sCard(2)} .jd-final > div:nth-of-type(3)`;
  const ibox = `${iCard(2)} ${I("jdFinal")} > div:nth-of-type(3)`;
  return [
    ["total", sbox, ibox],
    ...scRow("total", sbox, ibox, 1),
    ...scRow("total", sbox, ibox, 2, true),
    ...scRow("total", sbox, ibox, 3),
  ];
};

const LIST = {
  none: [
    ...COMMON,
    ...head(1), ["card 1 p", `${sCard(1)} p`, `${iCard(1)} p`, [], [], ["height"]],
    ...head(2), ["card 2 p", `${sCard(2)} p`, `${iCard(2)} p`, [], [], ["height"]],
  ],
  pass: [
    ...COMMON,
    ...head(1, true, true), ...quote(1), ...pubNote(1),
    ...head(2),
  ],
  fail: [
    ...COMMON,
    ...head(1, true, true),
    ["card 1 sum", `${sCard(1)} .hb-sum`, `${iCard(1)} ${H("sum")}`],
    ["card 1 sum div", `${sCard(1)} .hb-sum div`, `${iCard(1)} ${H("sum")} div`],
    ["card 1 sum span", `${sCard(1)} .hb-sum span`, `${iCard(1)} ${H("sum")} span`, [], ["width"]],
    /* 요지는 글자가 다르다(머리 주석) — 폭·높이를 뺀다 */
    ["card 1 sum b", `${sCard(1)} .hb-sum b`, `${iCard(1)} ${H("sum")} b`, [], ["width", "height"]],
    ...quote(1), ...pubNote(1),
    ["card 1 act", `${sCard(1)} .pub-note + div`, `${iCard(1)} ${I("pubNote")} + div`],
    ["card 1 btn", `${sCard(1)} .btn`, `${iCard(1)} a[class*="Button-module"]`],
    ["card 1 act span", `${sCard(1)} .btn + span`, `${iCard(1)} a[class*="Button-module"] + span`, [], ["width"]],
    ...head(2),
  ],
  final: [
    ...COMMON,
    ...head(1, true, true), ...quote(1),
    ...head(2, true, true),
    ["final", `${sCard(2)} .jd-final`, `${iCard(2)} ${I("jdFinal")}`],
    ...axis(1), ...axis(2), ...totalBox(),
    ...quote(2),
  ],
};

const HOVER_CSS = ["color", "background-color", "background-image", "box-shadow",
  "border-top-color", "filter"];
const HOVER = {
  none: [], pass: [], final: [],
  fail: [["btn hover", `${sCard(1)} .btn`, `${iCard(1)} a[class*="Button-module"]`]],
};

const TEXT = {
  none: [
    ["머리", S + ".hb-h1", H("h1")], ["부제", S + ".hb-sub", H("sub")],
    ["카드 1", sCard(1), iCard(1)], ["카드 2", sCard(2), iCard(2)],
  ],
  pass: [
    ["머리", S + ".hb-h1", H("h1")], ["부제", S + ".hb-sub", H("sub")],
    ["카드 1", sCard(1), iCard(1)], ["카드 2", sCard(2), iCard(2)],
  ],
  fail: [
    ["머리", S + ".hb-h1", H("h1")], ["부제", S + ".hb-sub", H("sub")],
    ["카드 1 머리", `${sCard(1)} .jd-hd`, `${iCard(1)} ${I("jdHd")}`],
    ["카드 1 요지 라벨", `${sCard(1)} .hb-sum span`, `${iCard(1)} ${H("sum")} span`],
    ["카드 1 코멘트", `${sCard(1)} .q`, `${iCard(1)} ${I("q")}`],
    ["카드 1 비공개", `${sCard(1)} .pub-note`, `${iCard(1)} ${I("pubNote")}`],
    ["카드 1 행동", `${sCard(1)} .pub-note + div`, `${iCard(1)} ${I("pubNote")} + div`],
    ["카드 2", sCard(2), iCard(2)],
  ],
  final: [
    ["머리", S + ".hb-h1", H("h1")], ["부제", S + ".hb-sub", H("sub")],
    ["카드 1", sCard(1), iCard(1)], ["카드 2", sCard(2), iCard(2)],
  ],
};

/* 데이터 — 판정·확정 시각, 이의신청 기한, 점수·가중치·순위 */
const IGNORE = [
  /^(판정|확정) \d{2}\.\d{2} \d{2}:\d{2}$/,
  /\d{2}\.\d{2} \d{2}:\d{2}까지/,
  /^[\d.,]+$/, /^×[\d.]+$/, /^[\d.]+ \/ 100$/, /^\d+위 \/ \d+팀$/,
  /^총점 S = /,
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
    if (/^(card \\d( hd| act| sum| sum div)?|final|axis \\d|total)$/.test(name)) {
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
  return { hub: pick("hub"), m: pick("judgments") };
})()`;

const fixer = ({ hub, m }) => (sel) =>
  sel
    .replace(/\{\{hub:(\w+)\}\}/g, (_, n) => `.hub-module__${hub}__${n}`)
    .replace(/\{\{(\w+)\}\}/g, (_, n) => `.judgments-module__${m}__${n}`);

/* 다섯째 칸(narrow)은 390px에서만 더 빼는 속성 */
const run = (list, side, w, fix = (v) => v) =>
  probe().replace("LIST", JSON.stringify(list.map(([n, s, i, x, k, narrow]) => {
    const skip = [...(k || []), ...(w <= 390 ? narrow || [] : [])];
    return side === "spec" ? [n, s, x, skip] : [n, fix(i), x, skip];
  })));

/** 시안의 판 고르개. `stripViewerShell()`이 상태 바를 가리기 전에 누른다 */
const pickState = (st) => `(() => {
  document.querySelector('#scr-judgments .sb[data-pane="jd-${st}"]').click();
  return document.querySelector('#scr-judgments .pane.on')?.dataset.id ?? "없음";
})()`;

const stateOf = `(document.querySelector('[data-probe="judgments"]')?.dataset.state ?? "없음")`;

const hideScrollbars = (p) =>
  p.send("Emulation.setScrollbarsHidden", { hidden: true });
const reduceMotion = (p) =>
  p.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });

const state = (...args) =>
  execFileSync("node", [
    "--env-file=.env.development.local", "--import", "tsx",
    "scripts/design-diff/judgments-state.mts", ...args,
  ], { cwd: REPO, encoding: "utf8" });

const STATES = process.env.STATE ? [process.env.STATE] : ["none", "pass", "fail", "final"];
for (const st of STATES) {
  if (!LIST[st]) throw new Error(`STATE는 none·pass·fail·final 중 하나: ${st}`);
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
        await p.goto(SPEC_URL + "#judgments");
        const picked = await p.eval(pickState(st));
        if (picked !== `jd-${st}`) throw new Error(`시안 판 전환 실패: ${picked}`);
        await p.stripViewerShell();
        await p.eval(`(() => {
          document.getElementById("scr-judgments").getAnimations({ subtree: true })
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
        await p.goto(IMPL_URL + "/dashboard/judgments");
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
      total += diffTable(`${st} ${w}px — 심사 결과`, spec.out, impl.out);
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
