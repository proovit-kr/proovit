/*
  공개 크롬 — 시안 `.pub-head` / `.pub-foot`를 랜딩 화면에서 대조한다.

  §2와 달리 여기서는 **실제 화면에 붙은 상태로** 잰다. 크롬은 자기 값뿐 아니라
  자리(높이, sticky, 좌우 여백)가 곧 기능이라서다. 시안 뷰어는 화면을 로드하면
  랜딩에 `.on`을 붙이므로 그대로 보인다.

  ⚠️ 절대 좌표(top)는 비교하지 않는다. 시안은 위에 뷰어 크롬
  (#topbar 52px + .state-bar 41px)이 있어 항상 어긋난다. 높이·여백·sticky
  같은 자기 값과, 부모 기준 상대 위치만 본다.

    node scripts/design-diff/public-chrome.mjs
*/
import { withPage, diffTable, SPEC_URL, IMPL_URL, WIDTHS, shotDir } from "./cdp.mjs";

const OUT = shotDir("public-chrome");

/*
  ⚠️ 비교하지 않는 것 셋. 전부 시안이 뷰어 셸이라서 생기는 차이다.

  top       `.pub-head`의 `top:41px`은 뷰어 상태 바 높이다. 우리는 0.
  margin-*  `margin-left:auto`는 계산값이 px로 나오고, 그 값은 형제들의 폭에
            달렸다. 시안 메뉴는 3개(시즌 아카이브 포함)고 우리는 2개라 항상
            다르다. 「오른쪽 끝에 붙었나」는 아래 flushRight로 따로 본다.
  height    줄바꿈에 딸린 높이는 콘텐츠가 달라 비교하지 않는다(시안 메뉴는
            3개, 우리는 2개). 고정 높이인 `.pub-head`만 잰다(fixedHeight).

  폭 자체는 `stripViewerShell()`이 뷰어 사이드바를 걷어내 맞춰 준다.
*/
const CSS = [
  "font-size", "font-weight", "line-height", "letter-spacing",
  "color", "background-color", "backdrop-filter",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "gap", "display", "align-items", "flex-wrap",
  "position", "z-index",
  "border-bottom-width", "border-bottom-style", "border-bottom-color",
  "border-top-width", "border-top-style", "border-top-color",
];

/* [이름, 시안 셀렉터, 구현본 셀렉터] — 셀렉터가 가리키는 대상이 같아야 한다 */
/*
  시안 쪽은 **리더보드 화면**의 크롬을 본다. 랜딩의 워드마크에는 `.glitch`가
  붙어 있어(position:relative) 크롬이 아니라 랜딩의 연출이다 — 그건 §4에서 본다.
*/
const S = "#scr-leaderboard ";
const PAIRS = [
  ["pub-head", S + ".pub-head", "header", { fixedHeight: true }],
  ["wm", S + ".pub-head .wm", "header > a:first-child"],
  ["wm em", S + ".pub-head .wm em", "header > a:first-child em"],
  ["nav", S + ".pub-head nav", "header nav"],
  /* 시안·구현 모두 리더보드 화면이라 활성 항목은 둘 다 두 번째다 */
  ["nav a", S + ".pub-head nav a:first-child", "header nav a:first-child"],
  ["nav a(on)", S + ".pub-head nav a:nth-child(2)", "header nav a:nth-child(2)"],
  ["cta", S + ".pub-head .cta", "header > :last-child", { flushRight: true }],

  ["pub-foot", S + ".pub-foot", "footer"],
  ["foot wm", S + ".pub-foot .wm", "footer > span:first-child"],
  ["foot a", S + ".pub-foot > a:first-of-type", "footer a:first-of-type"],
  ["foot sns", S + ".pub-foot .sns", "footer > span:last-child", { flushRight: true }],
  /*
    ⚠️ 링크 자체를 센다. 상자만 재면 안에 무엇이 몇 개 있는지 모른다 —
    ver3가 이용약관·개인정보처리방침 둘을 넣었는데 상자 값은 그대로여서
    대조가 0건이라고 말했다. 수연이 눈으로 잡았다.
  */
  ["head ▸링크", S + ".pub-head nav", "header nav"],
  ["foot ▸링크", S + ".pub-foot", "footer"],
  ["foot soon", S + ".pub-foot .sns .soon", '[class*="__soon"]'],
];

