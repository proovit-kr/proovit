/*
  측정 연동 — 시안 `#scr-measurement` 세 판과 `/dashboard/measurement`를 대조한다.

    STATE=fail node scripts/design-diff/measurement.mjs   # 한 판만
    node scripts/design-diff/measurement.mjs              # wait · ok · fail 전부

  ⚠️ **상태가 데이터로 갈린다.** 시안은 `.sb[data-set]`로 섹션의 `data-state`를
  바꾸지만 우리는 hostname 행이 정한다 — `measurement-state.mts`가 그 판을 만들고
  세션 토큰을 준다. 구현본이 실제로 그 판을 그리는지(`data-state`) 먼저 확인한다.

  ⚠️ 시안과 일부러 다른 두 자리(등록 전 판, ③의 「배포 주소」 칸)는 재지 않는다
  — MeasurementPanel.tsx 머리 주석. 그 칸이 끼어도 재는 요소의 값은 안 바뀐다.

  헤더(`.db-top`)와 사이드바(`.db-side`)는 크롬이라 `header-states.mjs`가 본다.
  네 축 — 값·상태(hover)·글자·구조.
*/
import { execFileSync } from "node:child_process";

import {
  withPage, diffTable, diffText, textNodes,
  SPEC_URL, IMPL_URL, WIDTHS, shotDir, REPO,
} from "./cdp.mjs";

const OUT = shotDir("measurement");

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
  "opacity",
];

const S = "#scr-measurement ";
const ROOT = '[data-probe="measurement"] ';

/*
  구현본 셀렉터의 자리표. `{{hub:이름}}`은 hub.module.css, `{{이름}}`은
  measurement.module.css의 모듈 클래스로 브라우저 밖에서 바꾼다(hub.mjs와 같다).
*/
const I = (n) => `{{${n}}}`;
const H = (n) => `{{hub:${n}}}`;
const FLD = `${ROOT}[class*="Field-module__"][class*="__fld"]`;

/*
  ⚠️ `.keybox`는 `flex-wrap`을 재지 않는다 — 팀 관리 ②의 코드·배지·버튼이
  390px에 한 줄로 못 서서 공유 클래스에 wrap을 뒀다(hub.module.css). 이 화면은
  주소와 버튼뿐이라 실제로는 한 줄이다.
*/
const COMMON = [
  ["h1", S + ".hb-h1", H("h1"), [], ["width"]],
  ["sub", S + ".hb-sub", H("sub"), [], ["width"]],
  ["fld", S + ".fld", FLD],
  ["fld label", S + ".fld > label", `${FLD} > label`, [], ["width"]],
  ["keybox", S + ".keybox", H("keybox"), [], ["flex-wrap"]],
  /*
    ⚠️ 복사 버튼의 `width`·`margin-left`는 뺀다. 양쪽이 1/64px(Chrome의
    LayoutUnit) 어긋나는데 둘의 합은 같다 — 버튼이 서는 x 좌표의 소수부가
    페이지마다 달라 글자 폭이 한 단위 다르게 잘린 것이지 스타일 차이가 아니다
    (2026-09-22, 세 판·세 폭 모두 51.375 vs 51.3594).
  */
  ["keybox .cp", S + ".keybox .cp", `${H("keybox")} ${I("cp")}`, [], ["width", "margin-left"]],
  ["vsteps", S + ".vsteps", I("vsteps")],
  ["vstep 1", S + ".vstep.done", `${I("vstep")}${I("done")}`],
  ["vstep 1 .dot", S + ".vstep.done .dot", `${I("vstep")}${I("done")} ${I("dot")}`],
  ["vsep", S + ".vsep", I("vsep")],
  ["howto", S + ".card:not(.only-fail)", I("howto")],
  ["howto b", S + ".card:not(.only-fail) b", `${I("howto")} b`, [], ["width"]],
  ["howto p", S + ".card:not(.only-fail) p", `${I("howto")} p`],
];

