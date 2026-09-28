/*
  상태별 헤더 — 「헤더 상태별 시안 v1.0」(design/proovit_헤더_상태별_시안.html)의
  카탈로그 27종을 `/dev/headers` 진열장과 1:1로 대조한다.

  시안 쪽은 `.spec[data-id="P3"] .frame`, 진열장 쪽은 `[data-id="P3"]`이다.
  둘 다 같은 표본 데이터(루틴메이트 2인, 마감 10.18 D-4 …)를 그리므로
  값·상태(hover)·글자·구조 네 축을 전부 본다 — 글자가 같아야 판정
  (header-state.ts)도 맞는 것이다.

  ⚠️ 시안 정본이 다르다. 이 검사는 `design/` 안의 ver* 파일이 아니라
  상태별 헤더 시안을 읽는다 — SPEC_HTML을 안 줘도 그 파일을 고른다.

    node scripts/design-diff/header-states.mjs          # 전부
    ONLY=D2,A4 node scripts/design-diff/header-states.mjs  # 일부만
*/
import { join } from "node:path";

import { withPage, diffTable, diffText, textNodes, IMPL_URL, REPO, shotDir } from "./cdp.mjs";

const SPEC = "file://" + encodeURI(join(REPO, "design/proovit_헤더_상태별_시안.html"));
const IMPL = IMPL_URL + "/dev/headers";
const OUT = shotDir("header-states");

/* ── 어느 변형을 어디서 찾나. [id, 시안 프레임 셀렉터] ── */
export const VARIANTS = [
  ...["P1","P2","P3","P4","P5","P6","P7","P8","P9","P10","P11"].map((id) => [id, `.spec[data-id="${id}"] .frame`]),
  ["D1", '.spec[data-id="D1"] .frame'],
  /* D2는 프레임이 둘(기본형·긴급형). `.spec`의 자식은 cap · frame · frame · note 순이다 */
  ["D2", '.spec[data-id="D2"] > .frame:nth-child(2)'],
  ["D2-urgent", '.spec[data-id="D2"] > .frame:nth-child(3)'],
  ...["D3","D4","D5","D6","D7","D8","D9"].map((id) => [id, `.spec[data-id="${id}"] .frame`]),
  ...["A1","A2","A3","A4","A5","A6","A7"].map((id) => [id, `.spec[data-id="${id}"] .frame`]),
];

/* ── 공통으로 볼 속성 ── */
const BOX = [
  "display", "align-items", "justify-content", "gap", "flex-wrap",
  "font-family", "font-size", "font-weight", "letter-spacing", "line-height",
  "color", "background-color", "background-image", "backdrop-filter", "opacity",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border-top-width", "border-top-style", "border-top-color",
  "border-bottom-width", "border-bottom-style", "border-bottom-color",
  "border-left-width", "border-left-style", "border-left-color",
  "border-radius", "box-shadow", "text-decoration-line", "text-underline-offset",
  "width", "height", "cursor",
];

/*
  [이름, 시안 셀렉터(프레임 기준), 진열장 셀렉터(data-id 기준), 옵션]
  옵션: skip(안 볼 속성) · all(같은 셀렉터의 요소 전부, 순서대로) · fixedHeight · flushRight · hover

  ⚠️ 시안·구현 양쪽에 **없는** 요소는 통과다(변형마다 있고 없고가 다르다).
  한쪽에만 있으면 불일치로 센다 — 그게 구조 대조다.
*/
const SHARED = [
  ["bell", ".bell", '[class*="__bell"]', { skip: ["width", "height"] }],
  ["bell i", ".bell i", '[class*="__bell"] i', { extra: ["top", "right", "position"] }],
  ["me", ".me", '[class*="__me"]'],
  ["ad-tag", ".ad-tag", '[class*="__adTag"]'],
  ["live", ".live", '[class*="__live"]', { all: true, extra: ["position"] }],
  ["live::after", ".live", '[class*="__live"]', { all: true, pseudo: "::after", only: ["border-top-color", "border-top-width", "opacity", "inset", "animation-duration", "animation-timing-function", "animation-iteration-count"] }],
];

