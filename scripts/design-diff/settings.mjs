/*
  계정 설정 — 시안 `#scr-settings`(단일 상태)와 탈퇴 확인 모달 `#mdl-quit`을
  `/settings`와 대조한다.

    cdp-chrome node scripts/design-diff/settings.mjs

  대조 전용 계정(settings-session.mts, 카카오 가입·메일 켜짐·알림톡 꺼짐)으로 연다.
  이메일은 데이터라 글자 대조에서 뺀다.

  헤더(`.db-top`)와 사이드바(`.db-side`)는 크롬이라 `header-states.mjs`가 본다.
  네 축 — 값·상태(hover)·글자·구조. 모달은 「탈퇴하기」를 눌러 연 뒤 잰다.
*/
import { execFileSync } from "node:child_process";

import {
  withPage, diffTable, diffText, textNodes,
  SPEC_URL, IMPL_URL, WIDTHS, shotDir, REPO,
} from "./cdp.mjs";

const OUT = shotDir("settings");

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

const B = "#scr-settings .db-body ";
const ROOT = '[data-probe="settings"] ';
const H = (n) => `{{hub:${n}}}`;

/* 칸 k번째 — 시안·구현 모두 h2 · p · 칸 · 칸 · 버튼 줄 순서의 div다 */
const fld = (k) => [`${B}> div:nth-of-type(${k})`, `${ROOT}> div:nth-of-type(${k})`];

const sw = (name, k) => {
  const [s, i] = fld(1).map((x) => `${x} > div:nth-of-type(${k})`);
  return [
    [name, s, i],
    [`${name} txt`, `${s} > span:first-child`, `${i} > span:first-child`],
    [`${name} b`, `${s} b`, `${i} b`, [], ["width"]],
    [`${name} small`, `${s} small`, `${i} small`, [], ["width"]],
    [`${name} sw`, `${s} > span:last-child`, `${i} > span:last-child`],
    [`${name} i`, `${s} > span:last-child i`, `${i} > span:last-child i`],
  ];
};

const [f1s, f1i] = fld(1);
const [f2s, f2i] = fld(2);
const [rs, ri] = fld(3);

const PAGE = [
  /* 시안은 본문 상자(.db-body) 자체, 우리는 그 안의 칸이다 — 상자 속성은 빼고 글자·간격만 */
  ["root", B.trim(), ROOT.trim(), [], ["padding-top", "padding-right", "padding-bottom",
    "padding-left", "width", "height", "flex-grow", "flex-basis", "min-height"]],
  ["h1", B + ".hb-h1", `${ROOT}> ${H("h1")}`, [], ["width"]],
  ["sub", B + ".hb-sub", `${ROOT}> ${H("sub")}`],
  ["fld1", f1s, f1i],
  ["fld1 label", `${f1s} > label`, `${f1i} > label`],
  ...sw("메일", 1),
  ...sw("알림톡", 2),
  ["fld2", f2s, f2i, [], [], ["height"]],
  ["fld2 label", `${f2s} > label`, `${f2i} > label`],
  /*
    이메일이 데이터라 글자 폭이 다르다 — 상자는 칸을 채우므로 폭은 같아야 한다.
    공용 keybox는 wrap이라 긴 이메일이면 배지가 다음 줄로 내려간다(시안은 nowrap으로
    넘친다, 내가 정함). 대조 계정의 이메일이 길어 390에서는 두 줄이 된다.
  */
  ["keybox", `${f2s} .keybox`, `${f2i} ${H("keybox")}`, [], ["flex-wrap"], ["height"]],
  ["badge", `${f2s} .badge`, `${f2i} [class*="Badge-module"]`, [], ["width"]],
  ["row", rs, ri],
  ["logout", `${rs} > button:first-child`, `${ri} button[type="submit"]`, [], ["width"]],
  /* `margin-left: auto`의 계산값은 형제 폭에 딸린다 — 플레이북 */
  ["quit", `${rs} > button:last-child`, `${ri} > button:last-child`, [], ["width", "margin-left"]],
];

const MS = "#mdl-quit.on .mdl";
const MI = '[role="dialog"]';
const MODAL = [
  /*
    본문은 절 단위로 끊는다(`Clauses` — 절마다 span). 390에서는 그래서 한 줄 길다
    (「종료될 수 / 있어요」로 끊기지 않게).
  */
  ["mdl", MS, MI, [], [], ["height"]],
  ["mdl h3", `${MS} h3`, `${MI} > h3`, [], ["width"]],
  ["mdl p", `${MS} p`, `${MI} > p`, [], ["children"], ["height"]],
  ["mdl ft", `${MS} .mdl-ft`, `${MI} > div:last-child`],
  ["mdl cancel", `${MS} .mdl-ft > button:first-child`, `${MI} > div:last-child > button:first-child`, [], ["width"]],
  ["mdl ok", `${MS} .mdl-ft > button:last-child`, `${MI} > div:last-child > button:last-child`, [], ["width"]],
];

const HOVER_CSS = ["color", "background-color", "background-image", "box-shadow",
  "border-top-color", "filter"];
