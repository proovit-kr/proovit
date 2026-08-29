/*
  랜딩 — 시안 `#scr-landing`과 `/`를 대조한다.

  ⚠️ 시안 쪽은 `stripViewerShell()`로 뷰어 크롬을 걷어낸 뒤 잰다. 사이드바가
  콘텐츠 폭을 먹으면 그리드·줄바꿈이 전부 어긋난다.

  ⚠️ 애니메이션이 많다. `animation-name`·`animation-duration`은 보지만
  진행 중인 프레임 값(transform, opacity)은 보지 않는다 — 잴 때마다 다르다.
  리빌은 양쪽 다 화면 밖에서 시작하므로, 재기 전에 끝까지 스크롤해서
  전부 `.in`이 되게 만든다.

    node scripts/design-diff/landing.mjs
*/
import { withPage, diffTable, SPEC_URL, IMPL_URL, WIDTHS, shotDir } from "./cdp.mjs";

const OUT = shotDir("landing");

const CSS = [
  "font-size", "font-weight", "line-height", "letter-spacing",
  "color", "background-color", "background-image", "background-size",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "border-radius", "box-shadow", "gap", "display", "align-items",
  "grid-template-columns", "max-width", "text-align",
  /* ⚠️ min-width는 빼 둔다. 우리는 `.page`(플렉스 컬럼) 안이라 플렉스 아이템이
     되어 `auto`가 나오고, 시안의 `.ld`는 그냥 블록이라 `0px`이 나온다.
     레이아웃 껍데기 차이지 디자인 차이가 아니다. */
  "border-top-width", "border-top-style", "border-top-color",
  "border-bottom-width", "border-left-width",
  "animation-name", "animation-duration", "animation-iteration-count",
  "overflow-x", "overflow-y", "position", "z-index", "mix-blend-mode", "opacity",
];

/*
  [이름, 시안 셀렉터, 구현본 CSS Module 클래스명]

  구현본은 클래스가 해시돼 있지만 이름이 그 안에 남는다
  (`Landing-module__a1b2__ctas`). 그래서 **끝이 `__<이름>`인 클래스**를 가진
  첫 요소를 집는다. 위치 기반 셀렉터를 쓰면 Reveal 래퍼가 하나 낀 순간
  전부 어긋난다 — 실제로 처음에 그렇게 틀렸다.
*/
const S = "#scr-landing ";
const PAIRS = [
  ["ld", S + ".ld", "ld"],
  ["hero", S + ".ld-hero", "hero"],
  ["h1", S + ".ld-hero h1", "title"],
  ["sub", S + ".ld-hero .sub", "sub"],
  ["ctas", S + ".ld-ctas", "ctas"],
  ["form", S + ".ld-form", "form"],
  ["form fh", S + ".ld-form .fh", "formHead"],
  /* 동의 블록. §4에서 빠뜨렸다가 17개 속성이 어긋난 채로 나갔다 */
  ["consents", S + ".ld-form .consents", '[class*="ConsentFields-module"][class*="root"]'],
  ["consent row", S + ".ld-form .consents label", '[class*="ConsentFields-module"][class*="row"]'],
  ["consent box", S + ".ld-form .consents input", '[class*="ConsentFields-module"][class*="checkbox"]',
    ["accent-color", "width", "height", "appearance"], ["font-size","line-height","color","letter-spacing"]],
  ["consent req", S + ".ld-form .consents .req", '[class*="ConsentFields-module"][class*="tagRequired"]'],
  /* 「보기」 — 시안은 첫 항목에만, 라벨 글자 뒤 공백 하나 */
  /*
    ⚠️ display는 비교하지 않는다. 시안의 「보기」는 `<a>`(inline)지만 우리는
    이동이 아니라 펼침이라 `<button>`을 쓴다. Chrome은 버튼을 항상
    inline-block으로 블록화해서 `display:inline`을 줘도 안 내려간다.
    폭·가로 위치·세로 중심은 같고(18.88px / 0.95px / 0.35px 이내), 배경도
    테두리도 없어 화면에 드러나지 않는다. 접근성을 값 하나와 바꾸지 않는다.
  */
  ["consent 보기", S + ".ld-form .consents a.mono", '[class*="ConsentFields-module"][class*="toggle"]',
    ["font-family"], ["display", "text-align"]],
  ["live", S + ".ld-live", "live"],
  ["live cap", S + ".ld-live .cap", "liveCap"],
  ["slot", S + ".ld-live .slot", "slot"],
  ["slot bar", S + ".ld-live .slot .bar", "slotBar"],
  ["slot rk", S + ".ld-live .slot .rk", "slotRank"],
  ["live ex", S + ".ld-live .ex", "liveNote"],
  ["stats", S + ".ld-stats", "stats"],
  ["stat score", S + ".ld-stat .score", "@stat .score"],
  ["mq", S + ".mq", "mq"],
  ["mq track", S + ".mq-track", "mqTrack"],
  ["sec", S + ".ld-sec", "sec"],
  ["eyebrow", S + ".ld-eb", "eyebrow"],
  ["h2", S + ".ld-sec h2", "secTitle"],
  ["sec lead", S + ".ld-sec .ss", "secLead"],
  ["cmp", S + ".ld-cmp", "cmp"],
  ["pv", S + ".ld-cmp .pv", "pv"],
  ["rm-wrap", S + ".rm-wrap", "rmWrap"],
  ["rm", S + ".rm", "rm"],
  ["rm-line", S + ".rm-line", "rmLine"],
  ["rm-fill", S + ".rm-fill", "rmFill"],
  /* 러너 도트는 8초 주기로 opacity가 0↔1을 오간다. 재는 순간마다 다르므로
     「돌고 있는가」만 본다(animation-play-state). */
  ["rm-run", S + ".rm-run", "rmRun", ["animation-play-state"], ["opacity"]],
  ["rm-grid", S + ".rm-grid", "rmGrid"],
  ["rm-stop", S + ".rm-stop", "rmStop"],
  ["rm-node", S + ".rm-node", "rmNode"],
  ["rm-t", S + ".rm-t", "rmT"],
  ["rm-w", S + ".rm-w", "rmW"],
  ["rm-d", S + ".rm-d", "rmD"],
  ["rm-legend", S + ".rm-legend", "rmLegend"],
  ["three", S + ".ld-3", "three"],
  ["three n", S + ".ld-3 .n", "threeNo"],
  ["crit", S + ".ld-crit", "crit"],
  ["crit rd", S + ".ld-crit .rd", "critRound"],
  ["spec", S + ".ld-spec", "spec"],
  ["faq", S + ".ld-faq", "faq"],
  ["faq a", S + ".ld-faq .a", "a"],
  ["fin", S + ".ld-fin", "fin"],
  ["fin h2", S + ".ld-fin h2", "finTitle"],
  ["glitch h1", S + ".ld-hero h1 .glitch", "#hero h1 span[data-text]"],
  /* 랜딩 헤더의 워드마크에도 글리치가 붙는다 — 시안 공개 화면 중 여기만 그렇다 */
  ["glitch wm", S + ".pub-head .wm.glitch", "header > a:first-child"],
];

