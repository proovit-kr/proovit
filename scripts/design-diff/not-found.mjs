/*
  404 화면 — 시안 `design/proovit_404.html`의 두 상태를 대조한다.

    ① proovit.kr 경로 없음      → 없는 주소 아무거나
    ② 참가팀 주소 미연결         → /team-not-found

  ⚠️ 시안이 `design/proovit_디자인시안_ver4.html`이 아니다. 404는 윤서가
  따로 준 단일 파일이라 cdp.mjs의 정본 고르기(`ver(\d+)`)에 안 걸린다.
  여기서 직접 가리킨다.

  ①의 헤더·푸터는 보지 않는다 — 공개 크롬은 `public-chrome.mjs`가 맡고, 이
  화면의 것은 같은 컴포넌트다. ②의 경량 크롬은 이 화면에만 있으므로 여기서
  본다. 본문(`.nf*`)과 글자와 hover는 둘 다 본다.

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

const OUT = shotDir("not-found");

const CSS = [
  "font-size", "font-weight", "line-height", "letter-spacing",
  "color", "background-color", "background-image", "font-family",
  "backdrop-filter", "position", "z-index",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "border-radius", "border-top-width", "border-top-style", "border-top-color",
  "border-bottom-width", "border-bottom-style", "border-bottom-color",
  "box-shadow", "gap", "display", "flex", "flex-wrap", "grid-template-columns",
  "align-items", "justify-self", "order", "width", "max-width", "min-width",
  "height", "text-wrap-style",
];

/*
  본문 — 두 상태가 같은 틀을 쓴다. [이름, 시안 셀렉터, 구현본 셀렉터, 뺄 속성]

  ⚠️ 플레이트의 box-shadow는 **의도한 차이**다. 404 시안이 박아 둔 값은
  ver4 `.card`의 덮인 옛 값(v1.1)이고, 제품의 카드는 ver4의 마지막 승자
  (v1.7 COMFORT)를 쓴다 — Surface의 `Card`가 그린다. 사유는
  NotFound.module.css 머리에 있다. 그 속성만 빼고 나머지 표면은 대조한다.

  `height`·`width`는 글자에 딸린 값이라 본문에서는 뺀다. 고정 높이인
  헤더에서만 본다.
*/
const S = ".nf ";
const TXT = ["width", "height"];
const bodyPairs = (v) => [
  ["nf", ".nf", '[class*="NotFound-module"][class*="__nf"]', ["height"]],
  ["nf-in", S + ".nf-in", '[class*="__in"]', ["height"]],
  ["h1", S + `.nf-copy .only-${v} h1`, '[class*="__copy"] h1', TXT],
  ["p", S + `.nf-copy .only-${v} p`, '[class*="__copy"] p', TXT],
  ["go", S + `.nf-copy .only-${v} .go`, '[class*="__go"]', TXT],
  ["plate", S + ".nf-plate", '[class*="__plate"]', ["box-shadow", "height", "width"]],
  ["cap", S + ".nf-plate .cap", '[class*="__cap"]', TXT],
  ["num", S + ".nf-plate .num", '[class*="__num"]', TXT],
];

/*
  ②의 경량 크롬. 시안 `.pub-head.lite` / `.pub-foot.lite`.
  헤더 box-shadow는 iOS 사파리 덮개(NavBar.module.css)라 공개 크롬과 같은
  이유로 뺀다. 푸터 높이는 줄바꿈에 딸린 값이라 뺀다.
*/
const LITE = [
  ["head", ".pub-head.lite", '[class*="team-not-found-module"][class*="__head"]', ["box-shadow"]],
  ["head wm", ".pub-head.lite .wm", '[class*="__head"] > a:first-child', TXT],
  ["head wm em", ".pub-head.lite .wm em", '[class*="__head"] > a:first-child em', TXT],
  ["head rgt", ".pub-head.lite .rgt", '[class*="__rgt"]', TXT],
  ["head rgt a", ".pub-head.lite .rgt a", '[class*="__rgt"] a', TXT],
  ["foot", ".pub-foot.lite", '[class*="__foot"]', ["height"]],
  ["foot wm", ".pub-foot.lite .wm", '[class*="__foot"] > span:first-child', TXT],
  ["foot span", ".pub-foot.lite > span:not(.wm)", '[class*="__foot"] > span:nth-child(2)', TXT],
  ["foot a", ".pub-foot.lite a", '[class*="__foot"] a', TXT],
];

