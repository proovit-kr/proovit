/*
  인증 — 시안 `#scr-auth`(로그인·회원가입 2상태)와 `/login`·`/signup`을 대조한다.

  ⚠️ **시안 마크업의 클래스를 먼저 전부 뽑아 넣었다.** 지금까지 새어나간 것
  (히어로 격자·헤더 글리치·동의 블록)이 전부 「probe에 없어서」였다.

    sed -n '1365,1391p' 시안.html | grep -oE 'class="[^"]*"'

  로 나온 것 중 뷰어 크롬(screen·state-bar·sb)을 뺀 전부가 아래에 있다.

    node scripts/design-diff/auth.mjs
*/
import { withPage, diffTable, SPEC_URL, IMPL_URL, WIDTHS, shotDir } from "./cdp.mjs";

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
    /*
      ⚠️ 자식 높이 비교를 뺀다. 시안은 버튼이 둘인데 dev에는 구글 키만 있어
      하나다 — 제공자 수 차이지 정렬 문제가 아니다.
    */
    ["sso", S + ".sso", "sso", [], ["▸자식 높이 같음"]],
    /*
      ⚠️ 제공자 클래스로 집는다. dev에는 구글 키만 있어 카카오 버튼이 없다
      (auth-providers.ts — 카카오는 비즈 앱 심사 대기). 카카오 버튼의 값 자체는
      §2 진열장에서 이미 대조했다.
    */
    ["sso btn", S + ".sso .btn-google", '[class*="Button-module"][class*="__google"]'],
    ["sso ic", S + ".sso .btn-google .ic", '[class*="__ssoMark"]',
      ["stroke-width", "height"]],
    ["terms", S + ".auth-card .terms", "terms"],
    ["swap", S + ".auth-card .swap" + only, "swap"],
    ["swap a", S + ".auth-card .swap" + only + " a", '[class*="__swap"] a'],
    ...(mode === "signup"
      ? [
          ["consents", S + ".consents", '[class*="ConsentFields-module"][class*="root"]'],
          ["consent row", S + ".consents label", '[class*="ConsentFields-module"][class*="row"]'],
          ["consent box", S + ".consents input", '[class*="ConsentFields-module"][class*="checkbox"]',
            [], ["font-size", "line-height", "color", "letter-spacing", "font-family"]],
          ["consent req", S + ".consents .req", '[class*="ConsentFields-module"][class*="tagRequired"]'],
          ["consent 보기", S + ".consents a.mono", '[class*="ConsentFields-module"][class*="toggle"]',
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
      const hs = [...el.children].map(c => Math.round(c.getBoundingClientRect().height));
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
  }
  return { out, missing };
})()`.replace('${JSON.stringify("PAIRS")} === "x" ? [] : LIST', "LIST");

const run = (list, mode) =>
  probe().replace("LIST", JSON.stringify(list.map(([n, s, i, x, k]) =>
    mode === "spec" ? [n, s, "spec", x, k] : [n, i, "impl", x, k])));

let total = 0;
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
      return r;
    });
    const impl = await withPage(async (p) => {
      await p.goto(IMPL_URL + (mode === "login" ? "/login" : "/signup"));
      await p.resize(w, 900);
      const r = await p.eval(run(list, "impl"));
      await p.shot(`${OUT}/impl-${mode}-${w}.png`);
      return r;
    });

    console.log(`\n\n████ ${mode} · 폭 ${w}`);
    for (const m of spec.missing) console.log(`  ⚠️ 시안에서 못 찾음: ${m}`);
    for (const m of impl.missing) console.log(`  ⚠️ 구현본에서 못 찾음: ${m}`);
    total += spec.missing.length + impl.missing.length;
    total += diffTable(`${mode} ${w}px — 인증`, spec.out, impl.out);
  }
}
console.log(`\n═══════════════════════════\n합계 불일치 ${total}건`);
console.log(`스크린샷: ${OUT}`);