const probe = (pairs) => `(() => {
  const CSS = ${JSON.stringify(CSS)};
  const out = {}, missing = [];

  /*
    글리치는 3.6초마다 460ms 동안 터진다. 재는 순간의 위상이 매번 달라
    opacity·transform·animation-name이 그때그때 다르게 나온다. 재기 **직전에**
    정지 상태로 맞춘다 — settle에서 지우면 시안의 인터벌이 다시 붙인다.
    터질 때의 모습은 keyframes 값으로 이미 같다.
  */
  document.querySelectorAll("[class*=glitch]").forEach((e) =>
    [...e.classList]
      .filter((c) => c === "on" || c.endsWith("__on"))
      .forEach((c) => e.classList.remove(c)));

  /* 구현본은 이름으로, 시안은 셀렉터로 집는다 */
  const byModuleName = (n) => [...document.querySelectorAll('[class*="__' + n + '"]')]
    .find(el => [...el.classList].some(c => c.endsWith("__" + n)));

  for (const [name, sel, mode, extra, skip] of ${JSON.stringify(pairs)}) {
    const el = mode === "impl" && !/[ .#>\[]/.test(sel)
      ? byModuleName(sel)
      : document.querySelector(
          mode === "impl" ? sel.replace(/@([A-Za-z]+)/g, (_, n) => '[class*="__' + n + '"]') : sel,
        );
    if (!el) { missing.push(name + "  ← " + sel); continue; }
    /*
      ⚠️ 의사요소도 잰다. ::before / ::after 가 시안의 연출을 절반쯤 지고
      있다 — 히어로의 네온 격자와 글로우, 전광판의 스캔라인과 스윕,
      섹션 제목의 라임 밑줄, 커서, 글리치가 전부 의사요소다.
      본체만 재면 그것들이 통째로 빠져도 「차이 없음」이 나온다(실제로 그랬다).
    */
    for (const pe of ["::before", "::after"]) {
      const pcs = getComputedStyle(el, pe);
      if (pcs.content === "none") continue;
      for (const p of ["content","position","inset","width","height","z-index",
                       "background-image","background-size","background-color",
                       "opacity","mix-blend-mode","animation-name","animation-duration",
                       "mask-image","transform","border-radius","margin-left","color"]) {
        let v = pcs.getPropertyValue(p);
        if (p === "animation-name") v = v.split(", ").map(n => n.replace(/^.*__/, "")).join(", ");
        /* Lightning CSS가 그라디언트 위치의 0%를 0px로 줄인다. 같은 값이다 */
        if (p.startsWith("background")) v = v.replace(/ 0%/g, " 0px");
        out[name + pe + " " + p] = v;
      }
    }

    /*
      ⚠️ 칠하는 순서도 본다. z-index:-1 의사요소는 스태킹 컨텍스트의 배경
      바로 위에 칠해지고, 그 위를 **일반 블록 자손의 배경**이 덮는다.
      값이 전부 같아도 불투명한 조상이 하나 더 있으면 화면에서는 안 보인다.
      실제로 .page 의 background가 히어로 격자와 body 오로라를 가리고 있었다.
    */
    let opaque = 0;
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const cs2 = getComputedStyle(n);
      if (cs2.backgroundColor !== "rgba(0, 0, 0, 0)" || cs2.backgroundImage !== "none") opaque++;
    }
    out[name + " ▸불투명한 조상 수"] = String(opaque);

    const cs = getComputedStyle(el);
    for (const p of CSS.concat(extra || [])) {
      if ((skip || []).includes(p)) continue;
      if (p.startsWith("border-") && !p.endsWith("width")) {
        /* 폭이 0이면 style·color는 화면에 아무 영향이 없다.
           Tailwind preflight가 모든 요소에 solid를 주는데 시안은 none이라
           여기서만 전부 가짜 불일치로 뜬다. */
        const side = p.split("-")[1];
        if (cs.getPropertyValue("border-" + side + "-width") === "0px") continue;
      }
      let v = cs.getPropertyValue(p);
      /* CSS Module이 @keyframes 이름을 해시한다. 이름만 남겨 비교한다 */
      if (p === "animation-name") v = v.split(", ").map(n => n.replace(/^.*__/, "")).join(", ");
      out[name + " " + p] = v;
    }
  }
  return { out, missing };
})()`;

