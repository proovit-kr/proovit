/*
  결제 연동 — 시안 `#scr-payment` 세 판과 `/dashboard/payment`를 대조한다.

    STATE=inq node scripts/design-diff/payment.mjs   # 한 판만
    node scripts/design-diff/payment.mjs             # none · ok · inq 전부

  ⚠️ **상태가 데이터로 갈린다.** 시안은 `.sb[data-pane]`로 `.pane.on`을 바꾸지만
  우리는 과금 유형과 연동 행이 정한다 — `payment-state.mts`가 그 판을 만들고
  세션 토큰을 준다. 구현본이 실제로 그 판을 그리는지(`data-state`) 먼저 확인한다.
  시안에 없는 `pending` 판은 재지 않는다(②와 배지 톤만 다르다).

  ⚠️ 시안과 일부러 다른 자리(③의 「주소 저장하기」)는 글자를 재지 않는다 —
  PaymentPanel.tsx 머리 주석. 값·구조는 그 자리도 잰다.

  헤더(`.db-top`)와 사이드바(`.db-side`)는 크롬이라 `header-states.mjs`가 본다.
  네 축 — 값·상태(hover)·글자·구조.
*/
import { execFileSync } from "node:child_process";

import {
  withPage, diffTable, diffText, textNodes,
  SPEC_URL, IMPL_URL, WIDTHS, shotDir, REPO,
} from "./cdp.mjs";

const OUT = shotDir("payment");

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
  "opacity",
];

/* 시안은 판마다 `.pane`이 따로 있고 켜진 것만 `.on`이다 */
const S = "#scr-payment .pane.on ";
const HEAD = "#scr-payment ";
const ROOT = '[data-probe="payment"] ';

const I = (n) => `{{${n}}}`;
const H = (n) => `{{hub:${n}}}`;
const FLD_ONLY = `[class*="Field-module__"][class*="__fld"]`;
const FLD = `${ROOT}${FLD_ONLY}`;
const FLD2 = `${FLD} ~ ${FLD_ONLY}`;
const BADGE = `${ROOT}[class*="Badge-module"]`;

/*
  ⚠️ 두 종류를 뺀다.
  · `width`가 1/64px(Chrome LayoutUnit) 어긋나는 인라인 요소(py-type·badge) —
    측정 연동의 복사 버튼과 같은 사정이다. 폭+여백 합은 같다.
  · `input.inp.mono`의 `font-family`·`height` — 시안에서는 `.mono`가 `.inp`에
    덮여 모노로 안 나온다(Field.module.css 주석). 우리는 표시한 뜻을 따른다.
    값이 길면 칸 안에서 스크롤되므로 `overflow`(가로 넘침)도 입력에는 안 본다.
*/
const MONO_INPUT_SKIP = ["font-family", "height", "overflow"];

const COMMON = [
  ["h1", HEAD + ".hb-h1", H("h1"), [], ["width"]],
  ["sub", HEAD + ".hb-sub", H("sub"), [], ["width"]],
  ["py-type", S + ".py-type", I("pyType"), [], ["width"]],
  ["py-type b", S + ".py-type b", `${I("pyType")} b`, [], ["width"]],
  ["py-type .lk", S + ".py-type .lk", I("lk"), [], ["width"]],
  ["info-strip", S + ".info-strip", H("infoStrip")],
];

