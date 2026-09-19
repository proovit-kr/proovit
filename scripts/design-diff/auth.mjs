/*
  인증 — 시안 ver4 `#scr-auth`와 `/login`을 대조한다.

    node scripts/design-diff/auth.mjs          # ① 로그인 또는 회원가입 (entry)

  ver4는 로그인과 회원가입을 한 화면으로 합쳤다. ②③(콜백 뒤 동의 모달)은
  `/login`이 아니라 보던 페이지 위에 뜨므로 이 스크립트가 아직 재지 않는다.

  ⚠️ **시안 마크업의 클래스를 먼저 전부 뽑아 넣었다.** 지금까지 새어나간 것
  (히어로 격자·헤더 글리치·동의 블록)이 전부 「probe에 없어서」였다.

    sed -n '1684,1695p' 시안.html | grep -oE 'class="[^"]*"'

  로 나온 것 중 뷰어 크롬(screen·state-bar·sb)을 뺀 전부가 아래에 있다.

  ⚠️ **카카오 키가 있어야 두 버튼이 다 나온다.** 없으면 Google 하나만 그려져
  버튼 순서와 자식 정렬을 대조할 수 없다(`auth-providers.ts`가 키 없는 제공자를
  아예 뺀다). 실제 카카오 로그인은 비즈 앱 심사가 끝나야 되지만, 화면만
  보려면 `.env.development.local`에 아무 값이나 넣어 두면 된다.

      AUTH_KAKAO_ID=diff-only-placeholder
      AUTH_KAKAO_SECRET=diff-only-placeholder

  `.env*`는 gitignore라 각자 넣어야 한다.
*/
import {
  withPage, diffTable, diffText, textNodes,
  SPEC_URL, IMPL_URL, WIDTHS, shotDir,
} from "./cdp.mjs";

const OUT = shotDir("auth");

const CSS = [
  "font-size", "font-weight", "line-height", "letter-spacing",
  "color", "background-color", "background-image",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "border-radius", "box-shadow", "gap", "display", "flex-direction",
  "align-items", "justify-content", "text-align", "width", "max-width",
  "font-family", "accent-color", "vertical-align",
  "border-top-width", "border-top-style", "border-top-color",
];

/* [이름, 시안 셀렉터, 구현본(모듈 이름 또는 셀렉터), 추가 속성, 뺄 속성] */
const pairs = (mode) => {
  const S = `#scr-auth[data-state="${mode}"] `;
  return [
    /*
      ⚠️ min-height는 비교하지 않는다. 시안은 `calc(100vh - 52px - 41px)`인데
      그 둘은 뷰어 크롬(#topbar·.state-bar) 높이다. 제품에는 없어서 100vh를 쓴다.
    */
    ["wrap", S + ".wrap", "wrap", [], ["min-height"]],
    ["card", S + ".auth-card", "card"],
    /*
      ⚠️ 폭과 좌우 마진을 비교하지 않는다. 시안의 워드마크는 `<div>`라 카드
      폭 전체(346px)를 차지하지만, 우리는 첫 화면으로 가는 `<a>`라 **글자
      폭만큼만**(122px) 잡고 `margin-inline: auto`로 가운데에 둔다 — 블록으로
      두면 글자에서 한참 떨어진 여백을 눌러도 화면이 넘어간다.
      가운데에 오는 것은 아래 ▸가운데가 확인한다.
    */
    ["wm", S + ".auth-card .wm", "wm", [], ["width", "margin-left", "margin-right"]],
    ["wm em", S + ".auth-card .wm em", "wmCheck"],
    ["h2", S + ".auth-card h2", "title"],
    ["sub", S + ".auth-card .sub", "sub"],
    ["sso", S + ".sso", "sso", [], []],
    /*
      ⚠️ 제공자 클래스로 집는다. 카카오는 실제로 쓸 수 없지만
      (비즈 앱 심사 대기 — auth-providers.ts) `.env.development.local`에
      더미 키를 넣어 두면 버튼은 그려진다. **순서까지 대조하려면 둘 다 있어야 한다** —
      시안은 카카오가 위다.
    */
    ["sso btn(kakao)", S + ".sso .btn-kakao", '[class*="Button-module"][class*="__kakao"]'],
    ["sso btn(google)", S + ".sso .btn-google", '[class*="Button-module"][class*="__google"]'],
    ["sso ic", S + ".sso .btn-kakao .ic", '[class*="__ssoMark"]',
      ["stroke-width", "height"]],
    ["terms", S + ".auth-card .terms", "terms"],
    /*
      「이용약관」·「개인정보 수집과 이용」 두 링크. 상자만 재면 안의 링크가
      없어도 통과하므로(푸터·CTA 버튼과 같은 부류) 직접 잰다.
    */
    ["terms a", S + ".auth-card .terms a", '[class*="__terms"] a', [], ["width"]],
  ];
};