const PAIRS = {
  P: [
    /*
      box-shadow는 의도한 차이(iOS 사파리 덮개, NavBar.module.css). position은
      sticky(우리) vs relative(시안 카탈로그) — 시안 본편(ver4)은 sticky다.
    */
    ["pub-head", "header.pub-head", "header", { skip: ["box-shadow", "height", "width"], fixedHeight: true }],
    ["wm", ".pub-head .wm", "header > a:first-child", { skip: ["width", "height"] }],
    ["wm em", ".pub-head .wm em", "header > a:first-child em", { only: ["color", "font-style"] }],
    ["nav", ".pub-head nav", "header nav", { skip: ["width", "height"] }],
    /*
      ⚠️ `width`를 뺀다. 「시즌 아카이브」를 우리 헤더에서 뺐으므로(1ad6f2e)
      항목 수가 시안 3개 / 구현 2개로 **일부러** 다르고, 내비 폭은 그 차이를
      그대로 받는다. 바로 위 `nav` 쌍이 같은 이유로 이미 빼고 있다.
      항목이 되살아나면 이 줄도 같이 지운다.
    */
    ["nav ▸링크", ".pub-head nav", "header nav", { links: true, skip: ["width", "height"] }],
    ["rgt", ".pub-head .rgt", 'header [class*="__rgt"]', { skip: ["width", "height"], flushRight: true }],
    ["login", ".login-lnk", '[class*="__login"]', { skip: ["width", "height"], hover: ["color"] }],
    ["btn", ".rgt .btn", '[class*="__rgt"] [class*="__btn"]', { all: true, skip: ["width", "height"], hover: ["color", "background-color", "background-image", "box-shadow", "filter"] }],
    ...SHARED,
  ],
  D: [
    ["strip", ".strip", '[data-probe="strip"]', { skip: ["width", "height"] }],
    ["strip b", ".strip b", '[data-probe="strip"] b', { only: ["color", "font-weight"] }],
    ["strip .num", ".strip .num", '[data-probe="strip"] [data-num]', { only: ["font-family", "font-size"] }],
    ["strip a", ".strip a", '[data-probe="strip"] a', { only: ["font-weight", "text-decoration-line", "text-underline-offset", "color"], flushRight: false }],
    ["db-top", ".db-top", '[data-probe="db-top"]', { skip: ["width", "height"], fixedHeight: true }],
    ["wm", ".db-top .wm", '[data-probe="db-top"] > a:first-child', { skip: ["width", "height"] }],
    ["db-team", ".db-team", '[class*="__team"]', { skip: ["width", "height"] }],
    ["db-team b", ".db-team b", '[class*="__team"] b', { only: ["color", "font-weight"] }],
    ["db-team badge", ".db-team .badge", '[class*="__team"] [class*="__badge"]', { skip: ["width", "height"] }],
    ["db-ban", ".db-ban", '[data-probe="db-ban"]', { skip: ["width", "height"] }],
    ["stg-nm", ".db-ban .stg-nm", '[data-probe="db-ban"] [class*="__stg"]', { only: ["font-weight", "color", "font-size", "font-family"] }],
    ["tm", ".db-ban .tm", '[data-probe="db-ban"] [class*="__tm"]', { only: ["font-family", "font-size", "color"] }],
    ["go", ".db-ban .go", '[data-probe="db-ban"] [class*="__go"]', { skip: ["width", "height"] }],
    ["lock", ".db-ban svg", '[data-probe="db-ban"] svg', { only: ["width", "height", "color", "stroke-width"] }],
    ["rgt", ".db-top .rgt", '[data-probe="db-top"] [class*="__rgt"]', { skip: ["width", "height"], flushRight: true }],
    ["btn", ".db-top .rgt .btn", '[data-probe="db-top"] [class*="__rgt"] [class*="__btn"]', { all: true, skip: ["width", "height"] }],
    ...SHARED,
  ],
  A: [
    ["ad-top", ".ad-top", '[data-probe="ad-top"]', { skip: ["width", "height"], fixedHeight: true }],
    ["wm", ".ad-top .wm", '[data-probe="ad-top"] > a:first-child', { skip: ["width", "height"] }],
    ["ssel", ".ssel", '[data-probe="ad-top"] select', { only: ["background-color", "border-top-width", "border-top-style", "border-top-color", "color", "border-radius", "padding-top", "padding-bottom", "padding-left", "font-size", "font-family"] }],
    ["badge", ".ad-top .badge", '[data-probe="ad-top"] [class*="__badge"]', { skip: ["width", "height"] }],
    ["ad-q", ".ad-q", '[data-probe="ad-q"]', { all: true, skip: ["width", "height"] }],
    ["ad-q .num", ".ad-q .num", '[data-probe="ad-q"] [data-num]', { all: true, only: ["font-family", "font-size", "color"] }],
    ["ad-q faint", ".ad-q span[style*='faint']", '[data-probe="ad-q"] [class*="__faint"]', { all: true, only: ["color"] }],
    ["chip", ".chip", '[class*="__chip"]', { skip: ["width", "height"] }],
    ["rgt", ".ad-top .rgt", '[data-probe="ad-top"] [class*="__rgt"]', { skip: ["width", "height"], flushRight: true }],
    ...SHARED,
  ],
};

