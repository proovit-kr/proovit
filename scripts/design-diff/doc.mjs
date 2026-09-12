/*
  법령 문서 화면 — 시안 `#scr-privacy`와 `/privacy`를 대조한다.
  같은 껍데기를 `/terms`와 `/rules`도 쓴다(시안이 셋에 같은 `.ru`를 건다).

  ⚠️ **시안 마크업의 클래스를 먼저 전부 뽑아 넣었다.**

    awk 'NR>=1854 && NR<=1935' 시안.html | grep -oE 'class="[^"]*"' | sort -u

  로 나온 것 중 뷰어 크롬(screen)과 공개 크롬(pub-head·pub-foot, §3에서 본다)을
  뺀 전부가 아래에 있다.

  ⚠️ **시안은 조를 줄여서 그린다.** 4조를 건너뛰고 8~10과 12~18을 묶는다 —
  시안 스스로 「18개 조 구조를 보여 주고 본문은 정본에서 가져온다」고 적어 둔
  대로다. 그래서 **조의 개수와 목차 항목 수는 대조하지 않는다.** 시안이 주는
  것은 레이아웃이고, 조 목록은 content/privacy.ts가 정본이다.

    node scripts/design-diff/doc.mjs
*/
import {
  withPage, diffTable, diffText, textNodes,
  SPEC_URL, IMPL_URL, WIDTHS, shotDir,
} from "./cdp.mjs";

const OUT = shotDir("doc");

const CSS = [
  "font-size", "font-weight", "line-height", "letter-spacing",
  "color", "background-color", "background-image",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "border-radius", "box-shadow", "gap", "display", "flex-direction",
  "flex-wrap", "align-items", "justify-content", "text-align",
  "width", "max-width", "font-family", "position", "grid-template-columns",
  "white-space", "vertical-align", "scroll-margin-top", "overflow-x",
  "border-top-width", "border-top-color", "border-left-width", "border-left-color",
];

const S = "#scr-privacy ";

/* [이름, 시안 셀렉터, 구현본 셀렉터, 뺄 속성] */
const PAIRS = [
  ["ru-wrap", S + ".ru-wrap", '[class*="DocPage-module"][class*="__wrap"]'],
  ["ru-toc", S + ".ru-toc", '[class*="__toc"]'],
  /* 목차 글자가 달라 폭이 다르다 — 시안은 「1. 처리 목적」, 우리는 정본 제목 전문 */
  ["toc a", S + ".ru-toc a", '[class*="__toc"] a', ["width"]],
  ["h1", S + ".ru h1", '[class*="__doc"] h1', ["width"]],
  ["ru-ver", S + ".ru-ver", '[class*="__ver"]', ["width"]],
  ["chip", S + ".ru-ver .chip", '[class*="__ver"] [class*="__chip"]', ["width"]],
  /*
    ⚠️ **배지는 대조하지 않는다** — 구현본에서 일부러 뺐다(2026-09-07 수연 지시).
    시안 1871줄의 `계약과 다르면 정보주체에게 유리한 쪽 적용`이다. 남겨 두면
    시안에만 있는 요소라 속성 하나하나가 전부 불일치로 찍혀 폭마다 38건씩,
    합계 114건이 쌓인다. 진짜 누락이 그 안에 묻힌다.
  */
  ["doc-note", S + ".doc-note", '[class*="__note"]', ["width", "height"]],
  ["h3", S + ".ru h3", '[class*="__doc"] h3', ["width"]],
  ["h3 .n", S + ".ru h3 .n", '[class*="__doc"] h3 [class*="__n"]', ["width"]],
  /* ⚠️ `.doc-note`도 `<p>`다. 빼지 않으면 본문 대신 안내 상자를 잰다 */
  ["p", S + ".ru p:not(.doc-note)", '[class*="__doc"] section p', ["width"]],
  ["table", S + ".ru table", '[class*="__doc"] table', ["width"]],
  ["th", S + ".ru th", '[class*="__doc"] th', ["width"]],
  ["td", S + ".ru td", '[class*="__doc"] td', ["width"]],
];

/* hover로만 갈리는 것 */
const HOVER = [["toc a", S + ".ru-toc a", '[class*="__toc"] a']];
const HOVER_CSS = ["color", "border-left-color", "background-color"];

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
      out[name + " " + p] = cs.getPropertyValue(p);
    }
    /* 표는 넘칠 때 가로로 굴리는가. 값이 아니라 뜻을 본다 */
    if (name === "table") {
      out[name + " ▸가로 넘침"] =
        String(el.scrollWidth > el.clientWidth + 1);
    }
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
  글자 대조. **본문은 대조하지 않는다.**

  ⚠️ 시안은 조를 줄여서 그리고(4조를 건너뛰고 8~10·12~18을 묶는다) 본문은
  「노션 정본에서 그대로 가져와요」라고 스스로 적어 두었다. 즉 이 화면에서
  시안이 정하는 것은 레이아웃이고 글자의 정본은 `content/privacy.ts`다.
  본문을 견주면 시안이 안 그린 만큼 전부 빨간 줄이 된다.

  대신 **시안이 직접 적은 것**만 본다 — 제목과 버전 칩과 배지다.
  이 셋은 시안이 값을 박아 두었고 우리가 그대로 옮겨야 하는 자리다.
*/
/*
  ⚠️ 시안에만 남은 두 글자. 구현본에서 일부러 뺐다(2026-09-07 수연 지시).

  v3.1은 노션 정본 문서의 판번호다. 게시본 제18조가 「2026. 08. 31. 최초 제정」
  이라 대외 화면에 붙으면 개정이 두 번 있었던 것처럼 읽힌다. 배지는 위 PAIRS의
  설명과 같은 이유로 뺐다. 시안이 갱신되면 이 목록을 지운다.
*/
const TEXT_IGNORE = [/^v3\.1$/, /^계약과 다르면 정보주체에게 유리한 쪽 적용$/];

const TEXT_PAIRS = [
  ["제목", S + ".ru h1", '[class*="__doc"] h1'],
  ["버전 칩", S + ".ru-ver", '[class*="__ver"]', TEXT_IGNORE],
];

let total = 0;
for (const w of WIDTHS) {
  const spec = await withPage(async (p) => {
    await p.goto(SPEC_URL + "#privacy");
    await p.stripViewerShell();
    await p.resize(w);
    const r = await p.eval(probe(PAIRS.map(([n, s, , k]) => [n, s, k])));
    await p.shot(`${OUT}/spec-${w}.png`);
    Object.assign(r.out, await hoverValues(p, "spec"));
    r.text = {};
    for (const [n, sel] of TEXT_PAIRS) r.text[n] = await p.eval(textNodes(sel));
    return r;
  });
  const impl = await withPage(async (p) => {
    await p.goto(IMPL_URL + "/privacy");
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
  total += diffTable(`${w}px — 문서 화면`, spec.out, impl.out);
  for (const [n, , , ignore] of TEXT_PAIRS) {
    total += diffText(spec.text[n], impl.text[n], { label: n, ignore });
  }
}
console.log(`\n═══════════════════════════\n세 폭 합계 불일치 ${total}건`);
console.log(`스크린샷: ${OUT}`);