const probe = (pairs) => `(() => {
  const CSS = ${JSON.stringify(CSS)};
  const out = {}, missing = [];
  for (const [name, sel, opt] of ${JSON.stringify(pairs)}) {
    const el = document.querySelector(sel);
    if (!el) { missing.push(name + "  ← " + sel); continue; }
    const cs = getComputedStyle(el);
    for (const p of CSS) {
      if (p.startsWith("border-bottom-") && p !== "border-bottom-width"
          && cs.getPropertyValue("border-bottom-width") === "0px") continue;
      if (p.startsWith("border-top-") && p !== "border-top-width"
          && cs.getPropertyValue("border-top-width") === "0px") continue;
      out[name + " " + p] = cs.getPropertyValue(p);
    }
    const o = opt || {};
    if (o.fixedHeight) {
      out[name + " ▸height"] = Math.round(el.getBoundingClientRect().height * 100) / 100 + "px";
    }
    if (name.endsWith("▸링크")) {
      /*
        글자를 그대로 늘어놓는다. 개수·순서·문구가 한 줄에 나온다.
        href 표시는 누를 수 있는가를 함께 본다 — 시안의 soon-nav는 href가
        없는 예고라 링크로 만들면 안 된다.

        ⚠️ 이 주석 안에 백틱을 쓰지 않는다. 프로브 전체가 템플릿 리터럴이라
        백틱 하나가 문자열을 끊는다.
      */
      out[name] = [...el.querySelectorAll("a")]
        .map(a => a.textContent.trim() + (a.hasAttribute("href") ? "[href]" : ""))
        /*
          ⚠️ 아직 게시하지 않기로 한 문서 셋을 양쪽에서 뺀다(이용약관·시즌
          규칙·유효 이용자 기준). 이유는 Footer.tsx에 있다. 시안에는 있으므로
          빼지 않으면 영원히 빨간 줄이 남고, 그러면 이 검사를 안 보게 된다.

          문서가 게시되면 그 이름을 이 목록에서 지운다.
        */
        .filter(t => !/^(이용약관|시즌 규칙|유효 이용자 기준)/.test(t))
        .join(" · ");
    }
    if (o.flushRight) {
      /* margin-left:auto가 실제로 오른쪽 끝까지 밀었는가 */
      const r = el.getBoundingClientRect();
      const pr = el.parentElement.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(el.parentElement).paddingRight);
      out[name + " ▸오른쪽 끝"] = Math.abs(pr.right - pad - r.right) < 1 ? "붙음" : "안 붙음";
    }
  }
  return { out, missing };
})()`;

/*
  hover로만 갈리는 것들. `getComputedStyle`은 기본 상태만 돌려주므로
  CDP로 :hover를 강제로 켜고 다시 잰다.

  ⚠️ 이걸 안 재서 푸터 링크의 hover를 통째로 빠뜨렸는데 대조는 0건이라고
  말했다. 수연이 눈으로 잡았다.
*/
const HOVER = [
  ["nav a", S + ".pub-head nav a", "header nav a"],
  ["foot a", S + ".pub-foot a", "footer a"],
  ["cta", S + ".pub-head .cta", "header button, header a[class*=btn]"],
];
const HOVER_CSS = ["color", "background-color", "background-image", "box-shadow",
                   "filter", "border-color", "opacity", "animation-name"];

/** :hover를 켜고 그 요소의 값만 뽑는다 */
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
for (const w of WIDTHS) {
  const spec = await withPage(async (p) => {
    /* 해시로 리더보드 화면을 켠다. 켜지 않으면 display:none이라 크기가 0이다 */
    await p.goto(SPEC_URL + "#leaderboard");
    await p.stripViewerShell();
    await p.resize(w);
    const r = await p.eval(probe(PAIRS.map(([n, s, , o]) => [n, s, o])));
    await p.shot(`${OUT}/spec-${w}.png`);
    /* ⚠️ 캡처보다 뒤에 둔다 — hover가 켜진 채로 찍히면 안 된다 */
    Object.assign(r.out, await hoverValues(p, HOVER, "spec"));
    return r;
  });
  const impl = await withPage(async (p) => {
    /*
      ⚠️ 랜딩(`/`)이 아니라 리더보드를 본다. 이유 둘 —
      ① 랜딩 헤더의 워드마크에는 `.glitch`가 붙어(position:relative) 시안의
         리더보드 헤더와 비교 대상이 아니다.
      ② 시안 쪽이 리더보드 화면이라 메뉴의 **활성 항목**도 리더보드다.
         다른 화면을 보면 활성 색(--text)이 안 맞는다.
    */
    await p.goto(IMPL_URL + "/seasons/season-1/leaderboard");
    await p.resize(w);
    const r = await p.eval(probe(PAIRS.map(([n, , i, o]) => [n, i, o])));
    await p.shot(`${OUT}/impl-${w}.png`);
    Object.assign(r.out, await hoverValues(p, HOVER, "impl"));
    return r;
  });

  console.log(`\n\n████ 폭 ${w}`);
  for (const m of spec.missing) console.log(`  ⚠️ 시안에서 못 찾음: ${m}`);
  for (const m of impl.missing) console.log(`  ⚠️ 구현본에서 못 찾음: ${m}`);
  total += spec.missing.length + impl.missing.length;
  total += diffTable(`${w}px — 공개 크롬`, spec.out, impl.out);
}
console.log(`\n═══════════════════════════\n세 폭 합계 불일치 ${total}건`);
console.log(`스크린샷: ${OUT}`);
