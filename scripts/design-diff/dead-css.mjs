/*
  **아무 요소도 잡지 못하는 CSS 규칙을 찾는다.**

  CSS 모듈에서 `.a .b`라고 쓰면 둘 다 **그 파일의 해시**를 받는다. `.b`가
  다른 모듈이 소유한 클래스(Button의 `.btn`, Surface의 `.card`, Badge의
  `.badge`)면 그 규칙은 영원히 아무것도 안 잡는다. 브라우저는 오류를 내지
  않고 값도 그대로라, 값만 보는 대조는 0건이라고 말한다.

  이 리포에서 **다섯 번** 밟았다.
    `.stat .score` · `.sso .btn` · `.table .team` · `.ctas .btn` ·
    `.liveCap .badge` · `.formRow .btn` · `.three .card` · `.crit .card`

  그래서 사람 눈에 맡기지 않고 검사로 만든다.

    npm run build && node scripts/design-diff/dead-css.mjs

  ⚠️ **dev 데이터가 화면을 다 그리는 상태여야 한다.** 리더보드가 잠겨 있으면
  표 규칙이 통째로 「안 맞는 것」으로 나온다. 리더보드는 레이스 상태로 두고
  돌린다(픽스처 스크립트의 `race`).

  ⚠️ **잡음이 섞인다.** 상태 클래스(`.done`, `.stLocked`)나 지금 안 그려진
  화면의 규칙은 「안 맞는 것」으로 나오지만 죽은 것이 아니다. 그래서
  판정하지 않고 **목록만 보여준다** — 새로 생긴 줄이 있으면 그것만 확인하면
  된다. 아는 것은 `KNOWN`에 적어 조용히 지나가게 한다.
*/
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { withPage, IMPL_URL } from "./cdp.mjs";

/** 훑을 화면. 로그인 없이 열리는 것만 — 대시보드·어드민은 여기서 못 본다 */
const PAGES = [
  ["랜딩", "/"],
  ["리더보드", "/seasons/season-1/leaderboard"],
  ["로그인", "/login"],
  ["회원가입", "/signup"],
  ["개인정보처리방침", "/privacy"],
  ["규칙", "/rules"],
  ["404", "/this-route-does-not-exist"],
  ["컴포넌트 진열장", "/dev/components"],
];

/*
  이미 확인한 것. 여기 적는 것은 「죽었지만 둔다」가 아니라 **「죽지 않았는데
  이 검사가 못 보는 것」**이다 — 로그인해야 열리는 화면이 대부분이다.
  죽은 규칙을 발견하면 적지 말고 고쳐라.
*/
const KNOWN = [
  /*
    로그인해야 열리는 화면들. 여기서는 훑을 수 없다.
    (대시보드·어드민을 훑으려면 세션이 필요하다 — 나중 일이다.)
  */
  /^\.(appeal|apply|credits|hub|judging|leads|measurement|metrics|notifications|payment|project|settings|sponsors|submit)\./,
  /*
    ⚠️ `StageProgress.tsx`의 `StageTrack`(전체 변형)은 **아무도 안 쓴다.**
    죽은 CSS가 아니라 죽은 컴포넌트다 — 랜딩은 자기 로드맵(`.rm`)을,
    리더보드는 자기 `StageTrack`을 따로 갖고 있다.
    §13 이후 화면이 이 변형을 쓸지 정해지면 그때 지우거나 되살린다.
  */
  /* 상태에 따라만 붙는 클래스. 지금 그 상태가 아닐 뿐이다 */
  /^\.StageProgress\.track--full /,
  /*
    ⚠️ `.measuring`은 **재는 동안에만** <html>에 붙는다(`ClauseFit.tsx`).
    절을 한 줄로 펴서 제 너비를 읽고 바로 뗀다 — 화면을 훑는 시점에는 절대
    붙어 있지 않으므로 이 검사에는 영원히 안 잡힌다. 죽은 규칙이 아니다.
  */
  /^\.Clauses\.measuring /,
  /^\.(ProfileFields|DevBar)\./,
  /^\.ConsentFields\.labelInvalid/,
  /^\.Landing\.(in|gate|faq|mqTrack|crit li)/,
  /^\.Field\.sw /,
  /^\.leaderboard\.(done|empty|emptyBig) /,
  /^\.DocPage\.doc \.DocPage\.em$/,
];

function latestCss() {
  const dir = ".next/static/chunks";
  return readdirSync(dir)
    .filter((f) => f.endsWith(".css"))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .slice(0, 8);
}

/** 조상 결합자가 있고 상태 의사클래스가 없는 셀렉터만 모은다 */
function selectors() {
  const out = new Set();
  for (const f of latestCss()) {
    /* ⚠️ `@keyframes NAME { … }`의 이름 줄이 셀렉터로 잡힌다. 통째로 지운다 */
    const css = readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/@(-webkit-)?keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}/g, "");
    for (const m of css.matchAll(/([^{}@]+)\{/g)) {
      for (const part of m[1].split(",")) {
        const p = part.trim();
        if (!p.includes("-module__")) continue;
        /* @keyframes 안의 `0%`·`from` 같은 것은 셀렉터가 아니다 */
        if (/^(from|to|[\d.]+%|@)/.test(p)) continue;
        if (!/[\s>+~]/.test(p)) continue;
        if (/:(hover|focus|active|disabled|checked|not|is|where|global|last|first|nth)/.test(p))
          continue;
        out.add(p);
      }
    }
  }
  return [...out];
}

const pretty = (s) => s.replace(/-module__[\w-]+__/g, ".");

const SELS = selectors();
if (SELS.length === 0) {
  console.error(
    "컴파일된 CSS를 찾지 못했다. 먼저 `npm run build`를 돌려라 —\n" +
      "이 검사는 .next/static/chunks/*.css 를 읽는다(개발 서버의 것이 아니다).",
  );
  process.exit(1);
}

const alive = new Set();
for (const [, url] of PAGES) {
  await withPage(async (p) => {
    await p.goto(IMPL_URL + url);
    await p.resize(1440);
    const found = await p.eval(`(() => {
      const S = ${JSON.stringify(SELS)};
      return S.filter((s) => {
        try { return document.querySelector(s) } catch { return true }
      });
    })()`);
    for (const s of found) alive.add(s);
  });
}

const dead = SELS.filter((s) => !alive.has(s))
  .map(pretty)
  .filter((s) => !KNOWN.some((re) => re.test(s)))
  .sort();

console.log(`조상 규칙 ${SELS.length}개 · 어느 공개 화면에서도 안 맞는 것 ${dead.length}개\n`);
for (const s of dead) console.log("  " + s);
if (dead.length) {
  console.log(
    "\n⚠️ 각각 확인하라. 상태 클래스나 여기서 안 여는 화면이면 KNOWN에 적고,\n" +
      "   다른 모듈의 클래스를 조상 뒤에 쓴 것이면 자식 셀렉터로 고쳐라.",
  );
}