/*
  프로브. 시안과 진열장에서 **같은 함수**를 돌린다. `root` 아래에서만 찾는다.
  ⚠️ 이 안에 백틱을 쓰지 않는다 — 통째로 템플릿 리터럴이다.
*/
export const probe = (rootSel, pairs) => `(() => {
  const BOX = ${JSON.stringify(BOX)};
  const root = document.querySelector(${JSON.stringify(rootSel)});
  if (!root) return { missing: ["ROOT " + ${JSON.stringify(rootSel)}], out: {}, order: [] };
  const out = {}, missing = [], order = [];
  const read = (el, name, o, pseudo) => {
    const cs = getComputedStyle(el, pseudo || null);
    const props = o.only ? o.only : BOX.concat(o.extra || []);
    for (const p of props) {
      if ((o.skip || []).includes(p)) continue;
      if (p.startsWith("border-") && p !== "border-radius" && !p.endsWith("-width")) {
        const side = p.split("-")[1];
        if (cs.getPropertyValue("border-" + side + "-width") === "0px") continue;
      }
      out[name + " " + p] = cs.getPropertyValue(p);
    }
    if (o.fixedHeight) out[name + " ▸height"] = Math.round(el.getBoundingClientRect().height * 100) / 100 + "px";
    if (o.flushRight) {
      const r = el.getBoundingClientRect(), pr = el.parentElement.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(el.parentElement).paddingRight);
      out[name + " ▸오른쪽 끝"] = Math.abs(pr.right - pad - r.right) < 1.5 ? "붙음" : "안 붙음 (" + Math.round(pr.right - pad - r.right) + "px)";
    }
    if (o.links) {
      /*
        글자·순서·색(활성은 --text, 예고는 --faint). href는 카탈로그가 안 싣는다 — public-chrome.mjs가 본다.
        「시즌 아카이브」는 화면이 보류라 우리 헤더에 없다(header-state.ts publicNav) — 시안 쪽에서 뺀다.
      */
      out[name] = [...el.querySelectorAll("a")].filter((a) => a.textContent.trim() !== "시즌 아카이브")
        .map((a) => a.textContent.trim() + " " + getComputedStyle(a).color).join(" · ");
    }
  };
  for (const [name, sel, o0] of ${JSON.stringify(pairs)}) {
    const o = o0 || {};
    /* 숨긴 것은 없는 것으로 센다 — 모바일에서 내비·로그인은 DOM에 남고 display:none이다 */
    const els = (o.all ? [...root.querySelectorAll(sel)] : [...root.querySelectorAll(sel)].filter((el) => el.getClientRects().length).slice(0, 1))
      .filter((el) => el.getClientRects().length > 0);
    if (!els.length) { order.push(name + ":0"); continue; }
    order.push(name + ":" + els.length);
    els.forEach((el, i) => read(el, els.length > 1 ? name + "#" + (i + 1) : name, o, o.pseudo));
  }
  return { out, missing, order };
})()`;

