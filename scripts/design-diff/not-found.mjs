/*
  404 화면 — 시안 `design/proovit_404.html`(①)과 없는 경로를 대조한다.

  ⚠️ 시안이 `design/proovit_디자인시안_ver4.html`이 아니다. 404는 윤서가
  따로 준 단일 파일이라 cdp.mjs의 정본 고르기(`ver(\d+)`)에 안 걸린다.
  여기서 직접 가리킨다.

  헤더·푸터는 보지 않는다 — 공개 크롬은 `public-chrome.mjs`가 맡고, 이 화면의
  것은 같은 컴포넌트다. 본문(`.nf*`)과 글자와 hover만 본다.

    node scripts/design-diff/not-found.mjs
*/
import { join, relative } from "node:path";

import {
  withPage, diffTable, diffText, textNodes,
  IMPL_URL, WIDTHS, REPO, shotDir,
} from "./cdp.mjs";

const SPEC_PATH = join(REPO, "design", "proovit_404.html");
const SPEC_URL = "file://" + encodeURI(SPEC_PATH);
console.log(`404 시안: ${relative(REPO, SPEC_PATH)}`);

/* 어느 라우트에도 안 맞는 주소. 앱이 만들 일이 없는 이름이면 된다 */
const NOWHERE = "/this-route-does-not-exist";

const OUT = shotDir("not-found");

const CSS = [
  "font-size", "font-weight", "line-height", "letter-spacing",
  "color", "background-color", "background-image", "font-family",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "border-radius", "border-top-width", "border-top-style", "border-top-color",
  "border-bottom-width", "border-bottom-style", "border-bottom-color",
  "box-shadow", "gap", "display", "flex", "grid-template-columns",
  "align-items", "justify-self", "order", "width", "max-width", "min-width",
  "text-wrap-style",
];

/*
  [이름, 시안 셀렉터, 구현본 셀렉터, 뺄 속성]

  ⚠️ 플레이트의 box-shadow는 **의도한 차이**다. 404 시안이 박아 둔 값은
  ver4 `.card`의 덮인 옛 값(v1.1)이고, 제품의 카드는 ver4의 마지막 승자
  (v1.7 COMFORT)를 쓴다 — Surface의 `Card`가 그린다. 사유는
  not-found.module.css 머리에 있다. 그 속성만 빼고 나머지 표면은 대조한다.

  `grid-template-columns`의 계산값은 트랙 폭이 px로 나와 콘텐츠 폭에 딸린다.
  `1fr 296px`이 양쪽에서 같은 폭으로 풀리는지는 그대로 견줄 수 있다 —
  컨테이너 폭(max-width 900)이 같기 때문이다.
*/
const S = ".nf ";
const PAIRS = [
  ["nf", ".nf", '[class*="not-found-module"][class*="__nf"]'],
  ["nf-in", S + ".nf-in", '[class*="__in"]'],
  ["h1", S + ".nf-copy .only-app h1", '[class*="__copy"] h1', ["width"]],
  ["p", S + ".nf-copy .only-app p", '[class*="__copy"] p', ["width"]],
  ["go", S + ".nf-copy .only-app .go", '[class*="__go"]', ["width"]],
  ["plate", S + ".nf-plate", '[class*="__plate"]', ["box-shadow"]],
  ["cap", S + ".nf-plate .cap", '[class*="__cap"]', ["width"]],
  ["num", S + ".nf-plate .num", '[class*="__num"]', ["width"]],
];

/* hover로만 갈리는 것 */
const HOVER = [["go", S + ".nf-copy .only-app .go", '[class*="__go"]']];
const HOVER_CSS = ["color", "border-bottom-color"];