const VARIANTS = [
  {
    name: "① 경로 없음", spec: "?v=app&season=pre", impl: "/this-route-does-not-exist",
    pairs: bodyPairs("app"),
    hover: [["go", S + ".nf-copy .only-app .go", '[class*="__go"]']],
    text: [
      ["본문", S + ".nf-copy .only-app", '[class*="__copy"]'],
      ["플레이트", S + ".nf-plate", '[class*="__plate"]'],
    ],
  },
  {
    name: "② 참가팀 주소 미연결", spec: "?v=team", impl: "/team-not-found",
    pairs: [...bodyPairs("team"),
      ["p a", S + ".nf-copy .only-team p a", '[class*="__copy"] p a', TXT],
      ...LITE],
    hover: [
      ["go", S + ".nf-copy .only-team .go", '[class*="__go"]'],
      ["p a", S + ".nf-copy .only-team p a", '[class*="__copy"] p a'],
      ["head rgt a", ".pub-head.lite .rgt a", '[class*="__rgt"] a'],
      ["foot a", ".pub-foot.lite a", '[class*="__foot"] a'],
    ],
    text: [
      ["헤더", ".pub-head.lite", '[class*="__head"]'],
      ["본문", S + ".nf-copy .only-team", '[class*="__copy"]'],
      ["플레이트", S + ".nf-plate", '[class*="__plate"]'],
      ["푸터", ".pub-foot.lite", '[class*="__foot"]'],
    ],
  },
];

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
  /* 헤더 오른쪽 링크가 끝에 붙었나. margin-left:auto의 계산값 대신 뜻을 본다 */
  const head = LIST.find(([n]) => n === "head");
  if (head) {
    const h = document.querySelector(head[1]);
    const last = h.lastElementChild.getBoundingClientRect(), hr = h.getBoundingClientRect();
    const pr = parseFloat(getComputedStyle(h).paddingRight);
    out["head ▸우측 끝"] = String(Math.abs(hr.right - pr - last.right) < 1);
  }
  return { out, missing };
})()`;

async function hoverValues(p, list, side) {
  const out = {};
  for (const [name, specSel, implSel] of list) {
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

let total = 0;
for (const v of VARIANTS) {
  console.log(`\n\n▌${v.name}`);
  for (const w of WIDTHS) {
    const spec = await withPage(async (p) => {
      await p.goto(SPEC_URL + v.spec);
      /* 시안 뷰어의 상태 바. 사이드바는 없지만 이 바는 있다 */
      await p.eval(`document.querySelector(".state-bar")?.remove(); 1`);
      await p.resize(w);
      const r = await p.eval(probe(v.pairs.map(([n, s, , k]) => [n, s, k])));
      await p.shot(`${OUT}/spec-${v.impl.slice(1)}-${w}.png`);
      Object.assign(r.out, await hoverValues(p, v.hover, "spec"));
      r.text = {};
      for (const [n, sel] of v.text) r.text[n] = await p.eval(textNodes(sel));
      return r;
    });
    const impl = await withPage(async (p) => {
      await p.goto(IMPL_URL + v.impl);
      await p.resize(w);
      const r = await p.eval(probe(v.pairs.map(([n, , i, k]) => [n, i, k])));
      await p.shot(`${OUT}/impl-${v.impl.slice(1)}-${w}.png`);
      Object.assign(r.out, await hoverValues(p, v.hover, "impl"));
      r.text = {};
      for (const [n, , sel] of v.text) r.text[n] = await p.eval(textNodes(sel));
      return r;
    });

    console.log(`\n████ 폭 ${w}`);
    for (const m of spec.missing) console.log(`  ⚠️ 시안에서 못 찾음: ${m}`);
    for (const m of impl.missing) console.log(`  ⚠️ 구현본에서 못 찾음: ${m}`);
    total += spec.missing.length + impl.missing.length;
    total += diffTable(`${w}px — ${v.name}`, spec.out, impl.out);
    for (const [n] of v.text) {
      total += diffText(spec.text[n], impl.text[n], { label: n });
    }
  }
}
console.log(`\n═══════════════════════════\n두 상태 × 세 폭 합계 불일치 ${total}건`);
console.log(`스크린샷: ${OUT}`);