/** :hover를 켜고 그 요소의 값만 뽑는다(cdp.mjs의 hover는 문서 전체 셀렉터를 받는다) */
async function hoverValues(p, rootSel, pairs, side) {
  const out = {};
  for (const [name, specSel, implSel, o] of pairs) {
    if (!o?.hover) continue;
    const sel = rootSel + " " + (side === "spec" ? specSel : implSel);
    /*
      n번째 요소에 표를 붙여 집는다. `:nth-of-type`은 태그로 순번을 매겨서,
      구현처럼 로그인 링크와 버튼이 둘 다 `<a>`면 버튼을 못 집고 조용히 건너뛴다.
    */
    const n = await p.eval(`(() => {
      const els = document.querySelectorAll(${JSON.stringify(sel)});
      els.forEach((el, i) => el.setAttribute("data-hv", ${JSON.stringify(name)} + i));
      return els.length;
    })()`);
    for (let i = 0; i < n; i++) {
      const one = `[data-hv="${name}${i}"]`;
      await p.hover(one);
      const v = await p.eval(`(() => {
        const cs = getComputedStyle(document.querySelector(${JSON.stringify(one)}));
        const o = {}; for (const k of ${JSON.stringify(o.hover)}) o[k] = cs.getPropertyValue(k); return o;
      })()`);
      const label = n > 1 ? `${name}#${i + 1}` : name;
      for (const [k, val] of Object.entries(v)) out[`${label}:hover ${k}`] = val;
    }
  }
  await p.hover();
  return out;
}

/*
  ⚠️ **겹치는 자리는 ver4가 정본이다**(2026-09-16 수연 결정).

  이 카탈로그가 정하는 것은 **상태 분기**다 — 어느 시즌·유저 상태에 무엇을
  그리는가(P/D/A 27종), 그리고 ver4에 없는 조각(`.strip`, `.ad-top`, `.ad-q`).
  크롬과 공용 컴포넌트의 **값**은 ver4가 정한다.

  카탈로그는 「토큰과 크롬은 ver3.0을 그대로 계승」이라 적고 ver3 값을 박아
  두었는데(본문 15px/1.6, `--text:#E8ECF4`, `.db-ban` 12.5px), ver4가 그 위를
  덮었고 우리 globals.css는 ver4 쪽이다. 그대로 재면 **전부 가짜 불일치**가 된다.

  그래서 재기 전에 시안 문서에 두 겹을 주입한다.
    ① 우리 토큰과 본문 타이포 — globals.mjs가 ver4와 따로 대조하는 값들
    ② ver4가 덮은 크롬 값 — 아래 VER4_CHROME

  ②는 손으로 옮긴 값이라 출처를 밝힌다. 다시 뜨려면:
      SPEC_HTML=design/proovit_디자인시안_ver4.html \
        node scripts/design-diff/fold-spec.mjs '^\.(pub-head|db-top|db-ban|me|ssel|chip|ad-tag)'
*/
const TOKENS = ["--bg","--surface","--surface-2","--line","--line-strong","--text","--muted","--faint",
  "--accent","--accent-ink","--accent-dim","--danger","--warn","--ok","--blue","--blue-dim",
  "--violet","--violet-dim","--teal","--teal-dim","--font","--mono"];
