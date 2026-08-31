/*
  **한글이 고정폭 글꼴로 그려지는 자리를 찾는다.**

  시안 프롬프트가 「한글에 모노스페이스나 넓은 자간을 절대 걸지 않는다」고
  못박았는데, `--mono` 스택(`JetBrains Mono, SF Mono, Consolas, monospace`)에는
  한글 글리프를 가진 글꼴이 하나도 없다. 그러면 한글은 브라우저의 **기본
  고정폭**으로 떨어지고, 그게 플랫폼마다 다르다.

    맥     Menlo → 없음 → Apple SD Gothic Neo (비례폭, 티가 안 난다)
    윈도우 Consolas → 없음 → **굴림** (고정폭, 자간이 벌어져 확 다르다)

  ⚠️ **맥에서는 눈으로 못 잡는다.** 수연이 윈도우 캡처를 받아 보고서야
  드러났다(로드맵 라벨·마퀴·「보기」·「준비 중」). 그래서 검사로 만든다.

    node scripts/design-diff/korean-font.mjs

  ⚠️ **렌더된 글꼴을 보는 방식으로는 맥에서 못 잡는다.** 맥은 대체가 Apple SD
  Gothic Neo(비례폭)로 떨어져서 결과만 보면 멀쩡하다. 그래서 결과가 아니라
  **선언**을 본다 — 한글이 든 요소의 글꼴 스택에 한글 글꼴이 이름으로 적혀
  있는가. 스택이 한글을 시스템 기본에 맡기고 있으면 그 자체가 문제다.
  이건 어느 플랫폼에서 돌려도 같은 답이 나온다.

*/
import { withPage, IMPL_URL } from "./cdp.mjs";

const PAGES = [
  ["랜딩", "/"],
  ["리더보드", "/seasons/season-1/leaderboard"],
  ["로그인", "/login"],
  ["회원가입", "/signup"],
  ["개인정보처리방침", "/privacy"],
  ["규칙", "/rules"],
];

/*
  한글 글리프를 가진 글꼴. 스택에 이 중 하나가 이름으로 있어야 한다.
  Pretendard는 웹폰트로 실어 보내고(globals.css의 @import), 나머지 둘은
  각 플랫폼의 기본 한글 글꼴이라 마지막 그물이다.
*/
const KOREAN = /Pretendard|Apple SD Gothic Neo|Malgun Gothic|Noto Sans KR|Nanum/i;

let total = 0;
for (const [name, url] of PAGES) {
  const bad = await withPage(async (p) => {
    await p.goto(IMPL_URL + url);
    await p.resize(1440);
    return p.eval(`(() => {
      const KOREAN = ${KOREAN.toString()};
      const seen = new Set(), out = [];
      const walk = (el) => {
        for (const c of el.childNodes) {
          if (c.nodeType === 3 && /[가-힣]/.test(c.textContent)) {
            const stack = getComputedStyle(el).fontFamily;
            if (!KOREAN.test(stack)) {
              const key = stack + "|" + el.className;
              if (!seen.has(key)) {
                seen.add(key);
                out.push({
                  글자: c.textContent.trim().slice(0, 26),
                  스택: stack,
                  요소: String(el.className).replace(/-module__[\w-]+__/g, ".").slice(0, 40),
                });
              }
            }
          } else if (c.nodeType === 1 && getComputedStyle(c).display !== "none") {
            walk(c);
          }
        }
      };
      walk(document.body);
      return out;
    })()`);
  });

  console.log(`── ${name}: 한글 스택에 한글 글꼴이 없는 자리 ${bad.length}곳`);
  for (const b of bad) console.log(`   ${JSON.stringify(b.글자)}  ${b.요소}\n     ${b.스택}`);
  total += bad.length;
}

console.log(
  total
    ? `\n⚠️ ${total}곳. 한글이 시스템 기본 글꼴에 맡겨져 있다 —\n` +
        "   맥은 Apple SD Gothic Neo(비례폭)로 떨어져 멀쩡해 보이지만\n" +
        "   윈도우는 굴림(고정폭)이 되어 자간이 벌어진다."
    : "\n한글 스택에 한글 글꼴이 빠진 자리 없음 ✓",
);