const probe = () => `(() => {
  const CSS = ${JSON.stringify(CSS)};
  const out = {}, missing = [];
  const byModuleName = (n) => [...document.querySelectorAll('[class*="__' + n + '"]')]
    .find(el => [...el.classList].some(c => c.endsWith("__" + n)));

  for (const [name, sel, mode, extra, skip] of ${JSON.stringify("PAIRS")} === "x" ? [] : LIST) {
    const el = mode === "impl" && !/[ .#>\\[]/.test(sel) ? byModuleName(sel) : document.querySelector(sel);
    if (!el) { missing.push(name + "  ← " + sel); continue; }
    const cs = getComputedStyle(el);
    for (const p of CSS.concat(extra || [])) {
      if ((skip || []).includes(p)) continue;
      if (p.startsWith("border-") && !p.endsWith("width")
          && cs.getPropertyValue("border-top-width") === "0px") continue;
      out[name + " " + p] = cs.getPropertyValue(p);
    }
    /* 의사요소도 잰다 — 시안은 연출의 절반을 거기서 한다 */
    for (const pe of ["::before", "::after"]) {
      const pcs = getComputedStyle(el, pe);
      if (pcs.content === "none") continue;
      for (const p of ["content","position","width","height","z-index","opacity",
                       "background-image","animation-name","color","margin-left"]) {
        let v = pcs.getPropertyValue(p);
        if (p === "animation-name") v = v.split(", ").map(n => n.replace(/^.*__/, "")).join(", ");
        out[name + pe + " " + p] = v;
      }
    }
    /* 그리드·플렉스면 자식 키가 서로 같은지 */
    const disp = cs.display;
    if (disp === "grid" || disp === "flex") {
      /* display:none인 자식(숨은 input 등)은 상자를 만들지 않으므로 세지 않는다 */
      const shown = [...el.children].filter(c => getComputedStyle(c).display !== "none");
    /*
      부모 안에서 가운데인가. 폭을 비교하지 않는 요소(워드마크)가 제자리에
      있는지는 값이 아니라 뜻으로 봐야 한다.
    */
    if (name === "wm") {
      const r = el.getBoundingClientRect();
      const pr = el.parentElement.getBoundingClientRect();
      out[name + " ▸가운데"] =
        Math.abs((r.left - pr.left) - (pr.right - r.right)) < 2 ? "가운데" : "치우침";
    }

      const hs = shown.map(c => Math.round(c.getBoundingClientRect().height));
      if (!(skip || []).includes("▸자식 높이 같음"))
        out[name + " ▸자식 높이 같음"] = hs.length > 1 ? String(new Set(hs).size === 1) : "해당없음";
    }
    /* 겹침 — 불투명한 조상 수 */
    let opaque = 0;
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const c2 = getComputedStyle(n);
      if (c2.backgroundColor !== "rgba(0, 0, 0, 0)" || c2.backgroundImage !== "none") opaque++;
    }
    out[name + " ▸불투명한 조상 수"] = String(opaque);
    /* 넘침 — 콘텐츠가 상자를 벗어났는가 */
    out[name + " ▸가로 넘침"] = String(el.scrollWidth > el.clientWidth + 1);
    /*
      ⚠️ 소셜 버튼은 **순서**도 디자인이다. 시안은 카카오가 위다.
      클래스 이름에서 제공자만 뽑아 순서를 그대로 비교한다.
    */
    if (name === "sso") {
      out[name + " ▸제공자 순서"] = [...el.children]
        .filter((c) => getComputedStyle(c).display !== "none")
        .map((c) => (/kakao/.test(c.className) ? "kakao" : /google/.test(c.className) ? "google" : "?"))
        .join(" → ");
    }
  }
  return { out, missing };
})()`.replace('${JSON.stringify("PAIRS")} === "x" ? [] : LIST', "LIST");

