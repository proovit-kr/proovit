/*
  모집 중부터의 공개 푸터 — 시안 `.pub-foot`과 구현 `/`의 푸터를 대조한다.

  모집 전 푸터는 노션 정본이라 시안과 대조하지 않는다(Footer.tsx). 구현이 지금
  어느 푸터를 그리는지 먼저 보고, 사전 신청 푸터면 멈춘다.

  시안은 랜딩 ② 모집 중 상태에서 잰다. 푸터는 모든 공개 화면이 같다.

    node scripts/design-diff/footer.mjs
*/
import {
  withPage, diffTable, diffText, textNodes,
  SPEC_URL, IMPL_URL, WIDTHS, shotDir,
} from "./cdp.mjs";

const OUT = shotDir("footer");

const CSS = [
  "display", "align-items", "justify-content", "gap", "flex-wrap", "flex-basis",
  "font-size", "font-weight", "letter-spacing", "line-height", "font-style",
  "color", "background-color", "opacity", "cursor",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-left", "border-top-width", "border-top-style", "border-top-color",
  "border-radius", "text-decoration-line", "vertical-align",
];
const PSEUDO = ["content", "font-size", "margin-left", "border-top-width", "border-top-color",
  "border-radius", "padding-left", "padding-right", "vertical-align"];

/* [이름, 시안 셀렉터, 구현 셀렉터, 옵션] — all이면 같은 셀렉터의 요소를 전부 순서대로 */
const F = "#scr-landing .pub-foot";
const PAIRS = [
  ["foot", F, "footer"],
  ["wm", F + " .wm", 'footer [class*="__wm"]'],
  ["wm em", F + " .wm em", 'footer [class*="__wm"] em'],
  ["a", F + " > a", "footer > a", { all: true }],
  ["sns", F + " .sns", 'footer [class*="__sns"]', { flushRight: true }],
  ["soon", F + " .sns .soon", 'footer [class*="__soon"]', { all: true, pseudo: true }],
];

const probe = (pairs) => `(() => {
  const CSS = ${JSON.stringify(CSS)}, PSEUDO = ${JSON.stringify(PSEUDO)};
  const out = {}, missing = [];
  const read = (key, el, o) => {
    const cs = getComputedStyle(el);
    for (const p of CSS) {
      if (p.startsWith("border-top-") && p !== "border-top-width" && cs.borderTopWidth === "0px") continue;
      out[key + " " + p] = cs.getPropertyValue(p);
    }
    if (o.pseudo) {
      const ps = getComputedStyle(el, "::after");
      for (const p of PSEUDO) out[key + "::after " + p] = ps.getPropertyValue(p);
    }
    if (o.flushRight && innerWidth > 760) {
      const r = el.getBoundingClientRect(), pr = el.parentElement.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(el.parentElement).paddingRight);
      out[key + " ▸오른쪽 끝"] = Math.abs(pr.right - pad - r.right) < 1 ? "붙음" : "안 붙음";
    }
  };
  for (const [name, sel, opt] of ${JSON.stringify(pairs)}) {
    const o = opt || {};  /* JSON이 undefined를 null로 바꿔 기본값이 안 먹는다 */
    const els = [...document.querySelectorAll(sel)];
    if (!els.length) { missing.push(name + "  ← " + sel); continue; }
    (o.all ? els : els.slice(0, 1)).forEach((el, i) => read(o.all ? name + "#" + (i + 1) : name, el, o));
    if (o.all) out[name + " ▸개수"] = String(els.length);
  }
  /* 구조: 푸터 자식 순서와 링크 여부. 목적지는 화면마다 달라(시안은 해시) 따로 찍는다 */
  const root = document.querySelector(${JSON.stringify(pairs[0][1])});
  if (root) out["▸구조"] = [...root.children].map((c) =>
    c.tagName.toLowerCase() + (c.hasAttribute("href") ? "[href]" : "") + ":" + c.textContent.trim().slice(0, 12)).join(" · ");
  const hrefs = root ? [...root.querySelectorAll("a")].map((a) => a.textContent.trim() + " → " + a.getAttribute("href")) : [];
  return { out, missing, hrefs };
})()`;

async function hoverValues(p, sel) {
  await p.hover(sel);
  const v = await p.eval(`(() => {
    const cs = getComputedStyle(document.querySelector(${JSON.stringify(sel)}));
    return { color: cs.color, "text-decoration-line": cs.textDecorationLine };
  })()`);
  await p.hover();
  return Object.fromEntries(Object.entries(v).map(([k, val]) => [`a:hover ${k}`, val]));
}

/* 구현이 시즌 푸터를 그리는가 */
{
  const mode = await withPage(async (p) => {
    await p.goto(IMPL_URL);
    return p.eval('document.querySelector(\'footer[class*="__pubFoot"]\') ? "season" : "pre"');
  });
  if (mode !== "season") {
    console.error("\n구현이 사전 신청 푸터를 그린다 — dev 시즌이 모집 전이다. 개발 바 페이즈를 모집 중 이후로 바꾸고 다시 돌린다.\n");
    process.exit(1);
  }
}

const pickRecruit = `(() => {
  const sec = document.getElementById("scr-landing");
  sec.querySelector('.sb[data-set="recruit"]').click();
  return sec.dataset.state;
})()`;

let total = 0;
for (const w of WIDTHS) {
  const spec = await withPage(async (p) => {
    await p.goto(SPEC_URL);
    if ((await p.eval(pickRecruit)) !== "recruit") throw new Error("시안 상태 전환 실패");
    await p.stripViewerShell();
    await p.resize(w, 1000);
    const r = await p.eval(probe(PAIRS.map(([n, s, , o]) => [n, s, o])));
    r.text = await p.eval(textNodes(F));
    Object.assign(r.out, await hoverValues(p, F + " > a"));
    return r;
  });
  const impl = await withPage(async (p) => {
    await p.goto(IMPL_URL);
    await p.resize(w, 1000);
    const r = await p.eval(probe(PAIRS.map(([n, , i, o]) => [n, i, o])));
    r.text = await p.eval(textNodes("footer"));
    await p.eval('document.querySelector("footer").scrollIntoView({ behavior: "instant" })');
    await p.shot(`${OUT}/impl-${w}.png`);
    Object.assign(r.out, await hoverValues(p, "footer > a"));
    return r;
  });

  console.log(`\n\n████ 폭 ${w}`);
  for (const m of spec.missing) console.log(`  ⚠️ 시안에서 못 찾음: ${m}`);
  for (const m of impl.missing) console.log(`  ⚠️ 구현본에서 못 찾음: ${m}`);
  total += spec.missing.length + impl.missing.length;
  total += diffTable(`${w}px — 푸터`, spec.out, impl.out);
  total += diffText(spec.text, impl.text, { label: "푸터" });
  if (w === WIDTHS[0]) console.log("  구현 링크 목적지:\n    " + impl.hrefs.join("\n    "));
}
console.log(`\n═══════════════════════════\n세 폭 합계 불일치 ${total}건`);
console.log(`스크린샷: ${OUT}`);