const tokenCss = await withPage(async (p) => {
  await p.goto(IMPL);
  return p.eval(`(() => {
    const cs = getComputedStyle(document.documentElement);
    const root = ${JSON.stringify(TOKENS)}.map(n => n + ":" + cs.getPropertyValue(n).trim()).join(";");
    const b = getComputedStyle(document.body);
    /* line-height는 단위 없는 배수로 — px로 주면 자식이 제 font-size로 못 푼다 */
    const lh = parseFloat(b.lineHeight) / parseFloat(b.fontSize);
    return ":root{" + root + "}body{font-size:" + b.fontSize + ";line-height:" + lh.toFixed(3) + ";letter-spacing:" + b.letterSpacing + "}";
  })()`);
});
/*
  ver4가 덮은 크롬 값(fold-spec의 마지막 승자). 카탈로그가 ver3 값을 들고 있는
  자리만 적는다 — ver4에 없는 `.strip`·`.ad-top`·`.ad-q`는 건드리지 않는다.

  ⚠️ `position:sticky`는 넣지 않는다. 카탈로그의 프레임은 `position:relative`로
  떠 있고 우리 진열장도 그렇다. sticky는 실제 화면에서만 뜻이 있어 여기서
  비교 대상이 아니다(DashboardTop.module.css 머리 주석 참조).

  `.ad-top`도 덮는다. 카탈로그에만 있는 클래스지만, ver4는 운영자 바를
  `.db-top[data-adm]`으로 그리므로 상자 표면은 `.db-top`의 것이다
  (AdminTop.module.css 머리 주석). 카탈로그가 적은 `--surface-2` 솔리드를
  그 위로 덮는다. 단 `gap`은 덮지 않는다 — 카탈로그가 `.db-top` 16px /
  `.ad-top` 14px로 일부러 갈라 적었고, ver4의 운영자 바는 항목이 넷뿐이라
  그 값을 물을 수 없다.

  ⚠️ **이 템플릿 리터럴 안에 백틱을 쓰지 않는다** — 하나만 들어가도 문자열이
  끊긴다(probe의 같은 경고와 같은 이유).
*/
const VER4_CHROME = `
  .db-top{background:rgba(12,19,34,.78);backdrop-filter:blur(12px) saturate(1.25)}
  .db-ban{padding:7px 9px 7px 17px;font-size:13.5px}
  .db-ban .tm{font-size:12.5px}
  .db-ban .go{font-size:12px;padding:5px 13px}
  .me{flex:none}
  .ssel{font-size:13.5px;box-shadow:inset 0 1px 2px rgba(0,0,0,.3)}
  .frame.mob .db-ban .tm{font-size:11px}
  /* 어드민 바의 표면 — 아래 머리 주석의 마지막 단락 참조. gap은 덮지 않는다 */
  .ad-top{background:rgba(12,19,34,.78);backdrop-filter:blur(12px) saturate(1.25)}
`;
/*
  ver4가 **마크업**으로 덮은 자리. 값(VER4_CHROME)과 같은 이유로 카탈로그 쪽에
  심어서 잰다.

  P5 로그인 링크 — 카탈로그(v1.0)의 P5 프레임에는 `.login-lnk`가 없는데 ver4는
  `PUBHEAD.P5`에 `login:1`로 싣는다. 겹치는 자리는 ver4가 정본이므로 카탈로그에
  ver4와 같은 링크를 넣고 대조한다(header-state.ts의 P5 주석 참조).
*/
const patchVer4Markup = (p) => p.eval(`(() => {
  const rgt = document.querySelector('.spec[data-id="P5"] .frame .rgt');
  if (rgt && !rgt.querySelector('.login-lnk')) {
    const a = document.createElement('a');
    a.className = 'login-lnk';
    a.textContent = '로그인';
    rgt.prepend(a);
  }
  /*
    「리그 소개」는 어느 변형에도 없다 — 랜딩이라 워드마크가 그 링크다.
    리더보드는 아카이브(P6)에만 있다 — 나머지 변형에서는 걷는다.
    (둘 다 2026-09-19 수연 지시, header-state.ts publicNav.) 비는 nav는 우리처럼 통째로 뺀다.
  */
  document.querySelectorAll('.spec .frame nav').forEach((nav) => {
    const id = nav.closest('.spec')?.dataset.id;
    /* 「시즌 아카이브」도 걷는다 — 2026-09-16에 뺐다(아래 IGNORE_TEXT와 같은 이유) */
    [...nav.children].forEach((a) => {
      const t = a.textContent.trim();
      if (t === "리그 소개" || t === "시즌 아카이브" || (t === "리더보드" && id !== "P6")) a.remove();
    });
    if (!nav.children.length) nav.remove();
  });
  return 1;
})()`);

const injectVer4 = (p) => p.eval(`(() => { const s = document.createElement("style"); s.textContent = ${JSON.stringify(tokenCss)} + ${JSON.stringify(VER4_CHROME)}; document.head.appendChild(s); return 1; })()`);

