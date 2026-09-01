/*
  인증 — 시안 `#scr-auth`(로그인·회원가입 2상태)와 `/login`·`/signup`을 대조한다.

  ⚠️ **시안 마크업의 클래스를 먼저 전부 뽑아 넣었다.** 지금까지 새어나간 것
  (히어로 격자·헤더 글리치·동의 블록)이 전부 「probe에 없어서」였다.

    sed -n '1365,1391p' 시안.html | grep -oE 'class="[^"]*"'

  로 나온 것 중 뷰어 크롬(screen·state-bar·sb)을 뺀 전부가 아래에 있다.

    node scripts/design-diff/auth.mjs

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
  const only = mode === "login" ? ".only-login" : ".only-signup";
  return [
    /*
      ⚠️ min-height는 비교하지 않는다. 시안은 `calc(100vh - 52px - 41px)`인데
      그 둘은 뷰어 크롬(#topbar·.state-bar) 높이다. 제품에는 없어서 100vh를 쓴다.
    */
    ["wrap", S + ".wrap", "wrap", [], ["min-height"]],
    ["card", S + ".auth-card", "card"],
    ["wm", S + ".auth-card .wm", "wm"],
    ["wm em", S + ".auth-card .wm em", "wmCheck"],
    ["h2", S + ".auth-card h2" + only, "title"],
    ["sub", S + ".auth-card .sub" + only, "sub"],
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
      ver3가 「이용약관」·「개인정보처리방침」을 링크로 만들었다. 상자만 재면
      안의 링크가 없어도 통과하므로(푸터·CTA 버튼과 같은 부류) 직접 잰다.

      ⚠️ 시안의 첫 링크는 「이용약관」이고 우리는 「개인정보처리방침」이다 —
      약관 본문이 확정되기 전까지 링크하지 않기로 했다(content/terms.ts).
      값이 아니라 글자가 다른 것이라 아래 글자 대조에서 예외로 뺀다.
    */
    ["terms a", S + ".auth-card .terms a", '[class*="__terms"] a', [], ["width"]],
    ["swap", S + ".auth-card .swap" + only, "swap"],
    ["swap a", S + ".auth-card .swap" + only + " a", '[class*="__swap"] a'],
    ...(mode === "signup"
      ? [
          ["consents", S + ".consents", '[class*="ConsentFields-module"][class*="root"]'],
          ["consent row", S + ".consents label", '[class*="ConsentFields-module"][class*="row"]'],
          ["consent box", S + ".consents input", '[class*="ConsentFields-module"][class*="checkbox"]',
            [], ["font-size", "line-height", "color", "letter-spacing", "font-family"]],
          ["consent req", S + ".consents .req", '[class*="ConsentFields-module"][class*="tagRequired"]'],
          ["consent 보기", S + ".consents a.see", '[class*="ConsentFields-module"][class*="toggle"]',
            [], ["display", "text-align", "width"]],
        ]
      : []),
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

  ⚠️ 시안은 상태를 CSS(`.only-login`/`.only-signup`)로 감추는데 우리는
  라우트가 갈린다. `textNodes`가 `display:none`을 건너뛰므로 양쪽 다
  지금 보이는 것만 잡힌다.
*/
const TEXT_SPEC = (mode) => `#scr-auth[data-state="${mode}"] .auth-card`;
const TEXT_IMPL = '[class*="login-module"][class*="__card"]';

/*
  hover로만 갈리는 것. 이 화면 고유의 규칙은 둘이다 —
  `.auth-card .terms a:hover`와 `.consents a.see:hover`. 둘 다 ver3 신설이라
  값 대조만으로는 빠뜨렸는지 알 수 없다.
*/
const HOVER_CSS = ["color", "border-bottom-color", "background-color"];
const HOVER = (mode) => [
  ["terms a", `#scr-auth[data-state="${mode}"] .auth-card .terms a`, '[class*="__terms"] a'],
  ...(mode === "signup"
    ? [["보기", `#scr-auth[data-state="${mode}"] .consents a.see`,
        '[class*="ConsentFields-module"][class*="__toggle"]']]
    : []),
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

for (const mode of ["login", "signup"]) {
  for (const w of WIDTHS) {
    const list = pairs(mode);
    const spec = await withPage(async (p) => {
      await p.goto(SPEC_URL + "#auth");
      await p.stripViewerShell();
      /* 시안은 상태 바 버튼이 data-state를 바꾼다. 직접 지정한다 */
      await p.eval(`(() => {
        const s = document.getElementById("scr-auth");
        s.dataset.state = ${JSON.stringify(mode)};
        return 1;
      })()`);
      await p.resize(w, 900);
      const r = await p.eval(run(list, "spec"));
      await p.shot(`${OUT}/spec-${mode}-${w}.png`);
      r.text = await p.eval(textNodes(TEXT_SPEC(mode)));
      Object.assign(r.out, await hoverValues(p, mode, "spec"));
      return r;
    });
    const impl = await withPage(async (p) => {
      await p.goto(IMPL_URL + (mode === "login" ? "/login" : "/signup"));
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
    /*
      ⚠️ 「이용약관」은 아는 차이다. 시안은 링크로 그리지만 우리는 본문이
      확정될 때까지 글자로 둔다 — 그래서 시안 쪽에만 있는 것으로 잡힌다.
      TERMS에 값이 들어오면 이 예외를 지운다.
    */
    total += diffText(spec.text, impl.text, {
      ignore: [/^이용약관$/],
      label: mode,
    });
  }
}
console.log(`\n═══════════════════════════\n합계 불일치 ${total}건`);
console.log(`스크린샷: ${OUT}`);