const LIST = {
  none: [
    ...COMMON,
    ["fld 1", S + ".fld", FLD],
    ["fld 1 label", S + ".fld > label", `${FLD} > label`, [], ["width"]],
    ["select", S + "select.inp", `${ROOT} select`],
    ["fld 2", S + ".fld ~ .fld", FLD2, [], ["height"]],
    ["fld 2 label", S + ".fld ~ .fld > label", `${FLD2} > label`, [], ["width"]],
    ["input", S + "input.inp", `${ROOT} input[name="readonlyKey"]`, [], MONO_INPUT_SKIP],
    ["hint", S + ".fld .hint", `${FLD} > p`],
    ["btn", S + ".btn-primary", `${ROOT} button[type="submit"]`, [], ["width"]],
  ],
  ok: [
    ...COMMON,
    /*
      ⚠️ 390px에서 시안 ②의 keybox는 한 줄에 못 들어가 가로로 넘치고 배지·버튼이
      세로로 눌린다(스크린샷 spec-ok-390). 우리는 공유 클래스의 `flex-wrap`으로
      줄을 넘긴다(hub.module.css, 팀 관리 ②와 같은 결정). 그래서 좁은 폭에서는
      높이·넘침을 안 본다 — 다섯째 칸(390px에서만 빼는 속성).
    */
    ["fld", S + ".fld", FLD, [], [], ["height", "overflow"]],
    ["fld label", S + ".fld > label", `${FLD} > label`, [], ["width"]],
    ["keybox", S + ".keybox", H("keybox"), [], ["flex-wrap"], ["height", "overflow"]],
    ["badge", S + ".keybox .badge", BADGE, [], ["width"], ["height"]],
    /*
      ⚠️ `.cp`와 두 버튼의 `width`·`margin-left`는 뺀다 — 측정 연동과 같은
      LayoutUnit(1/64px) 어긋남이다. 폭+여백 합은 같다.
    */
    ["cp", S + ".keybox .cp", I("cp"), [], ["width", "margin-left"], ["height"]],
    ["cp test", S + ".keybox .cp .btn-outline", `${I("cp")} button[value="test"]`, [], ["width"], ["height"]],
    ["cp del", S + ".keybox .cp .btn-ghost", `${I("cp")} button[value="delete"]`, [], ["width"], ["height"]],
    ["hint", S + ".fld .hint", `${FLD} > p`],
    ["sum", S + ".hb-sum", H("sum")],
    ["sum div", S + ".hb-sum div", `${H("sum")} > div`],
    ["sum span", S + ".hb-sum span", `${H("sum")} span`, [], ["width"]],
    ["sum b", S + ".hb-sum b", `${H("sum")} b`, [], ["width"]],
    ["sum b 2", S + ".hb-sum div:last-child b", `${H("sum")} div:last-child b`, [], ["width"]],
  ],
  inq: [
    ...COMMON,
    ["levels", S + ".card:not(.hb-sum)", I("levels")],
    ["lv", S + ".lv", I("lv")],
    ["lv last", S + ".lv:last-of-type", `${I("lv")}:last-of-type`],
    ["lv .k", S + ".lv .k", I("k"), [], ["width"]],
    ["lv text", S + ".lv .k + span", `${I("k")} + span`, [], ["width"]],
    ["lv .pt", S + ".lv .pt", I("pt"), [], ["width"]],
    ["fld", S + ".fld", FLD, [], ["height"]],
    ["fld label", S + ".fld > label", `${FLD} > label`, [], ["width"]],
    ["fld label small", S + ".fld > label small", `${FLD} > label small`, [], ["width"]],
    ["input", S + "input.inp", `${ROOT} input[name="inquiryUrl"]`, [], MONO_INPUT_SKIP],
    ["hint", S + ".fld .hint", `${FLD} > p`],
    ["sum", S + ".hb-sum", H("sum")],
    ["sum div", S + ".hb-sum div", `${H("sum")} > div`],
    ["sum span", S + ".hb-sum span", `${H("sum")} span`, [], ["width"]],
    ["sum b", S + ".hb-sum b", `${H("sum")} b`, [], ["width"]],
    ["sum b 2", S + ".hb-sum div:last-child b", `${H("sum")} div:last-child b`, [], ["width"]],
    ["note", S + "> .hint", I("note")],
  ],
};

/* 상태 축 — hover에만 있는 규칙 */
const HOVER_CSS = ["color", "background-color", "background-image", "box-shadow",
  "border-top-color", "filter"];
const HOVER = {
  none: [["btn hover", S + ".btn-primary", `${ROOT} button[type="submit"]`]],
  ok: [
    ["test hover", S + ".keybox .cp .btn-outline", `${I("cp")} button[value="test"]`],
    ["del hover", S + ".keybox .cp .btn-ghost", `${I("cp")} button[value="delete"]`],
  ],
  inq: [],
};

