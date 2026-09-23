/*
  운영자 화면 — 시안 `.screen.adm` 열한 개와 `/admin/*`를 대조한다.

    SCREEN=dash node scripts/design-diff/admin.mjs          # 한 화면
    SCREEN=metrics STATE=q node scripts/design-diff/admin.mjs  # 판이 있는 화면의 한 판
    node scripts/design-diff/admin.mjs                      # 전부

  화면마다 크롬(사이드바·상단 바의 시안 몫·본문 상자)을 같이 잰다 — 운영자 크롬은
  화면이 열한 개라 한 번 어긋나면 열한 번 어긋난다.

  ⚠️ **데이터는 시안 목업이 아니다.** 표의 몸통·숫자·팀명은 dev DB에서 온다 —
  `admin-state.mts`가 화면마다 시안과 같은 모양의 행을 심고 운영자 세션을 준다.
  글자 대조는 시안이 문안의 정본인 자리(제목·부제·머리글·버튼·안내)만 본다.

  상단 바는 시안 몫(높이·여백·재질·ADMIN 태그·시즌 셀렉트)만 잰다. 가운데의
  상태 배지·대기열·아바타는 「헤더 상태별 시안 v1.0」 A1~A7이라 `header-states.mjs`가 본다.

  네 축 — 값·상태(hover)·글자·구조.
*/
import { execFileSync } from "node:child_process";

import {
  withPage, diffTable, diffText, textNodes,
  SPEC_URL, IMPL_URL, WIDTHS, shotDir, REPO,
} from "./cdp.mjs";

import { SCREENS } from "./admin-probes.mjs";

const CSS = [
  "font-size", "font-weight", "line-height", "letter-spacing",
  "color", "background-color", "background-image",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "border-radius", "box-shadow", "gap", "display", "flex-wrap",
  "align-items", "justify-content", "text-align", "white-space",
  "width", "height", "font-family", "font-variant-numeric",
  "flex-grow", "flex-shrink", "flex-basis",
  "grid-template-columns",
  "border-top-width", "border-top-style", "border-top-color",
  "border-bottom-width", "border-bottom-style", "border-bottom-color",
  "border-left-width", "border-left-style", "border-left-color",
  "opacity", "text-decoration-line", "vertical-align", "max-width",
  "position", "overflow-x",
];

/* 의사요소 — 시안 연출의 절반이 여기 있다(AGENTS.md 함정 2) */
const PSEUDO_CSS = [
  "content", "position", "width", "height", "top", "left", "right",
  "background-color", "background-image", "border-radius", "margin-right",
  "opacity", "animation-name", "mix-blend-mode",
];

const HOVER_CSS = [
  "color", "background-color", "background-image", "box-shadow",
  "border-top-color", "border-left-color", "filter", "opacity",
];

/* ── 크롬 — 모든 화면에 붙는다 ── */
const SIDE = 'nav[aria-label="운영자 콘솔"]';
/*
  ⚠️ 상단 바의 `position`은 뺀다 — sticky를 바가 아니라 감싼 `<header>`에 건다
  (admin.module.css `.head`). 390에서 바 높이·시즌 셀렉트가 다른 것은 헤더 상태별
  시안 5장(≤760은 대기열 한 줄, 셀렉트 숨김)을 따른 것이라 뺀다.
*/
const chrome = (S) => [
  ["top", S + ".db-top", '[data-probe="ad-top"]',
    [], ["gap", "width", "justify-content", "position"], ["height", "padding-top", "padding-bottom"]],
  ["top .wm", S + ".db-top .wm", '[data-probe="ad-top"] > a:first-child', [], ["width", "line-height", "margin-right"]],
  ["top ADMIN", S + ".db-top .ad-tag", '[data-probe="ad-top"] [class*="HeaderBits-module"][class*="__adTag"]'],
  ["top 시즌", S + ".db-top .ssel", '[data-probe="ad-top"] select', [], ["width", "margin-left"], ["display", "height"]],
  ["side", S + ".db-side", SIDE, [], ["height"]],
  ["side 켜짐", S + ".db-side .db-it.on", `${SIDE} [aria-current="page"]`, [], ["width"]],
  ["side 항목", S + ".db-side .db-it:not(.on)", `${SIDE} a:not([aria-current])`, [], ["width"]],
  ["body", S + ".ad-body", 'main[data-probe="ad-body"]', [], ["height"]],
];
const CHROME_TEXT = (S) => [["사이드바", S + ".db-side", SIDE]];
const CHROME_HOVER = (S) => [["side hover", S + ".db-side .db-it:not(.on)", `${SIDE} a:not([aria-current])`]];