/*
  의도한 차이. 여기 넣는 순간 대조되지 않으므로 이유가 있는 것만.
    cursor           워드마크·벨·아바타를 실제 링크로 만든다(시안은 span)
    live::after opacity  무한 애니메이션의 중간값. animation-* 속성은 대조한다
    btn box-shadow   primary 버튼의 그림자는 hover까지 ver4 v1.1 CRAFT 값이다(Button.module.css). 헤더 시안은 ver3 값을 적었다
*/
const IGNORE_KEYS = [/ cursor$/, /^live::after.* opacity$/, /^btn(#\d+)?(:hover)? box-shadow$/];
/*
  탈락 스트립의 닫기 ×  시안은 「닫을 수 있음」이라고만 적고 버튼을 그리지 않았다
  시즌 아카이브        화면이 보류라 헤더에서 뺐다(2026-09-16 수연 지시). 화면이 생기면 이 줄을 지운다
*/
const IGNORE_TEXT = [/^×$/, /^시즌 아카이브$/];

const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
let total = 0;

for (const [id, specFrame] of VARIANTS) {
  if (only && !only.has(id)) continue;
  const kind = id[0];
  const pairs = PAIRS[kind];

  const spec = await withPage(async (p) => {
    await p.goto(SPEC);
    await injectVer4(p);
    await patchVer4Markup(p);
    await p.resize(1440);
    const r = await p.eval(probe(specFrame, pairs.map(([n, s, , o]) => [n, s, o])));
    r.text = await p.eval(textNodes(specFrame));
    Object.assign(r.out, await hoverValues(p, specFrame, pairs, "spec"));
    return r;
  });
  const impl = await withPage(async (p) => {
    await p.goto(IMPL);
    await p.resize(1440);
    const root = `[data-id="${id}"]`;
    const r = await p.eval(probe(root, pairs.map(([n, , i, o]) => [n, i, o])));
    r.text = await p.eval(textNodes(root));
    Object.assign(r.out, await hoverValues(p, root, pairs, "impl"));
    await p.shot(`${OUT}/impl-${id}.png`);
    return r;
  });

  console.log(`\n\n████ ${id}`);
  for (const m of spec.missing) console.log(`  ⚠️ 시안에서 못 찾음: ${m}`);
  for (const m of impl.missing) console.log(`  ⚠️ 구현본에서 못 찾음: ${m}`);
  total += spec.missing.length + impl.missing.length;

  /* 구조 — 요소 개수와 순서 */
  const so = spec.order.join(" "), io = impl.order.join(" ");
  if (so !== io) {
    console.log("  ✗ 구조가 다르다\n    시안: " + so + "\n    구현: " + io);
    total += 1;
  }
  for (const k of Object.keys(spec.out)) if (IGNORE_KEYS.some((re) => re.test(k))) { delete spec.out[k]; delete impl.out[k]; }
  total += diffTable(`${id} — 값`, spec.out, impl.out);
  /* 진열장의 라벨(맨 위 id 글자)은 우리 것이다 */
  total += diffText(spec.text, impl.text?.filter((t) => t !== id) ?? null, { label: id, ignore: IGNORE_TEXT });
}

/*
  ── 5장 모바일 축약 — 390px ──
  시안의 모바일 프레임은 `.frame.mob` 클래스 규칙으로 그려진다(창 폭과 무관).
  우리는 @media 760이라 진열장을 390으로 줄여 잰다.

  ⚠️ 글자 두 곳은 의도한 차이로 남겨 둔다(빨간 줄로 보이게 두고 IGNORE에 넣지 않는다).
  (데스크톱 D7의 벨도 의도한 차이다 — 시안은 「이후 알림 대상이 없다」로 뺐지만 전체 공지와
  미제출 통지가 탈락 팀에도 간다. 2026-09-28 수연 결정. 역시 빨간 줄로 남긴다.)
    D2-M 스테이지명  시안은 손으로 「s1 아이디어 등록」까지 잘랐고 우리는 말줄임(CSS)이다
    A4-M 대기열     시안은 두 대기열을 한 필에 합쳤고(「SLA 임박 3」) 우리는 필 둘을 쌓는다
*/
const MOBILE = [
  ["P3-M", ".mobrow .frame.mob:nth-child(1)", "P3", "P"],
  ["D2-M", ".mobrow .frame.mob:nth-child(2)", "D2-urgent", "D"],
  ["A4-M", ".mobrow .frame.mob:nth-child(3)", "A4", "A"],
];
for (const [id, specFrame, implId, kind] of MOBILE) {
  if (only && !only.has(id)) continue;
  const pairs = PAIRS[kind].filter(([n]) => !/^(rgt|nav ▸링크)$/.test(n));
  const spec = await withPage(async (p) => {
    await p.goto(SPEC);
    await injectVer4(p);
    await patchVer4Markup(p);
    await p.resize(1440);
    const r = await p.eval(probe(specFrame, pairs.map(([n, s, , o]) => [n, s, o])));
    r.text = await p.eval(textNodes(specFrame));
    return r;
  });
  const impl = await withPage(async (p) => {
    await p.goto(IMPL);
    await p.resize(390);
    const root = `[data-id="${implId}"]`;
    const r = await p.eval(probe(root, pairs.map(([n, , i, o]) => [n, i, o])));
    r.text = await p.eval(textNodes(root));
    await p.shot(`${OUT}/impl-${id}.png`);
    return r;
  });
  console.log(`\n\n████ ${id} (390px)`);
  for (const m of spec.missing) console.log(`  ⚠️ 시안에서 못 찾음: ${m}`);
  for (const m of impl.missing) console.log(`  ⚠️ 구현본에서 못 찾음: ${m}`);
  total += spec.missing.length + impl.missing.length;
  for (const k of Object.keys(spec.out)) if (IGNORE_KEYS.some((re) => re.test(k))) { delete spec.out[k]; delete impl.out[k]; }
  total += diffTable(`${id} — 값`, spec.out, impl.out);
  total += diffText(spec.text, impl.text?.filter((t) => t !== implId) ?? null, { label: id, ignore: IGNORE_TEXT });
}

/*
  ── 좁은 폭에서 한 줄인가 — 27판 전부 ──
  시안의 모바일 프레임은 셋뿐이라 위 대조는 나머지 판의 모바일을 안 본다.
  실제로 D3·D4·D9 배너 버튼이 두 줄로 접히고, 운영자 합친 필이 「137명전환율4.2%」로
  붙은 채 넘어갔다(2026-09-23). 버튼·시간 값·대기열 필·CTA가 한 줄인지,
  헤더가 가로로 넘치지 않는지 센다.
*/
const ONE_LINE = [
  '[class*="__btn"]', '[class*="__go"]', '[class*="__tm"]', '[class*="__stg"]',
  '[data-probe="ad-q"]', '[class*="__adTag"]',
];
for (const w of [390, 360]) {
  const bad = await withPage(async (p) => {
    await p.goto(IMPL);
    await p.resize(w);
    return p.eval(`(() => {
      if (innerWidth !== ${w}) return ["innerWidth " + innerWidth];
      const lines = (el) => {
        const r = document.createRange(); r.selectNodeContents(el);
        /* 글꼴이 섞인 조각(모노 숫자)은 바닥이 1px쯤 다르다 — 6px 넘게 벌어져야 새 줄 */
        const bottoms = [...r.getClientRects()].filter((b) => b.width > 0.5).map((b) => b.bottom).sort((a, b) => a - b);
        let n = bottoms.length ? 1 : 0;
        for (let i = 1; i < bottoms.length; i++) if (bottoms[i] - bottoms[i - 1] > 6) n++;
        return n;
      };
      const out = [];
      for (const [id] of ${JSON.stringify(VARIANTS.map(([id]) => [id]))}) {
        const root = document.querySelector('[data-id="' + id + '"]');
        if (!root) { out.push(id + " 못 찾음"); continue; }
        const head = root.querySelector("header, [data-probe=db-top], [data-probe=ad-top]");
        if (head && head.scrollWidth > head.clientWidth + 1) out.push(id + " 가로 넘침 " + head.scrollWidth + ">" + head.clientWidth);
        for (const el of root.querySelectorAll(${JSON.stringify(ONE_LINE.join(","))})) {
          if (!el.getClientRects().length || getComputedStyle(el).display === "none") continue;
          const n = lines(el);
          if (n > 1) out.push(id + " " + n + "줄: " + el.textContent.trim());
        }
      }
      return out;
    })()`);
  });
  console.log(`\n\n████ 한 줄 검사 ${w}px`);
  if (!bad.length) console.log("  전부 한 줄 ✓");
  for (const b of bad) console.log("  ✗ " + b);
  total += bad.length;
}

console.log(`\n═══════════════════════════\n합계 불일치 ${total}건`);
console.log(`스크린샷: ${OUT}`);