/*
  글자 — 시안 문구를 우리가 정본으로 쓰는 자리만. 데이터(상점 아이디·금액·
  건수·현재 단계·주소·테스트 시각)와 일부러 다른 자리(머리 주석)는 뺀다.
*/
const HEAD_TEXT = [
  ["머리", HEAD + ".hb-h1", H("h1")], ["부제", HEAD + ".hb-sub", H("sub")],
  ["과금 유형", S + ".py-type", I("pyType")],
];
const TEXT = {
  none: [
    ...HEAD_TEXT,
    ["안내줄", S + ".info-strip", H("infoStrip")],
    ["결제사 라벨", S + ".fld > label", `${FLD} > label`],
    ["결제사 선택지", S + "select.inp", `${ROOT} select`],
    ["조회키 라벨", S + ".fld ~ .fld > label", `${FLD2} > label`],
    ["힌트", S + ".fld .hint", `${FLD} > p`],
    ["버튼", S + ".btn-primary", `${ROOT} button[type="submit"]`],
  ],
  ok: [
    ...HEAD_TEXT,
    ["안내줄", S + ".info-strip", H("infoStrip")],
    ["라벨", S + ".fld > label", `${FLD} > label`],
    /* 가린 키는 개발 바가 심는 가짜 키라 시안 목업과 글자가 같다 */
    ["키 상자", S + ".keybox", H("keybox")],
    ["힌트(시각은 데이터)", S + ".fld .hint", `${FLD} > p`],
    ["요약 라벨", S + ".hb-sum", H("sum")],
  ],
  inq: [
    ...HEAD_TEXT,
    ["안내줄", S + ".info-strip", H("infoStrip")],
    ["단계 표", S + ".card:not(.hb-sum)", I("levels")],
    ["라벨", S + ".fld > label", `${FLD} > label`],
    ["힌트", S + ".fld .hint", `${FLD} > p`],
    ["요약", S + ".hb-sum", H("sum")],
    ["하단 안내", S + "> .hint", I("note")],
  ],
};
const IGNORE = {
  none: [],
  /* 매출·건수는 개발 바가 심는 거래 행이라 시안 목업과 같다 — 대조한다 */
  ok: [/^마지막 테스트 /, /^토스페이먼츠$/],
  inq: [/^L\d, /, /^판정 전/, /^문의 수단 등록 전/],
};

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
    if (["py-type", "fld", "fld 1", "fld 2", "keybox", "cp", "levels", "lv", "sum", "sum div", "info-strip"].includes(name)) {
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
  return { hub: pick("hub"), m: pick("payment") };
})()`;

const fixer = ({ hub, m }) => (sel) =>
  sel
    .replace(/\{\{hub:(\w+)\}\}/g, (_, n) => `.hub-module__${hub}__${n}`)
    .replace(/\{\{(\w+)\}\}/g, (_, n) => `.payment-module__${m}__${n}`);

/* 다섯째 칸(narrow)은 390px에서만 더 빼는 속성 */
const run = (list, side, w, fix = (v) => v) =>
  probe().replace("LIST", JSON.stringify(list.map(([n, s, i, x, k, narrow]) => {
    const skip = [...(k || []), ...(w <= 390 ? narrow || [] : [])];
    return side === "spec" ? [n, s, x, skip] : [n, fix(i), x, skip];
  })));

const PANE_ID = { none: "py-none", ok: "py-ok", inq: "py-inq" };

/** 시안의 판 고르개. `stripViewerShell()`이 상태 바를 가리기 전에 누른다 */
const pickState = (st) => `(() => {
  document.querySelector('#scr-payment .sb[data-pane="${PANE_ID[st]}"]').click();
  return document.querySelector("#scr-payment .pane.on")?.dataset.id ?? "없음";
})()`;

const stateOf = `(document.querySelector('[data-probe="payment"]')?.dataset.state ?? "없음")`;

const hideScrollbars = (p) =>
  p.send("Emulation.setScrollbarsHidden", { hidden: true });

const state = (...args) =>
  execFileSync("node", [
    "--env-file=.env.development.local", "--import", "tsx",
    "scripts/design-diff/payment-state.mts", ...args,
  ], { cwd: REPO, encoding: "utf8" });

const STATES = process.env.STATE ? [process.env.STATE] : ["none", "ok", "inq"];
for (const st of STATES) {
  if (!LIST[st]) throw new Error(`STATE는 none·ok·inq 중 하나: ${st}`);
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
        await p.goto(SPEC_URL + "#payment");
        const picked = await p.eval(pickState(st));
        if (picked !== PANE_ID[st]) throw new Error(`시안 판 전환 실패: ${picked}`);
        await p.stripViewerShell();
        await p.eval(`(() => {
          document.getElementById("scr-payment").getAnimations({ subtree: true })
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
        await p.send("Network.clearBrowserCookies");
        await p.send("Network.setCookie", {
          name: "authjs.session-token", value: token,
          domain: new URL(IMPL_URL).hostname, path: "/",
        });
        await p.goto(IMPL_URL + "/dashboard/payment");
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
      total += diffTable(`${st} ${w}px — 결제 연동`, spec.out, impl.out);
      total += diffTable(`${st} ${w}px — hover`, spec.hover, impl.hover);
      for (const [n] of texts) {
        total += diffText(spec.text[n], impl.text[n], { label: n, ignore: IGNORE[st] });
      }
    }
  }
} finally {
  console.log(state("restore").trim());
}

console.log(`\n═══════════════════════════\n합계 불일치 ${total}건`);
console.log(`스크린샷: ${OUT}`);
