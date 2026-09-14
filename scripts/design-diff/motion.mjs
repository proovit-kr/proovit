/*
  **동작 줄이기에서 멈추지 않는 애니메이션을 찾는다.**

  `prefers-reduced-motion: reduce`는 어지럼증·전정기관 장애가 있는 사람이
  켜는 접근성 설정이다. 켜 두었는데 화면이 계속 움직이면 쓸 수 없는 화면이
  된다.

  ## 왜 검사가 필요한가

  예전에는 `globals.css`가 `*`에 일괄로 `animation-duration: 0.01ms`를 눌러
  전부 껐다. 빠뜨릴 일이 없는 대신 **전이(transition)까지 죽여서** 시안보다
  과했다 — 시안은 기능마다 `animation: none`만 끄고 전이는 남긴다. 모션
  감축의 취지는 「움직임을 줄이는 것」이지 「모든 변화를 없애는 것」이 아니고,
  끄면 버튼이 툭툭 바뀌어 오히려 거칠어진다.

  그래서 일괄 규칙을 걷어내고 모듈마다 직접 끄는 시안 방식으로 돌아갔다.
  **대신 빠뜨릴 수 있게 됐다.** 이 검사가 그 자리를 메운다.

    node scripts/design-diff/motion.mjs

  ⚠️ 전이는 세지 않는다. 남기는 것이 맞기 때문이다 — 애니메이션만 본다.
*/
import { withPage, IMPL_URL } from "./cdp.mjs";

const PAGES = [
  ["랜딩", "/"],
  ["리더보드", "/seasons/season-1/leaderboard"],
  ["로그인", "/login"],
  ["회원가입", "/signup"],
  ["개인정보처리방침", "/privacy"],
  ["규칙", "/rules"],
  ["404", "/this-route-does-not-exist"],
  ["참가팀 주소 404", "/team-not-found"],
];

/** 스크롤로만 켜지는 것이 있어 끝까지 내렸다가 돌아온다 */
const SCROLL = `(async () => {
  const h = document.documentElement.scrollHeight;
  for (let y = 0; y < h; y += 600) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 60));
  }
  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 400));
  return 1;
})()`;

const RUNNING = `(() => {
  const out = [];
  for (const a of document.getAnimations()) {
    /* 전이는 남기는 것이 맞다. 애니메이션만 센다 */
    if (!a.animationName) continue;
    const t = a.effect?.target;
    out.push({
      이름: a.animationName.replace(/^.*__/, ""),
      요소: t
        ? (t.tagName || "?").toLowerCase() +
          "." + String(t.className || "").replace(/-module__[\\w-]+__/g, ".").slice(0, 44)
        : "(의사요소)",
    });
  }
  return out;
})()`;

let total = 0;
for (const [name, url] of PAGES) {
  const running = await withPage(async (p) => {
    await p.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await p.goto(IMPL_URL + url);
    await p.resize(390, 844);
    await p.eval(SCROLL, true);
    return p.eval(RUNNING);
  });

  console.log(`── ${name}: 동작 줄이기에서 계속 도는 애니메이션 ${running.length}개`);
  for (const r of running) console.log(`   ${r.이름}  ${r.요소}`);
  total += running.length;
}

console.log(
  total
    ? `\n⚠️ ${total}개. 그 모듈의 @media (prefers-reduced-motion: reduce) 블록에\n` +
        "   `animation: none !important`를 추가하라."
    : "\n동작 줄이기에서 도는 애니메이션 없음 ✓",
);