const run = (list, mode) =>
  probe().replace("LIST", JSON.stringify(list.map(([n, s, i, x, k]) =>
    mode === "spec" ? [n, s, "spec", x, k] : [n, i, "impl", x, k])));

let total = 0;
/*
  글자 대조. 카드 하나가 화면 전부라 카드째 긁는다.

  `textNodes`가 `display:none`을 건너뛰므로 양쪽 다 지금 보이는 것만 잡힌다.
*/
const TEXT_SPEC = (mode) => `#scr-auth[data-state="${mode}"] .auth-card`;
const TEXT_IMPL = '[class*="login-module"][class*="__card"]';

/*
  hover로만 갈리는 것. ① 상태 고유의 규칙은 `.auth-card .terms a:hover`
  하나다. 값 대조만으로는 빠뜨렸는지 알 수 없다.
*/
const HOVER_CSS = ["color", "border-bottom-color", "background-color", "text-decoration-line"];
const HOVER = (mode) => [
  ["terms a", `#scr-auth[data-state="${mode}"] .auth-card .terms a`, '[class*="__terms"] a'],
  /*
    ⚠️ 워드마크는 시안에서 `<div>`, 우리는 `<a>`다(첫 화면으로 가는 링크).
    hover 효과는 **두지 않았다** — 시안의 이 카드에는 장식이 없다. 그래도
    hover에서 색·밑줄이 딸려 오지 않는지는 봐야 한다. `<a>`로 바꾼 자리라
    브라우저 기본값이 새기 쉽고, 값 대조는 기본 상태만 본다.
  */
  ["wm", `#scr-auth[data-state="${mode}"] .auth-card .wm`, '[class*="login-module"][class*="__wm"]'],
];

async function hoverValues(p, mode, side) {
  const out = {};
  for (const [name, specSel, implSel] of HOVER(mode)) {
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
  시안은 상태 바 버튼(`.sb[data-set]`)으로 고른다. `stripViewerShell()`이
  상태 바를 가리기 **전에** 누른다 — data-state만 바꾸면 버튼에 딸린
  연출(헤더 페이즈 등)이 따라오지 않는다.
*/
const pickState = (state) => `(() => {
  const sec = document.getElementById("scr-auth");
  sec.querySelector('.sb[data-set="' + ${JSON.stringify(state)} + '"]').click();
  if (sec.dataset.state !== ${JSON.stringify(state)}) return "상태 전환 실패: " + sec.dataset.state;
  return sec.dataset.state;
})()`;

for (const mode of ["entry"]) {
  for (const w of WIDTHS) {
    const list = pairs(mode);
    const spec = await withPage(async (p) => {
      await p.goto(SPEC_URL + "#auth");
      const picked = await p.eval(pickState(mode));
      if (picked !== mode) throw new Error(picked);
      await p.stripViewerShell();
      await p.resize(w, 900);
      const r = await p.eval(run(list, "spec"));
      await p.shot(`${OUT}/spec-${mode}-${w}.png`);
      r.text = await p.eval(textNodes(TEXT_SPEC(mode)));
      Object.assign(r.out, await hoverValues(p, mode, "spec"));
      return r;
    });
    const impl = await withPage(async (p) => {
      await p.goto(IMPL_URL + "/login");
      await p.resize(w, 900);
      const r = await p.eval(run(list, "impl"));
      await p.shot(`${OUT}/impl-${mode}-${w}.png`);
      r.text = await p.eval(textNodes(TEXT_IMPL));
      Object.assign(r.out, await hoverValues(p, mode, "impl"));
      return r;
    });

    console.log(`\n\n████ ${mode} · 폭 ${w}`);
    for (const m of spec.missing) console.log(`  ⚠️ 시안에서 못 찾음: ${m}`);
    for (const m of impl.missing) console.log(`  ⚠️ 구현본에서 못 찾음: ${m}`);
    total += spec.missing.length + impl.missing.length;
    total += diffTable(`${mode} ${w}px — 인증`, spec.out, impl.out);
    total += diffText(spec.text, impl.text, { label: mode });
  }
}
console.log(`\n═══════════════════════════\n합계 불일치 ${total}건`);
console.log(`스크린샷: ${OUT}`);
