/*
  법령 문서 화면 — 시안의 `.ru` 화면과 우리 문서 화면을 대조한다.
  셋이 같은 껍데기(`DocPage`)를 쓰고 시안도 셋에 같은 `.ru`를 건다.

    node scripts/design-diff/doc.mjs            # /privacy (기본)
    DOC=rules node scripts/design-diff/doc.mjs  # /rules
    DOC=terms node scripts/design-diff/doc.mjs  # /terms

  ⚠️ **시안 마크업의 클래스를 먼저 전부 뽑아 넣었다.**

    awk 'NR>=1854 && NR<=1935' 시안.html | grep -oE 'class="[^"]*"' | sort -u

  로 나온 것 중 뷰어 크롬(screen)과 공개 크롬(pub-head·pub-foot, §3에서 본다)을
  뺀 전부가 아래에 있다.

  ⚠️ **시안은 조를 줄여서 그린다.** 4조를 건너뛰고 8~10과 12~18을 묶는다 —
  시안 스스로 「18개 조 구조를 보여 주고 본문은 정본에서 가져온다」고 적어 둔
  대로다. 그래서 **조의 개수와 목차 항목 수는 대조하지 않는다.** 시안이 주는
  것은 레이아웃이고, 조 목록은 content/privacy.ts가 정본이다.
*/
import {
  withPage, diffTable, diffText, textNodes,
  SPEC_URL, IMPL_URL, WIDTHS, shotDir,
} from "./cdp.mjs";

/*
  대조할 문서. 시안 해시·시안 섹션 id·우리 경로와, **시안에만 남은 글자**다.
  마지막 것은 이식 누락이 아니라 수연이 뺀 것이라 글자 대조에서 제외한다.
*/
const DOCS = {
  privacy: {
    hash: "#privacy",
    scr: "#scr-privacy",
    path: "/privacy",
    tables: true,
    /*
      ⚠️ **이 화면은 시즌 페이즈에 따라 다른 문서를 그린다**(수연 2026-09-21
      결정, `content/privacy.ts` 머리 주석). 사전 신청 구간에는 전문 18조이고,
      모집부터 시안의 요약 게시본이다. 그러니 **개발 바가 사전신청일 때 도는
      대조는 시안과 다른 문서를 맞대고 있다** — 글자가 어긋나는 것이 정상이다.
      글자까지 보려면 **개발 바의 페이즈를 모집 이상으로 두고 돌린다.**

      아래 두 글자는 **어느 구간에서도** 시안에만 남는다. 칩은 2026-09-07,
      배지는 09-21 수연 지시로 뺐다 — 약관·규칙 화면과 같다. v3.1은 노션 정본
      문서의 판번호라, 게시본 제18조가 시행일을 「최초 제정」과 같은 날로 말하는
      대외 화면에 붙으면 개정이 여러 번 있었던 것처럼 읽힌다.
    */
    textIgnore: [/^v3\.1$/, /^계약과 다르면 정보주체에게 유리한 쪽 적용$/],
  },
  rules: {
    hash: "#rules",
    scr: "#scr-rules",
    path: "/rules",
    lists: true,
    /*
      ⚠️ **규칙은 본문까지 대조한다.** 방침·약관은 시안이 「구조만 표시」라고
      밝혀 본문의 정본이 `content/`이지만, 규칙 화면은 시안이 스스로
      「요약 게시본」이라 적고 문안을 다 들고 있다 — 여기서는 시안이 정본이다.
    */
    bodyText: true,
    textIgnore: [],
  },
  terms: {
    hash: "#terms",
    scr: "#scr-terms",
    path: "/terms",
    /*
      ⚠️ **표는 여기서도 잰다.** 방침 화면과 달리 시안이 약관에도 표를 그린다 —
      부칙의 운영자 정보다. 머리행이 없고 `<th>`가 행마다 앞에 서는 표라
      방침의 표와 마크업이 달라서, 같은 껍데기라도 한 번 더 본다.
    */
    tables: true,
    /*
      ⚠️ **약관도 본문까지 대조한다**(2026-09-21 수연 결정). 시안 안에서 메모
      둘이 어긋나는 화면이다 — 섹션 머리는 「요약 게시본」, 본문 위 메모는
      「구조만 표시」. 앞엣것이 맞고, 규칙과 같이 시안이 문안의 정본이다.
    */
    bodyText: true,
    textIgnore: [],
  },
};

const DOC = DOCS[process.env.DOC ?? "privacy"];
if (!DOC) {
  console.error(`DOC은 ${Object.keys(DOCS).join("·")} 중 하나다`);
  process.exit(1);
}

const OUT = shotDir(`doc-${process.env.DOC ?? "privacy"}`);

