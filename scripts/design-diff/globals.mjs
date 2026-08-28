/*
  전역 토큰과 기본 규칙 — 시안과 구현본의 **실제 computed style**을 대조한다.

  CSS 파일끼리 값을 비교하는 것으로는 부족하다. 그건 "내가 적은 값이 시안과
  같다"까지만 말한다. 뒤에 온 규칙(Tailwind preflight 등)이 덮었는지는
  브라우저가 계산한 값을 봐야 안다 — 실제로 그렇게 제목 리셋 문제를 잡았다.

  섹션별 대조 스크립트의 본보기이기도 하다. 새 섹션은 이걸 복사해서
  PROBE만 갈아 끼운다.

    node scripts/design-diff/globals.mjs
*/
import { withPage, diffTable, SPEC_URL, IMPL_URL, WIDTHS, shotDir } from "./cdp.mjs";

const SPEC = SPEC_URL;
const IMPL = IMPL_URL;
const OUT = shotDir("globals");

/* 시안이 :root에 정의한 토큰 전부 + body 계산값 + 전역 규칙의 결과 */
const PROBE = `(() => {
  const rootCS = getComputedStyle(document.documentElement);
  const bodyCS = getComputedStyle(document.body);
  const out = {};

  /*
    ⚠️ 커스텀 속성은 브라우저가 파싱하지 않고 **적은 그대로** 돌려준다.
    같은 색이라도 시안은 #0A101C, 구현본은 Lightning CSS가 줄인 #e2e8f41c로
    나와 전부 불일치로 보인다. 그래서 값을 실제 속성에 한 번 통과시켜
    브라우저가 정규화한 형태(rgb()/rgba())로 바꿔 비교한다.
  */
  const probeEl = document.createElement("div");
  probeEl.style.cssText = "position:absolute;left:-9999px;top:0";
  document.body.appendChild(probeEl);
  const through = (prop, raw) => {
    probeEl.style[prop] = "";
    probeEl.style[prop] = raw;
    return getComputedStyle(probeEl)[prop];
  };

  const COLORS = ["--bg","--surface","--surface-2","--line","--line-strong",
    "--text","--muted","--faint","--accent","--accent-ink","--accent-dim",
    "--danger","--warn","--ok","--blue","--blue-dim","--violet","--violet-dim",
    "--teal","--teal-dim"];
  for (const t of COLORS) out["token " + t] = through("color", rootCS.getPropertyValue(t).trim());
  for (const t of ["--r-s","--r-m","--r-l"]) out["token " + t] = rootCS.getPropertyValue(t).trim();
  for (const t of ["--font","--mono"]) out["token " + t] = through("fontFamily", rootCS.getPropertyValue(t).trim());
  probeEl.remove();

  for (const p of ["background-color","color","font-family","font-size",
                   "line-height","letter-spacing","word-break","overflow-wrap"]) {
    out["body " + p] = bodyCS.getPropertyValue(p);
  }

  /* 전역 규칙이 실제로 걸렸는지 — 임시 요소를 심어 계산값을 본다 */
  const probe = (html, sel, props) => {
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:-9999px;top:0";
    host.innerHTML = html;
    document.body.appendChild(host);
    const el = sel ? host.querySelector(sel) : host.firstElementChild;
    const cs = getComputedStyle(el);
    const r = {};
    for (const p of props) r[p] = cs.getPropertyValue(p);
    host.remove();
    return r;
  };

  for (const t of ["h1","h2","h3","h4","h5","h6"]) {
    const h = probe("<" + t + ">가</" + t + ">", null,
      ["font-size","font-weight","letter-spacing","text-wrap","margin-top"]);
    for (const k of Object.keys(h)) out[t + " " + k] = h[k];
  }

  const box = probe("<div></div>", null, ["box-sizing","margin-top","padding-top"]);
  out["* box-sizing"] = box["box-sizing"];
  out["* margin-top"] = box["margin-top"];
  out["* padding-top"] = box["padding-top"];

  const a = probe("<a href='#'>가</a>", null, ["color","text-decoration-line"]);
  out["a color"] = a["color"];
  out["a text-decoration-line"] = a["text-decoration-line"];

  const btn = probe("<button>가</button>", null,
    ["font-family","cursor","border-top-width","background-color","color"]);
  for (const k of Object.keys(btn)) out["button " + k] = btn[k];

  const mono = probe("<span class='mono'>1</span>", null,
    ["font-family","font-variant-numeric"]);
  out["mono font-family"] = mono["font-family"];
  out["mono font-variant-numeric"] = mono["font-variant-numeric"];

  const score = probe("<span class='score'>1</span>", null,
    ["font-family","font-weight","letter-spacing","font-variant-numeric"]);
  for (const k of Object.keys(score)) out["score " + k] = score[k];

  /* body 의사요소 — 오로라와 그레인이 실제로 그려지는가 */
  const before = getComputedStyle(document.body, "::before");
  out["body::before position"] = before.position;
  out["body::before z-index"] = before.zIndex;
  out["body::before animation-name"] = before.animationName;
  out["body::before animation-duration"] = before.animationDuration;
  const after = getComputedStyle(document.body, "::after");
  out["body::after opacity"] = after.opacity;
  out["body::after mix-blend-mode"] = after.mixBlendMode;
  out["body::after z-index"] = after.zIndex;

  out["_innerWidth"] = String(innerWidth);
  return out;
})()`;

async function grab(url, width, shotPath) {
  return withPage(async (page) => {
    await page.goto(url);
    await page.resize(width);
    const data = await page.eval(PROBE); // ← 캡처보다 먼저 (함정 ①)
    if (shotPath) await page.shot(shotPath);
    return data;
  });
}

let total = 0;
for (const w of WIDTHS) {
  const spec = await grab(SPEC, w, `${OUT}/spec-${w}.png`);
  const impl = await grab(IMPL, w, `${OUT}/impl-${w}.png`);
  console.log(`\n\n████ 폭 ${w}  (시안 innerWidth=${spec._innerWidth}, 구현 ${impl._innerWidth})`);
  delete spec._innerWidth;
  delete impl._innerWidth;
  total += diffTable(`${w}px — 전역 토큰과 기본 규칙`, spec, impl);
}
console.log(`\n═══════════════════════════\n세 폭 합계 불일치 ${total}건`);