/* 셋째 칸과 둘째 칸은 판마다 다르다 */
const LIST = {
  wait: [
    ...COMMON,
    ["vstep 2(now)", S + ".vstep.only-wait.now", `${I("vstep")}${I("now")}`],
    ["vstep 2 .dot", S + ".vstep.only-wait.now .dot", `${I("vstep")}${I("now")} ${I("dot")}`],
    ["vstep 3", S + ".vstep.only-wait:not(.now)", `${I("vstep")}:not(${I("now")}):not(${I("done")})`],
    ["vstep 3 .dot", S + ".vstep.only-wait:not(.now) .dot",
      `${I("vstep")}:not(${I("now")}):not(${I("done")}) ${I("dot")}`],
    ["badge", S + ".badge.only-wait", `${ROOT}[class*="Badge-module"]`],
    ["btn", S + ".btn-primary.only-wait", `${ROOT}button[type="submit"]`],
  ],
  ok: [
    ...COMMON,
    ["vstep 2(done)", S + ".vstep.only-ok.done", `${I("vstep")}${I("done")} ~ ${I("vstep")}${I("done")}`],
    ["vstep 2 .dot", S + ".vstep.only-ok.done .dot",
      `${I("vstep")}${I("done")} ~ ${I("vstep")}${I("done")} ${I("dot")}`],
    ["vstep 3(now)", S + ".vstep.only-ok.now", `${I("vstep")}${I("now")}`],
    ["vstep 3 .dot", S + ".vstep.only-ok.now .dot", `${I("vstep")}${I("now")} ${I("dot")}`],
    ["badge", S + ".badge.only-ok", `${ROOT}[class*="Badge-module"]`],
  ],
  fail: [
    ...COMMON,
    ["vstep 2(done)", S + ".vstep.only-fail.done", `${I("vstep")}${I("done")} ~ ${I("vstep")}${I("done")}`],
    ["vstep 2 .dot", S + ".vstep.only-fail.done .dot",
      `${I("vstep")}${I("done")} ~ ${I("vstep")}${I("done")} ${I("dot")}`],
    ["vstep 3(fail)", S + ".vstep.only-fail.fail", `${I("vstep")}${I("fail")}`],
    ["vstep 3 .dot", S + ".vstep.only-fail.fail .dot", `${I("vstep")}${I("fail")} ${I("dot")}`],
    ["badge", S + ".badge.only-fail", `${ROOT}[class*="Badge-module"]`],
    ["cause", S + ".card.only-fail", I("cause")],
    ["cause b", S + ".card.only-fail b", `${I("cause")} b`, [], ["width"]],
    ["cause p", S + ".card.only-fail p", `${I("cause")} p`],
    ["btn", S + ".btn-outline.only-fail", `${ROOT}button[type="submit"]`],
  ],
};

/* 상태 축 — hover에만 있는 규칙. [이름, 시안, 구현, 재는 속성] */
const HOVER_CSS = ["color", "background-color", "background-image", "box-shadow",
  "border-top-color", "filter"];
const HOVER = {
  wait: [
    ["복사 hover", S + ".keybox .cp", `${H("keybox")} ${I("cp")}`],
    ["btn hover", S + ".btn-primary.only-wait", `${ROOT}button[type="submit"]`],
  ],
  ok: [["복사 hover", S + ".keybox .cp", `${H("keybox")} ${I("cp")}`]],
  fail: [
    ["복사 hover", S + ".keybox .cp", `${H("keybox")} ${I("cp")}`],
    ["btn hover", S + ".btn-outline.only-fail", `${ROOT}button[type="submit"]`],
  ],
};

