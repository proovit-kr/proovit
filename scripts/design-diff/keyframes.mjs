/*
  **없는 애니메이션을 가리키는 자리를 찾는다.**

  CSS 모듈은 `animation` 이름을 선택자와 똑같이 해싱한다. 그래서 모듈에서
  `animation: blink`라고만 쓰면 `그모듈-module__해시__blink`가 되고, 그
  `@keyframes`가 **같은 파일 안에** 없으면 아무 데도 안 닿는다.

  globals.css에 `@keyframes blink`가 있어도 소용없다. 브라우저는 오류를 내지
  않고 값도 그대로라, 값만 보는 대조는 0건이라고 말한다 — 화면만 안 움직인다.
  (리더보드의 「LIVE LEADERBOARD」 커서가 그렇게 멈춰 있었다. 2026-09-06)

    node scripts/design-diff/keyframes.mjs

  ⚠️ `.a .b` 해시 함정(dead-css.mjs)과 같은 종류다. 그쪽은 「안 맞는 선택자」,
  이쪽은 「없는 keyframes」다.

  ⚠️ 브라우저가 실제로 계산한 `animation-name`을 본다. 소스를 읽는 방식으로는
  해싱 뒤의 이름을 알 수 없다.
*/
import { withPage, IMPL_URL } from "./cdp.mjs";

const PAGES = [
  ["랜딩", "/"],
  ["리더보드", "/seasons/season-1/leaderboard"],
  ["로그인", "/login"],
  ["회원가입", "/signup"],
  ["개인정보처리방침", "/privacy"],
  ["규칙", "/rules"],
  ["컴포넌트 진열장", "/dev/components"],
];

/** 스크롤로만 붙는 것이 있어 끝까지 내렸다 돌아온다 */
const SCROLL = `(async () => {
  const h = document.documentElement.scrollHeight;
  for (let y = 0; y < h; y += 700) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 60));
  }
  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 300));
  return 1;
})()`;

const CHECK = `(() => {
  const defined = new Set();
  for (const sheet of document.styleSheets) {
    let rules;
    /* 다른 출처의 시트는 못 읽는다. 우리 것만 보면 된다 */
    try { rules = sheet.cssRules } catch { continue }
    for (const r of rules || []) {
      if (r.type === CSSRule.KEYFRAMES_RULE) defined.add(r.name);
    }
  }
  const seen = new Set(), bad = [];
  const look = (el, pseudo) => {
    const nm = getComputedStyle(el, pseudo).animationName;
    if (!nm || nm === "none") return;
    for (const one of nm.split(",").map((s) => s.trim())) {
      if (one === "none" || defined.has(one)) continue;
      const key = one + "|" + (pseudo || "");
      if (seen.has(key)) continue;
      seen.add(key);
      bad.push({
        이름: one.replace(/-module__[\\w-]+__/g, " → "),
        자리: (el.tagName || "?").toLowerCase() + (pseudo || "") +
          " ." + String(el.className).replace(/-module__[\\w-]+__/g, ".").slice(0, 44),
      });
    }
  };
  for (const el of document.querySelectorAll("*")) {
    look(el, null); look(el, "::before"); look(el, "::after");
  }
  return { 정의: defined.size, 없는것: bad };
})()`;

let total = 0;
for (const [name, url] of PAGES) {
  const r = await withPage(async (p) => {
    await p.goto(IMPL_URL + url);
    await p.resize(1440, 1000);
    await p.eval(SCROLL, true);
    return p.eval(CHECK);
  });
  console.log(`── ${name}: keyframes ${r.정의}개 · 없는 이름을 가리키는 자리 ${r.없는것.length}곳`);
  for (const b of r.없는것) console.log(`   ${b.이름}  @  ${b.자리}`);
  total += r.없는것.length;
}

console.log(
  total
    ? `\n⚠️ ${total}곳. 그 모듈 안에 @keyframes를 넣어라 —\n` +
        "   globals.css에 있는 것은 모듈에서 못 쓴다(이름이 해싱된다)."
    : "\n없는 애니메이션을 가리키는 자리 없음 ✓",
);