const probe = (list) => `(() => {
  const CSS = ${JSON.stringify(CSS)}, PSEUDO = ${JSON.stringify(PSEUDO_CSS)};
  const narrow = innerWidth <= 760;
  const out = {}, missing = [];
  const norm = (p, v) => p.startsWith("background") ? v.replace(/ 0%/g, " 0px") : v;
  for (const [name, sel, extra, skip, narrowSkip, opts] of ${JSON.stringify(list)}) {
    const el = document.querySelector(sel);
    if (!el) { missing.push(name + "  ← " + sel); continue; }
    const skips = (skip || []).concat(narrow ? (narrowSkip || []) : []);
    const cs = getComputedStyle(el);
    for (const p of CSS.concat(extra || [])) {
      if (skips.includes(p)) continue;
      if (p.startsWith("border-") && !p.endsWith("width")) {
        const side = p.split("-")[1];
        if (cs.getPropertyValue("border-" + side + "-width") === "0px") continue;
      }
      out[name + " " + p] = norm(p, cs.getPropertyValue(p));
    }
    for (const ps of ["::before", "::after"]) {
      const pc = getComputedStyle(el, ps);
      if (pc.content === "none" || pc.content === "normal") continue;
      for (const p of PSEUDO) {
        if (skips.includes(ps + " " + p)) continue;
        out[name + ps + " " + p] = norm(p, pc.getPropertyValue(p));
      }
    }
    if (!skips.includes("overflow")) out[name + " ▸가로 넘침"] = String(el.scrollWidth > el.clientWidth + 1);
    if (opts?.kids) {
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

/* 구현본 모듈 해시 — `{{c:이름}}` console, `{{hub:이름}}` hub, `{{p:이름}}` 그 화면 모듈 */
const hashOf = (mod) => `(() => {
  const pick = (m) => {
    const e = document.querySelector('[class*="' + m + '-module__"]');
    return e ? (e.className.baseVal ?? e.className).match(new RegExp(m + '-module__([A-Za-z0-9_-]+?)__'))?.[1] ?? null : null;
  };
  return { c: pick("console"), hub: pick("hub"), p: ${mod ? `pick(${JSON.stringify(mod)})` : "null"} };
})()`;

const fixer = ({ c, hub, p }, mod) => (sel) =>
  sel
    .replace(/\{\{c:(\w+)\}\}/g, (_, n) => `.console-module__${c}__${n}`)
    .replace(/\{\{hub:(\w+)\}\}/g, (_, n) => `.hub-module__${hub}__${n}`)
    .replace(/\{\{p:(\w+)\}\}/g, (_, n) => `.${mod}-module__${p}__${n}`);

const hideScrollbars = (p) => p.send("Emulation.setScrollbarsHidden", { hidden: true });

const state = (...args) =>
  execFileSync("node", [
    "--env-file=.env.development.local", "--import", "tsx",
    "scripts/design-diff/admin-state.mts", ...args,
  ], { cwd: REPO, encoding: "utf8" });

/* 판 목록 — 판이 없는 화면은 [null] 하나 */
const plan = [];
for (const [key, scr] of Object.entries(SCREENS)) {
  if (process.env.SCREEN && process.env.SCREEN !== key) continue;
  const states = scr.states ? Object.keys(scr.states) : [null];
  for (const st of states) {
    if (process.env.STATE && st !== process.env.STATE) continue;
    plan.push([key, st]);
  }
}
if (!plan.length) throw new Error(`SCREEN은 ${Object.keys(SCREENS).join("·")} 중 하나`);

console.log(state("save").trim());

let total = 0;
try {
  for (const [key, st] of plan) {
    const scr = SCREENS[key];
    const S = `#scr-${scr.hash} `;
    const sub = st ? scr.states[st] : {};
    const list = [...chrome(S), ...(scr.list(S, st) ?? [])];
    const texts = [...CHROME_TEXT(S), ...(scr.text?.(S, st) ?? [])];
    const hovers = [...CHROME_HOVER(S), ...(scr.hover?.(S, st) ?? [])];
    const token = state(key + (st ? `:${st}` : "")).trim().split("\n").pop();
    const OUT = shotDir(`admin-${key}`);
    const tag = `${key}${st ? `·${st}` : ""}`;

    for (const w of WIDTHS) {
      const spec = await withPage(async (p) => {
        await hideScrollbars(p);
        await p.send("Emulation.setEmulatedMedia", {
          features: [{ name: "prefers-reduced-motion", value: "reduce" }],
        });
        await p.goto(SPEC_URL + "#" + scr.hash);
        if (sub.pane) {
          const on = await p.eval(`(() => {
            document.querySelector('#scr-${scr.hash} .sb[data-pane="${sub.pane}"]').click();
            return document.querySelector('#scr-${scr.hash} .pane.on')?.dataset.id;
          })()`);
          if (on !== sub.pane) throw new Error(`시안 판 전환 실패: ${on}`);
        }
        await p.stripViewerShell();
        await p.resize(w, 520);
        const r = await p.eval(probe(list.map(([n, s, , x, k, nk, o]) => [n, s, x, k, nk, o])));
        r.text = {};
        for (const [n, sel] of texts) r.text[n] = await p.eval(textNodes(sel));
        r.hover = {};
        /* 넷째 칸이 있으면 그 요소에 hover를 걸고 셋째(재는 요소)를 잰다 — 행 hover가 칸 배경을 바꾸는 자리 */
        for (const [n, sel, , on] of hovers) {
          await p.hover(on ?? sel);
          Object.assign(r.hover, await p.eval(hoverProbe(n, sel)));
        }
        await p.hover();
        await p.resize(w, 900);
        await p.shot(`${OUT}/spec-${st ?? "one"}-${w}.png`);
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
        await p.goto(IMPL_URL + scr.route + (sub.query ?? ""));
        const fix = fixer(await p.eval(hashOf(scr.mod)), scr.mod);
        if (scr.guard) {
          const drawn = await p.eval(scr.guard);
          if (drawn !== (st ?? true)) throw new Error(`구현본 판이 ${drawn} — ${st}여야 한다`);
        }
        await p.resize(w, 520);
        const r = await p.eval(probe(list.map(([n, , i, x, k, nk, o]) => [n, fix(i), x, k, nk, o])));
        r.text = {};
        for (const [n, , sel] of texts) r.text[n] = await p.eval(textNodes(fix(sel)));
        r.hover = {};
        for (const [n, , sel, , on] of hovers) {
          await p.hover(fix(on ?? sel));
          Object.assign(r.hover, await p.eval(hoverProbe(n, fix(sel))));
        }
        await p.hover();
        await p.resize(w, 900);
        await p.shot(`${OUT}/impl-${st ?? "one"}-${w}.png`);
        return r;
      });

      console.log(`\n\n████ ${tag} · 폭 ${w}`);
      for (const m of spec.missing) console.log(`  ⚠️ 시안에서 못 찾음: ${m}`);
      for (const m of impl.missing) console.log(`  ⚠️ 구현본에서 못 찾음: ${m}`);
      total += spec.missing.length + impl.missing.length;
      total += diffTable(`${tag} ${w}px — 값`, spec.out, impl.out);
      total += diffTable(`${tag} ${w}px — hover`, spec.hover, impl.hover);
      for (const [n, , , ig] of texts) {
        total += diffText(spec.text[n], impl.text[n], { label: n, ignore: ig ?? [] });
      }
    }
  }
} finally {
  console.log(state("restore").trim());
}

console.log(`\n═══════════════════════════\n합계 불일치 ${total}건`);
console.log(`스크린샷: ${shotDir("admin-" + (process.env.SCREEN ?? "*").replace("*", "all"))}`);