/* 글자 — 시안 문구를 우리가 정본으로 쓰는 자리. 주소(keybox)도 같은 팀이라 본다 */
const TEXT = {
  wait: [
    ["머리", S + ".hb-h1", H("h1")], ["부제", S + ".hb-sub", H("sub")],
    ["라벨", S + ".fld > label", `${FLD} > label`],
    ["주소", S + ".keybox", H("keybox")],
    ["절차", S + ".vsteps", I("vsteps")],
    ["배지", S + ".badge.only-wait", `${ROOT}[class*="Badge-module"]`],
    ["연결 방법", S + ".card:not(.only-fail)", I("howto")],
    ["버튼", S + ".btn-primary.only-wait", `${ROOT}button[type="submit"]`],
  ],
  ok: [
    ["머리", S + ".hb-h1", H("h1")], ["부제", S + ".hb-sub", H("sub")],
    ["라벨", S + ".fld > label", `${FLD} > label`],
    ["주소", S + ".keybox", H("keybox")],
    ["절차", S + ".vsteps", I("vsteps")],
    ["배지", S + ".badge.only-ok", `${ROOT}[class*="Badge-module"]`],
    ["연결 방법", S + ".card:not(.only-fail)", I("howto")],
  ],
  fail: [
    ["머리", S + ".hb-h1", H("h1")], ["부제", S + ".hb-sub", H("sub")],
    ["라벨", S + ".fld > label", `${FLD} > label`],
    ["주소", S + ".keybox", H("keybox")],
    ["절차", S + ".vsteps", I("vsteps")],
    ["배지", S + ".badge.only-fail", `${ROOT}[class*="Badge-module"]`],
    ["원인", S + ".card.only-fail", I("cause")],
    ["연결 방법", S + ".card:not(.only-fail)", I("howto")],
    ["버튼", S + ".btn-outline.only-fail", `${ROOT}button[type="submit"]`],
  ],
};

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
    /* 시안은 다른 판의 칸(.only-*)을 display:none으로 남겨 둔다 — 보이는 것만 센다 */
    if (["vsteps", "fld", "keybox"].includes(name)) {
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
  return { hub: pick("hub"), m: pick("measurement") };
})()`;

const fixer = ({ hub, m }) => (sel) =>
  sel
    .replace(/\{\{hub:(\w+)\}\}/g, (_, n) => `.hub-module__${hub}__${n}`)
    .replace(/\{\{(\w+)\}\}/g, (_, n) => `.measurement-module__${m}__${n}`);

const run = (list, side, fix = (v) => v) =>
  probe().replace("LIST", JSON.stringify(list.map(([n, s, i, x, k]) =>
    side === "spec" ? [n, s, x, k] : [n, fix(i), x, k])));

/** 시안의 판 고르개. `stripViewerShell()`이 상태 바를 가리기 전에 누른다 */
const pickState = (st) => `(() => {
  const btn = document.querySelector('#scr-measurement .sb[data-set="${st}"]');
  btn.click();
  return document.getElementById("scr-measurement").dataset.state;
})()`;

const stateOf = `(document.querySelector('[data-probe="measurement"]')?.dataset.state ?? "없음")`;

const hideScrollbars = (p) =>
  p.send("Emulation.setScrollbarsHidden", { hidden: true });

const state = (...args) =>
  execFileSync("node", [
    "--env-file=.env.development.local", "--import", "tsx",
    "scripts/design-diff/measurement-state.mts", ...args,
  ], { cwd: REPO, encoding: "utf8" });

const STATES = process.env.STATE ? [process.env.STATE] : ["wait", "ok", "fail"];
for (const st of STATES) {
  if (!LIST[st]) throw new Error(`STATE는 wait·ok·fail 중 하나: ${st}`);
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
        await p.goto(SPEC_URL + "#measurement");
        const picked = await p.eval(pickState(st));
        if (picked !== st) throw new Error(`시안 판 전환 실패: ${picked}`);
        await p.stripViewerShell();
        await p.eval(`(() => {
          document.getElementById("scr-measurement").getAnimations({ subtree: true })
            .forEach(a => { if (a.effect?.getTiming().iterations !== Infinity) a.finish(); });
          return 1;
        })()`);
        await p.resize(w, 520);
        const r = await p.eval(run(list, "spec"));
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
        await p.send("Network.clearBrowserCookies");
        await p.send("Network.setCookie", {
          name: "authjs.session-token", value: token,
          domain: new URL(IMPL_URL).hostname, path: "/",
        });
        await p.goto(IMPL_URL + "/dashboard/measurement");
        const fix = fixer(await p.eval(hashOf));
        const drawn = await p.eval(stateOf);
        if (drawn !== st) {
          throw new Error(`구현본이 ${drawn}을 그린다 — ${st}여야 한다`);
        }
        await p.resize(w, 520);
        const r = await p.eval(run(list, "impl", fix));
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
      total += diffTable(`${st} ${w}px — 측정 연동`, spec.out, impl.out);
      total += diffTable(`${st} ${w}px — hover`, spec.hover, impl.hover);
      for (const [n] of texts) {
        total += diffText(spec.text[n], impl.text[n], { label: n });
      }
    }
  }
} finally {
  console.log(state("restore").trim());
}

console.log(`\n═══════════════════════════\n합계 불일치 ${total}건`);
console.log(`스크린샷: ${OUT}`);