const probe = (list) => `(() => {
  const CSS = ${JSON.stringify(CSS)};
  const LIST = ${JSON.stringify(list)};
  const out = {}, missing = [];
  for (const [name, sel, skip] of LIST) {
    const el = document.querySelector(sel);
    if (!el) { missing.push(name + "  <- " + sel); continue; }
    const cs = getComputedStyle(el);
    for (const p of CSS) {
      if ((skip || []).includes(p)) continue;
      /*
        폭이 0인 테두리의 style·color는 보지 않는다. Tailwind preflight가
        모든 요소에 border-style:solid를 깔아서 시안(none)과 늘 다르지만
        그려지지 않는 값이다.
      */
      const side = p.match(/^border-(top|bottom)-(style|color)$/);
      if (side && cs.getPropertyValue("border-" + side[1] + "-width") === "0px") continue;
      let v = cs.getPropertyValue(p);
      /*
        시안은 background 축약에 gradient와 var(--surface)를 함께 적어
        background-image가 「gradient, none」 두 층으로 나온다. 우리는
        Card가 색을 background-color로 따로 주어 한 층이다. 그려지는 것은
        같으므로 빈 층을 떼고 견준다.
      */
      if (p === "background-image") v = v.replace(/, none$/, "");
      out[name + " " + p] = v;
    }
  }
  /* 플레이트가 오른쪽 끝에 붙었나(넓은 폭), 위로 올라갔나(좁은 폭) — 값이 아니라 뜻 */
  const plate = document.querySelector(LIST.find(([n]) => n === "plate")[1]);
  const copy = document.querySelector(LIST.find(([n]) => n === "h1")[1]);
  if (plate && copy) {
    const a = plate.getBoundingClientRect(), b = copy.getBoundingClientRect();
    out["plate ▸제목보다 위"] = String(a.bottom <= b.top);
    out["plate ▸제목 오른쪽"] = String(a.left >= b.right);
  }
  return { out, missing };
})()`;

async function hoverValues(p, side) {
  const out = {};
  for (const [name, specSel, implSel] of HOVER) {
    const sel = side === "spec" ? specSel : implSel;
    await p.hover(sel);
    const v = await p.eval(`(() => {
      const cs = getComputedStyle(document.querySelector(${JSON.stringify(sel)}));
      const o = {};
      for (const k of ${JSON.stringify(HOVER_CSS)}) o[k] = cs.getPropertyValue(k);
      return o;
    })()`);
    for (const [k, val] of Object.entries(v)) out[`${name}:hover ${k}`] = val;
  }
  await p.hover();
  return out;
}

/*
  글자. 시안의 ① 본문 전체를 통째로 긁는다. 플레이트(NOT FOUND, 404)도
  같이 — aria-hidden이라도 보이는 글자다.
*/
const TEXT_PAIRS = [
  ["본문", S + ".nf-copy .only-app", '[class*="__copy"]'],
  ["플레이트", S + ".nf-plate", '[class*="__plate"]'],
];

let total = 0;
for (const w of WIDTHS) {
  const spec = await withPage(async (p) => {
    await p.goto(SPEC_URL + "?v=app&season=pre");
    /* 시안 뷰어의 상태 바. 사이드바는 없지만 이 바는 있다 */
    await p.eval(`document.querySelector(".state-bar")?.remove(); 1`);
    await p.resize(w);
    const r = await p.eval(probe(PAIRS.map(([n, s, , k]) => [n, s, k])));
    await p.shot(`${OUT}/spec-${w}.png`);
    Object.assign(r.out, await hoverValues(p, "spec"));
    r.text = {};
    for (const [n, sel] of TEXT_PAIRS) r.text[n] = await p.eval(textNodes(sel));
    return r;
  });
  const impl = await withPage(async (p) => {
    await p.goto(IMPL_URL + NOWHERE);
    await p.resize(w);
    const r = await p.eval(probe(PAIRS.map(([n, , i, k]) => [n, i, k])));
    await p.shot(`${OUT}/impl-${w}.png`);
    Object.assign(r.out, await hoverValues(p, "impl"));
    r.text = {};
    for (const [n, , sel] of TEXT_PAIRS) r.text[n] = await p.eval(textNodes(sel));
    return r;
  });

  console.log(`\n\n████ 폭 ${w}`);
  for (const m of spec.missing) console.log(`  ⚠️ 시안에서 못 찾음: ${m}`);
  for (const m of impl.missing) console.log(`  ⚠️ 구현본에서 못 찾음: ${m}`);
  total += spec.missing.length + impl.missing.length;
  total += diffTable(`${w}px — 404`, spec.out, impl.out);
  for (const [n] of TEXT_PAIRS) {
    total += diffText(spec.text[n], impl.text[n], { label: n });
  }
}
console.log(`\n═══════════════════════════\n세 폭 합계 불일치 ${total}건`);
console.log(`스크린샷: ${OUT}`);