/* 리빌이 전부 끝나도록 끝까지 훑고 되돌아온다 */
const settle = `(async () => {
  const nap = ms => new Promise(r => setTimeout(r, ms));
  /*
    ⚠️ 먼저 기다린다. 구현본은 React가 하이드레이션을 마쳐야 리빌 관찰자가
    붙는다. 붙기 전에 훑으면 스크롤이 다 지나간 뒤에 관찰이 시작돼서,
    화면 밖 요소는 영영 나타나지 않는다.
  */
  await nap(700);
  const h = () => document.documentElement.scrollHeight;
  for (let y = 0; y <= h(); y += 300) { window.scrollTo(0, y); await nap(24); }
  await nap(300);
  window.scrollTo(0, 0);
  await nap(1200);

  /*
    ⚠️ 시안 쪽 리빌을 끝 상태로 못박는다.

    시안의 IntersectionObserver는 root를 #stage로 잡아 만들어지는데, 우리가
    뷰어 셸을 걷어내면서 #stage가 스크롤 컨테이너가 아니게 되어 관찰이
    더 이상 발화하지 않는다. 그대로 두면 시안의 파이널 섹션만 영영
    opacity:0으로 남아 가짜 불일치가 된다.

    **정지 상태를 비교하는 것이 목적이다.** 리빌이 실제로 어떻게 움직이는지는
    .rv 의 transition·transform·delay 값으로 이미 대조된다.
  */
  document.querySelectorAll(".rv").forEach((e) => e.classList.add("in"));
  document.querySelectorAll(".rm").forEach((e) => e.classList.add("in"));
  await nap(1000);
  return 1;
})()`;

let total = 0;
for (const w of WIDTHS) {
  const spec = await withPage(async (p) => {
    await p.goto(SPEC_URL);
    await p.stripViewerShell();
    await p.resize(w, 1000);
    await p.eval(settle, true);
    const r = await p.eval(probe(PAIRS.map(([n, s, , x, k]) => [n, s, "spec", x, k])));
    await p.shot(`${OUT}/spec-${w}.png`);
    return r;
  });
  const impl = await withPage(async (p) => {
    await p.goto(IMPL_URL);
    await p.resize(w, 1000);
    await p.eval(settle, true);
    const r = await p.eval(probe(PAIRS.map(([n, , i, x, k]) => [n, i, "impl", x, k])));
    await p.shot(`${OUT}/impl-${w}.png`);
    return r;
  });

  console.log(`\n\n████ 폭 ${w}`);
  for (const m of spec.missing) console.log(`  ⚠️ 시안에서 못 찾음: ${m}`);
  for (const m of impl.missing) console.log(`  ⚠️ 구현본에서 못 찾음: ${m}`);
  total += spec.missing.length + impl.missing.length;
  total += diffTable(`${w}px — 랜딩`, spec.out, impl.out);
}
console.log(`\n═══════════════════════════\n세 폭 합계 불일치 ${total}건`);
console.log(`스크린샷: ${OUT}`);