const CSS = [
  "font-size", "font-weight", "line-height", "letter-spacing",
  "color", "background-color", "background-image",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "border-radius", "box-shadow", "gap", "display", "flex-direction",
  "flex-wrap", "align-items", "justify-content", "text-align",
  "width", "max-width", "font-family", "position", "grid-template-columns",
  "white-space", "vertical-align", "scroll-margin-top", "overflow-x",
  /* preflight가 지우는 자리다. 안 재면 번호가 사라진 줄 모른다 */
  "list-style-type", "list-style-position",
  "border-top-width", "border-top-color", "border-left-width", "border-left-color",
];

const S = DOC.scr + " ";

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
    ⚠️ **배지는 대조하지 않는다.** 시안 1871줄의 `계약과 다르면 정보주체에게
    유리한 쪽 적용`이다. 남겨 두면 시안에만 있는 요소라 속성 하나하나가 전부
    불일치로 찍혀 폭마다 38건씩, 합계 114건이 쌓인다. 진짜 누락이 그 안에 묻힌다.

    방침 화면의 배지도 뺐다(2026-09-21 수연 지시) — 이로써 세 화면이 같다.

    ⚠️ **안내 상자(`.doc-note`)의 짝은 지웠다.** ver4가 세 화면 모두에서 마크업을
    빼서 CSS 규칙(`.ru .doc-note`)만 남았다 — 양쪽 다 못 찾는 짝이라 폭마다
    2건씩 쌓이기만 했다. 우리 쪽 `.note`도 같이 지웠다(`dead-css.mjs`가 잡았다).
    시안이 상자를 되살리면 여기에 짝을 다시 넣는다.
  */
  ["h3", S + ".ru h3", '[class*="__doc"] h3', ["width"]],
  ["h3 .n", S + ".ru h3 .n", '[class*="__doc"] h3 [class*="__n"]', ["width"]],
  /* ⚠️ `.doc-note`도 `<p>`다. 빼지 않으면 본문 대신 안내 상자를 잰다 */
  ["p", S + ".ru p:not(.doc-note)", '[class*="__doc"] section p', ["width"]],
];

/*
  ⚠️ **시안이 번호 목록을 규칙 화면에서만 그린다**(실격 기준 아홉 줄). 짝이
  없는 쪽에서 재면 「시안에서 못 찾음」이 폭마다 쌓이기만 한다 — 같은
  껍데기이므로 그리는 화면에서 한 번 재면 된다.

  표는 방침과 약관 두 화면이 그린다. 규칙 화면은 조를 여섯 꼭지로 줄여
  그리느라 별표의 표가 들어갈 자리가 없다 — 우리 규칙 화면에는 있으므로
  (`content/rules.ts`가 정본) 값은 같은 껍데기에서 방침으로 잰다.
*/
const LIST_PAIRS = [
  ["ol", S + ".ru ol", '[class*="__doc"] ol', ["width"]],
  ["ol li", S + ".ru ol li", '[class*="__doc"] ol li', ["width"]],
];
if (DOC.lists) PAIRS.push(...LIST_PAIRS);

const TABLE_PAIRS = [
  ["table", S + ".ru table", '[class*="__doc"] table', ["width"]],
  ["th", S + ".ru th", '[class*="__doc"] th', ["width"]],
  ["td", S + ".ru td", '[class*="__doc"] td', ["width"]],
];
if (DOC.tables) PAIRS.push(...TABLE_PAIRS);

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
const TEXT_PAIRS = [
  ["제목", S + ".ru h1", '[class*="__doc"] h1'],
  ["버전 칩", S + ".ru-ver", '[class*="__ver"]', DOC.textIgnore],
];
/* 목차 옆 본문 칸. 시안도 우리도 `<nav>` 다음의 `<div>` 하나다 */
if (DOC.bodyText) {
  TEXT_PAIRS.push(["본문", S + ".ru-wrap > div", '[class*="__wrap"] > div']);
}

let total = 0;
for (const w of WIDTHS) {
  const spec = await withPage(async (p) => {
    await p.goto(SPEC_URL + DOC.hash);
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
    await p.goto(IMPL_URL + DOC.path);
    await p.resize(w);
    const r = await p.eval(probe(PAIRS.map(([n, , i, k]) => [n, i, k])));
    await p.shot(`${OUT}/impl-${w}.png`);
    Object.assign(r.out, await hoverValues(p, "impl"));
    r.text = {};
    for (const [n, , sel] of TEXT_PAIRS) r.text[n] = await p.eval(textNodes(sel));
    return r;
  });

  console.log(`\n\n████ ${DOC.path} 폭 ${w}`);
  for (const m of spec.missing) console.log(`  ⚠️ 시안에서 못 찾음: ${m}`);
  for (const m of impl.missing) console.log(`  ⚠️ 구현본에서 못 찾음: ${m}`);
  total += spec.missing.length + impl.missing.length;
  total += diffTable(`${w}px — ${DOC.path}`, spec.out, impl.out);
  for (const [n, , , ignore] of TEXT_PAIRS) {
    total += diffText(spec.text[n], impl.text[n], { label: n, ignore });
  }
}
console.log(`\n═══════════════════════════\n세 폭 합계 불일치 ${total}건`);
console.log(`스크린샷: ${OUT}`);