const HOVER = [
  ["logout hover", `${rs} > button:first-child`, `${ri} button[type="submit"]`],
  ["quit hover", `${rs} > button:last-child`, `${ri} > button:last-child`],
];
const MODAL_HOVER = [
  ["mdl ok hover", `${MS} .mdl-ft > button:last-child`, `${MI} > div:last-child > button:last-child`],
];

/* 데이터 — 로그인한 사람의 이메일 */
const IGNORE = [/@/];

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
    if (!(skip || []).includes("children")) out[name + " ▸자식 수"] = String(
      [...el.children].filter((c) => getComputedStyle(c).display !== "none").length,
    );
    if (/ i$/.test(name)) {
      const a = getComputedStyle(el, "::after");
      for (const p of ["left", "top", "width", "height", "background-color", "border-radius"]) {
        out[name + "::after " + p] = a.getPropertyValue(p);
      }
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
  const e = document.querySelector('[class*="hub-module__"]');
  return { hub: e ? (e.className.match(/hub-module__([A-Za-z0-9_-]+?)__/) || [])[1] : null };
})()`;

const fixer = ({ hub }) => (sel) =>
  sel.replace(/\{\{hub:(\w+)\}\}/g, (_, n) => `.hub-module__${hub}__${n}`);

/* 다섯째 칸(narrow)은 390px에서만 더 빼는 속성 */
const run = (list, side, w, fix = (v) => v) =>
  probe().replace("LIST", JSON.stringify(list.map(([n, s, i, x, k, narrow]) => {
    const skip = [...(k || []), ...(w <= 390 ? narrow || [] : [])];
    return side === "spec" ? [n, s, x, skip] : [n, fix(i), x, skip];
  })));

const hideScrollbars = (p) =>
  p.send("Emulation.setScrollbarsHidden", { hidden: true });
const reduceMotion = (p) =>
  p.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });

/* 시안·구현 한쪽을 잰다. 페이지 → hover → 캡처 → 모달 열고 → 모달 → 캡처 */
async function measure(p, side, w, fix) {
  const pick = (row) => (side === "spec" ? row[1] : fix(row[2]));
  await p.resize(w, 520);
  const r = await p.eval(run(PAGE, side, w, fix));
  r.text = await p.eval(textNodes(side === "spec" ? B.trim() : ROOT.trim()));
  r.hover = {};
  for (const h of HOVER) {
    await p.hover(pick(h));
    Object.assign(r.hover, await p.eval(hoverProbe(h[0], pick(h))));
  }
  await p.hover();
  await p.resize(w, 900);
  await p.shot(`${OUT}/${side}-${w}.png`);

  await p.resize(w, 520);
  await p.eval(`(() => { document.querySelector(${JSON.stringify(pick(PAGE.at(-1)))}).click(); return 1; })()`);
  await new Promise((ok) => setTimeout(ok, 200));
  const m = await p.eval(run(MODAL, side, w, fix));
  Object.assign(r.out, m.out);
  r.missing.push(...m.missing);
  r.modalText = await p.eval(textNodes(side === "spec" ? MS : MI));
  for (const h of MODAL_HOVER) {
    await p.hover(pick(h));
    Object.assign(r.hover, await p.eval(hoverProbe(h[0], pick(h))));
  }
  await p.hover();
  await p.resize(w, 900);
  await p.shot(`${OUT}/${side}-quit-${w}.png`);
  return r;
}

const token = execFileSync("node", [
  "--env-file=.env.development.local", "--import", "tsx",
  "scripts/design-diff/settings-session.mts",
], { cwd: REPO, encoding: "utf8" }).trim().split("\n").pop();

let total = 0;
for (const w of WIDTHS) {
  const spec = await withPage(async (p) => {
    await hideScrollbars(p);
    await reduceMotion(p);
    await p.goto(SPEC_URL + "#settings");
    await p.stripViewerShell();
    await p.eval(`(() => {
      document.getElementById("scr-settings").getAnimations({ subtree: true })
        .forEach(a => { if (a.effect?.getTiming().iterations !== Infinity) a.finish(); });
      return 1;
    })()`);
    return measure(p, "spec", w);
  });

  const impl = await withPage(async (p) => {
    await hideScrollbars(p);
    await reduceMotion(p);
    await p.send("Network.clearBrowserCookies");
    await p.send("Network.setCookie", {
      name: "authjs.session-token", value: token,
      domain: new URL(IMPL_URL).hostname, path: "/",
    });
    await p.goto(IMPL_URL + "/settings");
    const fix = fixer(await p.eval(hashOf));
    return measure(p, "impl", w, fix);
  });

  console.log(`\n\n████ 폭 ${w}`);
  for (const m of spec.missing) console.log(`  ⚠️ 시안에서 못 찾음: ${m}`);
  for (const m of impl.missing) console.log(`  ⚠️ 구현본에서 못 찾음: ${m}`);
  total += spec.missing.length + impl.missing.length;
  total += diffTable(`${w}px — 계정 설정`, spec.out, impl.out);
  total += diffTable(`${w}px — hover`, spec.hover, impl.hover);
  total += diffText(spec.text, impl.text, { label: "화면", ignore: IGNORE });
  total += diffText(spec.modalText, impl.modalText, { label: "모달", ignore: IGNORE });
}

console.log(`\n═══════════════════════════\n합계 불일치 ${total}건`);
console.log(`스크린샷: ${OUT}`);
