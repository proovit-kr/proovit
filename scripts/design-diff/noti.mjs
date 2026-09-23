/*
  알림센터 — 시안 `#scr-noti` ① 목록과 `/notifications`를 대조한다.

    node scripts/design-diff/noti.mjs

  ⚠️ **판이 데이터로 갈린다.** 시안은 `.sb[data-pane]`로 `.pane.on`을 바꾸지만
  우리는 알림 행이 정한다 — `noti-state.mts`가 시안 목업 여덟 줄을 심고 세션
  토큰을 준다. 구현본이 그 판을 그리는지(`data-state`) 먼저 확인한다.

  ⚠️ 행 순서는 다르다 — 시안 목업은 날짜 순이 아니고 우리는 최신 순이다. 그래서
  행을 n번째로 집지 않고 **유형·읽음으로** 집는다(안 읽음 심사·마감, 읽은 안내·심사·마감).
  글자는 집합으로 대조하므로 순서와 무관하다.

  헤더(`.db-top`)와 사이드바(`.db-side`)는 크롬이라 `header-states.mjs`가 본다.
  네 축 — 값·상태(hover)·글자·구조.
*/
import { execFileSync } from "node:child_process";

import {
  withPage, diffTable, diffText, textNodes,
  SPEC_URL, IMPL_URL, WIDTHS, shotDir, REPO,
} from "./cdp.mjs";

const OUT = shotDir("noti");

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

const S = "#scr-noti ";
const P = "#scr-noti .pane.on ";
const ROOT = '[data-probe="noti"] ';

const H = (n) => `{{hub:${n}}}`;
const N = (n) => `{{n:${n}}}`;

/* 한 행과 그 안 — 시안 `.nt.t-X[.read]`, 우리 `.nt.X[.read]` */
const row = (name, tone, read) => {
  const s = `${P}.nt.t-${tone}${read ? ".read" : ":not(.read)"}`;
  const i = `${ROOT}${N("nt")}${N(tone)}${read ? N("read") : `:not(${N("read")})`}`;
  return [
    /* 글이 긴 행은 폭에 따라 줄 수가 같아도 높이는 글이 정한다 — 같은 글이라 그대로 잰다 */
    [name, s, i],
    [`${name} dt`, `${s} .dt`, `${i} ${N("dt")}`],
    [`${name} txt`, `${s} > span:nth-child(2)`, `${i} > span:nth-child(2)`],
    [`${name} b`, `${s} b`, `${i} b`, [], ["width"]],
    [`${name} p`, `${s} p`, `${i} p`],
    /* `margin-left: auto`의 계산값은 형제 폭에 딸린다 — 플레이북 */
    [`${name} tm`, `${s} .tm`, `${i} ${N("tm")}`, [], ["margin-left", "width"]],
    ...(read ? [] : [[`${name} un`, `${s} .un`, `${i} ${N("un")}`]]),
  ];
};

const LIST = {
  list: [
    ["head", `${S}.db-body > div:first-child`, `${ROOT}> div:first-child`],
    ["h1", S + ".hb-h1", `${ROOT}${H("h1")}`, [], ["width"]],
    /* 우리 버튼은 `display:contents` 폼 안 — 상자로는 머리 줄의 직접 flex 항목이다 */
    ["btn", `${S}.db-body > div:first-child .btn`, `${ROOT}> div:first-child button`],
    ["sub", S + ".hb-sub", `${ROOT}> ${H("sub")}`],
    ["pane", P.trim(), `${ROOT}> div:last-child`],
    ...row("judge un", "judge", false),
    ...row("due un", "due", false),
    ...row("info read", "info", true),
    ...row("judge read", "judge", true),
    ...row("due read", "due", true),
    /* 마지막 줄은 밑줄이 없다 */
    ["last", `${P}.nt:last-of-type`, `${ROOT}> div:last-child > :last-child`, [], ["height", "width"]],
  ],
};

const HOVER_CSS = ["color", "background-color", "background-image", "box-shadow",
  "border-top-color", "filter"];
const HOVER = {
  list: [["btn hover", `${S}.db-body > div:first-child .btn`, `${ROOT}> div:first-child button`]],
};

/* 글자는 통째로 — 머리부터 목록 끝까지 */
const TEXT = {
  list: [["화면", `${S}.db-body`, ROOT.trim()]],
};

/* 데이터 — 날짜는 「오늘」 기준으로 심는다(dev 일정의 h6 「오늘」은 시안의 10.23이 아니다) */
const IGNORE = [/^\d{2}\.\d{2}$/];

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
    if (/^(head|pane|[a-z]+ (un|read))$/.test(name)) {
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

/* 머리는 허브 모듈, 행은 알림센터 모듈 */
const hashOf = `(() => {
  const pick = (mod) => {
    const e = document.querySelector('[class*="' + mod + '-module__"]');
    return e ? (e.className.match(new RegExp(mod + '-module__([A-Za-z0-9_-]+?)__')) || [])[1] : null;
  };
  return { hub: pick("hub"), n: pick("notifications") };
})()`;

const fixer = ({ hub, n: nt }) => (sel) =>
  sel
    .replace(/\{\{hub:(\w+)\}\}/g, (_, n) => `.hub-module__${hub}__${n}`)
    .replace(/\{\{n:(\w+)\}\}/g, (_, n) => `.notifications-module__${nt}__${n}`);

/* 다섯째 칸(narrow)은 390px에서만 더 빼는 속성 */
const run = (list, side, w, fix = (v) => v) =>
  probe().replace("LIST", JSON.stringify(list.map(([n, s, i, x, k, narrow]) => {
    const skip = [...(k || []), ...(w <= 390 ? narrow || [] : [])];
    return side === "spec" ? [n, s, x, skip] : [n, fix(i), x, skip];
  })));

/** 시안의 판 고르개. `stripViewerShell()`이 상태 바를 가리기 전에 누른다 */
const pickState = (st) => `(() => {
  document.querySelector('#scr-noti .sb[data-pane="nt-${st}"]').click();
  return document.querySelector('#scr-noti .pane.on')?.dataset.id ?? "없음";
})()`;

const stateOf = `(document.querySelector('[data-probe="noti"]')?.dataset.state ?? "없음")`;

const hideScrollbars = (p) =>
  p.send("Emulation.setScrollbarsHidden", { hidden: true });
const reduceMotion = (p) =>
  p.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });

const state = (...args) =>
  execFileSync("node", [
    "--env-file=.env.development.local", "--import", "tsx",
    "scripts/design-diff/noti-state.mts", ...args,
  ], { cwd: REPO, encoding: "utf8" });

const STATES = process.env.STATE ? [process.env.STATE] : ["list"];
for (const st of STATES) {
  if (!LIST[st]) throw new Error(`STATE는 list: ${st}`);
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
        await p.goto(SPEC_URL + "#noti");
        const picked = await p.eval(pickState(st));
        if (picked !== `nt-${st}`) throw new Error(`시안 판 전환 실패: ${picked}`);
        await p.stripViewerShell();
        await p.eval(`(() => {
          document.getElementById("scr-noti").getAnimations({ subtree: true })
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
        await p.goto(IMPL_URL + "/notifications");
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
      total += diffTable(`${st} ${w}px — 알림센터`, spec.out, impl.out);
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
