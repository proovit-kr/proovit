/*
  랜딩 — 시안 `#scr-landing`과 `/`를 대조한다.

  ⚠️ 시안 쪽은 `stripViewerShell()`로 뷰어 크롬을 걷어낸 뒤 잰다. 사이드바가
  콘텐츠 폭을 먹으면 그리드·줄바꿈이 전부 어긋난다.

  ⚠️ 애니메이션이 많다. `animation-name`·`animation-duration`은 보지만
  진행 중인 프레임 값(transform, opacity)은 보지 않는다 — 잴 때마다 다르다.
  리빌은 양쪽 다 화면 밖에서 시작하므로, 재기 전에 끝까지 스크롤해서
  전부 `.in`이 되게 만든다.

    node scripts/design-diff/landing.mjs
    STATE=recruit node scripts/design-diff/landing.mjs   # pre(기본)·recruit·stage·done
*/
import {
  withPage, diffTable, diffText, textNodes,
  SPEC_URL, IMPL_URL, WIDTHS, shotDir,
} from "./cdp.mjs";

const OUT = shotDir(`landing-${process.env.STATE ?? "pre"}`);

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
const ALL_PAIRS = [
  ["ld", S + ".ld", "ld"],
  /*
    ⚠️ `::before`/`::after`의 **inset만** 뺀다. 세 번째 값이 히어로 높이라서다
    (`-40px -20px 699.609px`). 390에서 우리 히어로가 시안보다 한 줄 높다 —
    부제 두 문장을 `Clauses`가 문장 끝에서 끊기 때문이고, 의도한 차이다
    (2026-09-07 수연 지시). 나머지 의사요소 값은 그대로 대조한다.
  */
  ["hero", S + ".ld-hero", "hero", undefined,
   ["::before inset", "::after inset"]],
  /* 히어로 배지. 종료만 회색이고 커서(::after)가 없다 — 의사요소까지 잰다 */
  ["hero 배지", S + ".ld-hero .badge", '#hero [class*="Badge-module"]'],
  ["h1", S + ".ld-hero h1", "title"],
  /* 히어로 안으로 좁힌다. 종료 헤더(P5)는 버튼이 둘이라 NavBar의 `.sub`가 먼저 잡힌다 */
  ["sub", S + ".ld-hero .sub", '#hero p[class*="__sub"]'],
  ["ctas", S + ".ld-ctas", "ctas"],
  /*
    ⚠️ **상자만 재면 안 된다.** `.ld-ctas`의 폭은 양쪽이 같은데 그 안의
    버튼이 시안은 164px씩 폭을 나눠 갖고 우리는 글자 폭(128·134px)만
    차지하고 있었다 — `.ctas .btn`이 다른 모듈의 해시 클래스라 안 먹은
    것이고, 상자 값만 보던 대조는 0건이라고 말했다(수연이 눈으로 잡았다).

    푸터 링크 때와 같은 종류다. **자식이 규칙을 받는 자리는 자식을 재라.**
  */
  ["cta 버튼1", S + ".ld-ctas .btn:first-child", '[class*="__ctas"] > *:first-child', [], ["width"]],
  ["cta 버튼2", S + ".ld-ctas .btn:last-child", '[class*="__ctas"] > *:last-child', [], ["width"]],
  ["hint", S + ".ld-hint", "hint"],
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
  ["consent 보기", S + ".ld-form .consents a.see", '[class*="ConsentFields-module"][class*="see"]',
    ["font-family"], ["display", "text-align", "width"]],
  /*
    ⚠️ 의사요소의 높이·inset은 안 본다. 전광판 높이를 따라가는 값인데, 두 열일 때
    안내 문장이 한 줄이라(아래 「live ex」) 시안보다 한 줄 짧다.
  */
  ["live", S + ".ld-live", "live", undefined,
   ["::before inset", "::before height", "::after height"]],
  /* 폼 안의 신청 버튼. 시안이 인라인으로 좁은 여백을 준다 */
  ["신청 버튼", S + ".ld-form .row .btn", '[class*="__formRow"] > *:last-child'],
  ["live cap", S + ".ld-live .cap", "liveCap"],
  /* 상자만 재면 안의 뱃지가 왼쪽에 붙어 있어도 통과한다(실제로 그랬다) */
  /*
    ⚠️ `margin-left`를 비교하지 않는다. `auto`라 **뱃지 자신의 폭**에서
    거꾸로 계산되는데, 한글이 시안은 시스템 대체 글꼴로 우리는 Pretendard로
    그려져 0.03px 어긋난다(`korean-font.mjs`가 그 이유다).
    「오른쪽 끝에 붙었는가」가 여기서 볼 것이고, 그건 아래 ▸오른쪽 끝이 잰다.
  */
  ["live 뱃지", S + ".ld-live .cap .badge", '[class*="__liveCap"] > *:last-child',
   [], ["width", "margin-left"]],
  ["slot", S + ".ld-live .slot", "slot"],
  ["slot bar", S + ".ld-live .slot .bar", "slotBar"],
  ["slot rk", S + ".ld-live .slot .rk", "slotRank"],
  /* 점수 칸은 전역 `.score`(모노·800)를 함께 받는다. 빠져 있던 것을 09-19 진행 중 작업에서 잡았다 */
  ["slot score", S + ".ld-live .slot .score", "slotScore"],
  /* LIVE 슬롯에만 있는 것들 — 진행 중·종료의 순위와 모집 전·모집 중의 예시 순위 */
  ["slot nm", S + ".ld-live .slot .nm", "slotName", ["width", "text-overflow", "white-space", "overflow-x"]],
  /* 폭은 안 본다. 막대 칸이 점수 글자 폭을 뺀 나머지라 데이터(팀명·점수)를 따라간다 */
  ["slot bar i", S + ".ld-live .slot .bar i", '[class*="__slotBar"] > i', ["top", "bottom", "left"]],
  ["slot 마지막", S + ".ld-live .slot:last-of-type", '[class*="__slotLive"]:last-of-type'],
  /* 자간은 모집 전·모집 중(-0.02em)·진행 중(-0.05em)에 안 본다. 두 열일 때 한 줄에 담으려고 좁혔다(2026-09-19 수연 결정) */
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
  /*
    ⚠️ 03 BENEFITS·04 WHY는 값을 대조하지 않는다. 시안은 번호 붙은 카드 셋(`.ld-3`)인데
    카드가 너무 많다는 QA 의견으로 상자를 걷고 선으로만 나눴다(2026-10-03, 수연 전달.
    `Landing.tsx`의 03·04 주석). 짝이 없어 글자만 본다 — 카드 번호(01~03)는 아래
    `TEXT_IGNORE`의 숫자 규칙에 걸려 시안에만 있어도 안 잡힌다.
  */
  ["crit", S + ".ld-crit", "crit"],
  ["crit 카드", S + ".ld-crit .card", '[class*="__crit"] > *', [], ["width", "height"]],
  ["crit rd", S + ".ld-crit .rd", "critRound"],
  ["spec", S + ".ld-spec", "spec"],
  ["faq", S + ".ld-faq", "faq"],
  /*
    ⚠️ `max-width`를 뺀다. 시안은 44em(660px), 우리는 58em(870px)이다 —
    일부러 넓혔다(2026-09-07 수연 지시). 660px에서는 답 하나만 두 줄로 접혀
    오른쪽 380px이 비었다. 이유는 `Landing.module.css`의 `.faq .a`에 적어 뒀다.
  */
  ["faq a", S + ".ld-faq .a", "a", undefined, ["max-width"]],
  ["fin", S + ".ld-fin", "fin"],
  ["fin h2", S + ".ld-fin h2", "finTitle"],
  ["glitch h1", S + ".ld-hero h1 .glitch", "#hero h1 span[data-text]"],
  /* 랜딩 헤더의 워드마크에도 글리치가 붙는다 — 시안 공개 화면 중 여기만 그렇다 */
  /*
    ⚠️ 크기는 안 본다. 모바일 워드마크 16px은 헤더 상태별 시안(192행)의 값이고
    헤더는 그 시안이 정본이다 — ver4 본 시안에는 모바일 규칙이 없어 18px로 남는다.
    크기는 `header-states.mjs`가 대조한다. 여기서는 글리치만 본다.
  */
  ["glitch wm", S + ".pub-head .wm.glitch", "header > a:first-child", undefined,
   ["font-size", "line-height", "letter-spacing",
    "::before width", "::before height", "::after width", "::after height"]],
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
    /*
      ⚠️ 보이는 것을 먼저 집는다. 시안은 네 상태의 배지·CTA를 전부 그려 두고
      only-*로 가린다 — 첫 매치를 집으면 모집 중에도 모집 전 CTA를 잰다.
    */
    const firstShown = (s) => {
      const all = [...document.querySelectorAll(s)];
      return all.find((e) => e.getClientRects().length) ?? all[0] ?? null;
    };
    const el = mode === "impl" && !/[ .#>\[]/.test(sel)
      ? byModuleName(sel)
      : firstShown(
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
        if ((skip || []).includes(pe + " " + p)) continue;
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

    /*
      margin-left:auto 가 실제로 오른쪽 끝까지 밀었는가. 계산값은 요소의
      폭에서 거꾸로 나오므로 글꼴이 조금만 달라도 어긋난다 — 뜻을 직접 잰다.
      (⚠️ 이 주석은 프로브 문자열 안이라 백틱을 쓸 수 없다)
    */
    if (name.includes("뱃지")) {
      const r = el.getBoundingClientRect();
      const pr = el.parentElement.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(el.parentElement).paddingRight);
      out[name + " ▸오른쪽 끝"] =
        Math.abs(pr.right - pad - r.right) < 1 ? "붙음" : "안 붙음";
    }

    /*
      ⚠️ 그리드·플렉스 컨테이너면 자식들의 높이가 서로 같은지 본다.
      시안은 카드가 곧 그리드 아이템이라 stretch로 키가 맞는데, 래퍼를 하나
      끼우면 그 래퍼만 늘어나고 카드는 내용만큼만 커진다 — 값은 전부 같아도
      화면에서는 카드 셋의 키가 어긋난다(03 BENEFITS에서 실제로 그랬다).
    */
    const disp = getComputedStyle(el).display;
    if (disp === "grid" || disp === "flex") {
      /* 숨은 칸(시안의 다른 상태 only-*)은 높이 0이라 뺀다 */
      const hs = [...el.children]
        .filter((c) => getComputedStyle(c).display !== "none")
        .map((c) => Math.round(c.getBoundingClientRect().height));
      out[name + " ▸자식 높이 같음"] =
        hs.length > 1 ? String(new Set(hs).size === 1) : "해당없음";
    }

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
  /*
    ⚠️ 한 칸에 충분히 머문다. IntersectionObserver의 콜백은 프레임 뒤에
    비동기로 배달되는데, 24ms 간격으로 훑으면 배달되기 전에 이미 지나가서
    화면 밖 요소가 영영 안 나타난다(파이널 제목이 그랬다).
  */
  const h = () => document.documentElement.scrollHeight;
  /*
    ⚠️ 즉시 스크롤한다. 페이지에 부드러운 스크롤이 걸려 있어 그냥 scrollTo는
    애니메이션으로 따라가고, 긴 페이지(768)에서는 훑기가 끝나도 바닥에 못 닿아
    파이널이 「안 나타남」으로 잡혔다.
  */
  const go = (top) => window.scrollTo({ top, behavior: "instant" });
  for (let y = 0; y <= h(); y += 400) { go(y); await nap(90); }
  await nap(500);
  go(0);
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
  /*
    양쪽 다 리빌을 끝 상태로 못박는다. **정지 상태를 비교하는 것이 목적**이고,
    리빌이 실제로 어떻게 움직이는지는 rv 의 transition·transform·delay 값으로
    이미 대조된다.

    시안: 관찰자가 root를 #stage로 잡는데 뷰어 셸을 걷어내면 발화하지 않는다.
    구현: CSS Module이라 클래스가 해시돼 있다. __rv 로 끝나는 클래스에서
          모듈 접두사를 얻어 같은 모듈의 __in 을 만든다.

    자연 리빌이 실제로 도는지는 아래 naturally 수치로 따로 본다 —
    못박기 **전에** 세므로 스크롤만으로 다 나타났는지가 그대로 드러난다.
  */
  const hashed = [...document.querySelectorAll('[class*="__rv"]')];
  const isIn = (e) => [...e.classList].some((c) => c === "in" || c.endsWith("__in"));
  const plain = [...document.querySelectorAll(".rv")];
  const all = plain.length ? plain : hashed;
  const naturally = all.filter(isIn).length + "/" + all.length;

  plain.forEach((e) => e.classList.add("in"));
  document.querySelectorAll(".rm").forEach((e) => e.classList.add("in"));
  for (const [sel, suffix] of [["__rv", "__in"], ["__rm", "__in"]]) {
    const els = [...document.querySelectorAll('[class*="' + sel + '"]')];
    const own = els[0] && [...els[0].classList].find((c) => c.endsWith(sel));
    if (!own) continue;
    const inClass = own.slice(0, -sel.length) + suffix;
    els.forEach((e) => e.classList.add(inClass));
  }
  await nap(1000);
  return naturally;
})()`;

/*
  ⚠️ 글자 대조. 공용 `textNodes`·`diffText`가 cdp.mjs에 있다.
  데이터가 정하는 것만 뺀다 — 스탯 줄의 참가팀 수(진행 중·종료) 하나뿐이다.
*/
const TEXT_IGNORE = [
  /^\d+$/,
  /*
    ⚠️ FAQ 「코딩을 못 해도 되나요?」의 답. 시안은 「AI 빌더와」, 우리는 「AI와」다
    — **일부러 바꿨다**(2026-09-07 수연 지시). 제출 폼의 「빌더」는 배포처까지
    포함해서(`submission.ts`의 `BUILDERS`) 랜딩이 쓰던 「AI 빌더」보다 넓다.
    같은 말이 두 곳에서 범위가 달라, 좁은 쪽을 지웠다.
    시안이 갱신되면 이 줄을 지운다.
  */
  /*
    ⚠️ **구현 쪽은 조각으로 잡힌다.** `Clauses`가 문장을 절로 쪼개 각각
    텍스트 노드가 되기 때문이다. 시안은 통짜 문장이라 양쪽 형태를 다 적는다.
    (조각이 시안 문장의 부분 문자열이면 `diffText`가 알아서 맞춰 준다 —
    여기 적는 것은 **문구를 바꾼** 절뿐이다.)
  */
  /^네, AI 빌더와 스텝별 가이드로 첫 서비스를 완성할 수 있어요\.$/,
  /^AI와 스텝별 가이드로 첫 서비스를 완성할 수 있어요\.$/,
  /*
    ⚠️ FAQ 질문 둘도 일부러 바꿨다(2026-09-07, 동혁 QA ★). 답은 둘 다 그대로다.
      · 「지표는 어떻게 검증하나요?」   → 「트래픽을 조작하면 되는 거 아닌가요?」
      · 「상금이 있나요?」             → 「1등은 어떤 혜택을 받나요?」
    뒤엣것은 답까지 바뀌었다 — 없는 상금 대신 받는 것을 말한다.
    시안이 갱신되면 이 셋을 지운다.
  */
  /^(지표는 어떻게 검증하나요|트래픽을 조작하면 되는 거 아닌가요)\?$/,
  /^(상금이 있나요|1등은 어떤 혜택을 받나요)\?$/,
  /^시즌 1은 현금 상금 없이 순위와 시상 결과를 발표해요\..*$/,
  /^최종 리더보드와 시즌 아카이브에 1위 기록이 남고,$/,
  /^프루빗 공식 채널에서 서비스와 팀을 소개해요\.$/,
  /*
    ⚠️ 「1차에서 떨어지면 끝인가요?」의 뒷문장. 시안은 「만든 랜딩과 데이터는
    그대로 남아요」인데 우리가 보관해 주는 것이 아니다 — 같은 날 함께 고쳤다.
  */
  /^아니요, 다음 시즌 재도전을 안내해 드려요\. 만든 랜딩과 데이터는 그대로 남아요\.$/,
  /^리그에서 떨어져도 의미 있는 결과물과 경험이 남아요\.$/,
  /*
    ⚠️ 2026-10-01 동혁 QA에 윤서 수정안. 심사 카드 짝과 POSITION 세 번째 줄.
    시안이 갱신되면 이 셋을 지운다.
  */
  /^(FINAL|ROUND 2)$/,
  /^(출품하면 끝|오프라인 형식)$/,
  /^(시즌이 끝나도 서비스는 남아요|온라인으로 진행되어 제약이 적어요)$/,
];

/*
  랜딩에서만 일부러 바꾼 글자 — 시안 쪽을 바꿔 놓고 견준다(`cdp.mjs`의 `SPEC_RENAMES`와 같은 방식).
  참가비는 「₩0」이 아니라 「FREE」다(2026-10-03 QA 의견, 수연 전달). 스탯 줄과 마퀴 두 자리.
  공용 표에 넣지 않는다 — 크레딧 센터의 「₩0 스타트 스택」은 시안 그대로다.
*/
const TEXT_RENAMES = [
  [/^₩0$/, "FREE"],
  [/^참가비 ₩0$/, "참가비 FREE"],
];

/*
  상태. 시안은 STATE 버튼(`.sb[data-set]`)으로 고르고, 구현은 dev DB의 시즌
  페이즈가 정한다(개발 바의 페이즈 줄). 구현이 지금 어느 상태를 그리는지 먼저
  찍고, 요청한 상태가 아니면 대조하지 않는다 — 다른 상태끼리 견준 0건은 거짓이다.

  헤더 메뉴는 대조 목록에 없다 — 시안은 메뉴를 늘 그리고 우리는 모집 전에
  숨기는 것이 **의도적 차이**라(2026-08-31 수연 지시) 애초에 비교하지 않는다.
*/
const STATE = process.env.STATE ?? "pre";

/*
  상태마다 없는 요소는 대조 목록에서 뺀다. 시안에는 숨은 채로 남아 있어
  「구현본에서 못 찾음」이 되기 때문이다. 시안 규칙 그대로 —
  사전 신청 폼은 only-form(모집 전·종료), 안내 문장은 모집 중·진행 중에만 있다.
*/
const FORM_PAIRS = ["form", "form fh", "consents", "consent row", "consent box",
  "consent req", "consent 보기", "신청 버튼"];
const hasForm = STATE === "pre" || STATE === "done";
const hasHint = STATE === "recruit" || STATE === "stage";
/*
  ⚠️ 폼이 있는 두 상태(모집 전·종료)에는 히어로 버튼 줄이 **없다** — 시안과 일부러
  다르다(2026-10-02 수연 결정, `Landing.tsx` 머리 주석). 시안은 거기에도 CTA 둘을
  두는데 첫 버튼이 바로 아래 폼으로 데려가는 버튼이라 뺐고, 둘째는 제목 둘째 줄
  옆의 글자 링크가 됐다. 시안에 짝이 없어 그 링크는 값을 대조하지 않는다 — 글자만 본다
  (`cdp.mjs`의 `SPEC_RENAMES`). 폼의 위 여백(30px)도 그 줄이 갖던 것을 옮긴 값이다.
*/
const CTA_PAIRS = ["ctas", "cta 버튼1", "cta 버튼2"];
const hasCtas = !hasForm;
/*
  ⚠️ 모집 전·모집 중의 전광판은 시안과 다르다 — 빈 슬롯 대신 예시 순위를 그린다
  (2026-10-02 동혁 QA, 수연 결정). 줄의 생김새는 시안의 진행 중 슬롯 그대로라,
  시안 쪽에서 숨은 LIVE 슬롯을 켜고 빈 슬롯을 꺼서 그것과 견준다(`showSpecLive`).
  팀명·점수도 시안 표본 그대로라 글자까지 맞는다 — 다른 것은 뱃지와 안내 첫
  문장뿐이다. 그래서 LIVE 슬롯 짝(「slot nm」·「slot bar i」·「slot 마지막」)을
  네 상태 모두에서 잰다.
*/
const SAMPLE = STATE === "pre" || STATE === "recruit";
const showSpecLive = `(() => {
  const set = (sel, v) => document.querySelectorAll(sel)
    .forEach((e) => e.style.setProperty("display", v, "important"));
  set("#scr-landing .ld-live .slot.only-wait", "none");
  set("#scr-landing .ld-live .slot.only-live", "flex");
})()`;
/*
  ⚠️ 모집 전·모집 중의 스탯 줄은 **세 칸**이다 — 시안의 넷째 칸 「사전 신청 N명」을 뺐다
  (2026-10-03 QA 의견, 수연 전달. `Landing.tsx`의 `stats`). 그래서 이 두 상태에서는
    · 격자와 글자 정렬을 대조하지 않는다. 한 줄에 셋을 세우고 가운데로 맞춰서
      (2026-10-03 수연) 열과 `text-align`이 시안(4열·좁으면 2열, 왼쪽 정렬)과 다르다.
    · 글자를 긁기 전에 시안의 그 칸을 비운다. 안 비워도 모집 전에는 0건인데 우연이다 —
      「명」은 「증명하라」에, 「사전 신청」은 파이널 버튼에 걸려 맞는다.
  진행 중·종료의 넷째 칸 「참가팀」은 시안 그대로다.
*/
const SPEC_GONE = SAMPLE ? ".ld-stat.only-wait" : null;
/*
  ⚠️ 모집 중·진행 중의 CTA는 시안이 `<a>`라 line-height(body 1.65)와 text-align
  (start)을 물려받아 `<button>`인 모집 전 CTA보다 6.75px 높다. 우리는 두 태그를
  똑같이 그린다(Button.module.css) — 상태가 바뀐다고 같은 자리 버튼 키가 변하지
  않게(2026-09-19, 수연이 맡겨 정함). 파이널 영역 높이도 그 버튼을 따라간다.
*/
const ANCHOR_SKIP = {
  ...(STATE === "recruit" || STATE === "stage"
    ? { "cta 버튼1": ["line-height", "text-align"], "cta 버튼2": ["line-height", "text-align"],
        fin: ["::before height"] }
    : {}),
  /* 버튼 줄이 있던 자리의 간격을 폼이 갖는다(위 `CTA_PAIRS` 주석) */
  ...(hasForm ? { form: ["margin-top"] } : {}),
  /* 세 칸의 격자와 가운데 정렬(위 `SPEC_GONE` 주석). 정렬은 칸 안의 숫자가 물려받는다 */
  ...(SAMPLE
    ? { stats: ["grid-template-columns", "text-align"], "stat score": ["text-align"] }
    : {}),
  /* 진행 중도 같은 이유로 -0.05em이다(2026-09-19 수연 결정) */
  ...(STATE !== "done" ? { "live ex": ["letter-spacing"] } : {}),
};
const PAIRS = ALL_PAIRS
  .filter(([n]) =>
    n === "hint" ? hasHint
    : FORM_PAIRS.includes(n) ? hasForm
    : CTA_PAIRS.includes(n) ? hasCtas
    : true)
  .map(([n, s, i, x, k]) => ANCHOR_SKIP[n] ? [n, s, i, x, [...(k ?? []), ...ANCHOR_SKIP[n]]] : [n, s, i, x, k]);
/*
  진행 중은 전광판 팀명·점수와 배지의 스테이지명, 안내 문장의 마감일이 데이터다.
  시안은 표본(골목마켓 731명·「s4 마케팅과 유저 유입」·10.04)이고 구현은 dev DB다.
  팀명·점수 칸은 글자를 긁기 전에 양쪽에서 비우고, 나머지 둘은 틀만 맞춰 본다.
*/
/*
  ⚠️ 예시 순위(모집 전·모집 중)는 팀명을 남기고 **점수 칸만** 비운다. 값은 시안
  표본 그대로인데 시안의 `countUp`이 믿을 수 없다 — 도는 중에 한 번 더 불리면
  그때 화면에 있던 중간값을 목표로 읽어 거기서 굳는다(731명이 12명·195명으로
  잡혔고 폭마다 달랐다). 숫자와 막대 비율은 구현 쪽에서 따로 잰다.
*/
const DATA_BLANK = SAMPLE
  ? { spec: ".ld-live .slot.only-live .score",
      impl: '[class*="__slotLive"] > [class*="__slotScore"]' }
  : { spec: ".ld-live .slot.only-live .nm, .ld-live .slot.only-live .score",
      impl: '[class*="__slotLive"] > [class*="__slotName"], [class*="__slotLive"] > [class*="__slotScore"]' };
const blank = (sel) => `document.querySelectorAll(${JSON.stringify(sel)}).forEach((e) => { e.textContent = ""; })`;
/* 예시 전광판의 뱃지(시안 「준비 중」·「개막 전」)와 안내 첫 문장. 둘째 문장은 시안 그대로다 */
if (SAMPLE) {
  TEXT_IGNORE.push(/^(준비 중|개막 전|예시)$/, /^예시 화면이에요\.$/);
}
/* 마감일도 데이터다 — dev DB 일정은 시안 표본을 2주 민 임시값이다(시즌 1 일정 미정) */
if (STATE === "recruit") {
  TEXT_IGNORE.push(/^시즌 1 참가 신청 접수 중, \d\d\.\d\d 마감$/, /마감은 \d\d\.\d\d 23:59예요\.$/);
}
if (STATE === "stage") {
  TEXT_IGNORE.push(/^시즌 1 진행 중, s\d .+$/, /^참가 신청은 \d\d\.\d\d에 마감됐어요\..*$/);
}
/* 종료는 발표일(시즌 종료일)과 집계 확정 시각(s5 마감)이 데이터다 */
if (STATE === "done") {
  TEXT_IGNORE.push(/^시즌 1 종료, \d\d\.\d\d 최종 결과 발표$/,
    /^\d\d\.\d\d \d\d:\d\d 집계 확정 기준 최종 순위예요\.$/);
}
/*
  구현본의 파이널 CTA로 상태를 알아본다. 「~하기」는 2026-10-02에 뗐다(cdp.mjs `SPEC_RENAMES`).
  히어로의 첫 CTA로 보다가 바꿨다 — 모집 전·종료에는 히어로에 버튼 줄이 없다.
  파이널 버튼은 네 상태 모두에 있고 글자도 히어로의 것과 같았다.
*/
const CTA_OF = {
  "사전 신청": "pre", "참가 신청": "recruit",
  "리더보드 보기": "stage", "시즌 2 알림 받기": "done",
};
const stateOf = `(() => {
  const b = document.querySelector('[class*="__fin"] :is(button, a)');
  return (${JSON.stringify(CTA_OF)})[b?.textContent.trim()] ?? "알 수 없음(" + b?.textContent.trim() + ")";
})()`;

/*
  ⚠️ 숨은 요소(`only-*`)를 걷어내지 않는다. 가려진 요소도 구조 선택자에 잡혀
  화면을 바꾼다 — 모집 전에는 `.slot:last-of-type`을 숨은 LIVE 슬롯이 가져가
  세 번째 빈 슬롯에 밑줄이 남는다. 그것도 시안이다(2026-09-19 수연 확인).
  한때 걷어냈다가 그 밑줄을 대조에서 지워 버렸다.
  (2026-10-02부터 모집 전·모집 중은 예시 순위라 그 밑줄이 없다 — 시안 쪽도
  LIVE 슬롯을 켜서 잰다. 위 `showSpecLive`.)
*/
const pickState = (state) => `(() => {
  const sec = document.getElementById("scr-landing");
  sec.querySelector('.sb[data-set="' + ${JSON.stringify(state)} + '"]').click();
  if (sec.dataset.state !== ${JSON.stringify(state)}) return "상태 전환 실패: " + sec.dataset.state;
  return sec.dataset.state;
})()`;

const implState = await withPage(async (p) => {
  await p.goto(IMPL_URL);
  await p.resize(1440, 900);
  return p.eval(stateOf);
});
console.log(`요청한 상태: ${STATE} / 구현본이 지금 그리는 상태: ${implState}`);
if (implState !== STATE) {
  console.log("⚠️ 상태가 다르다. 개발 바의 페이즈 줄로 dev DB를 바꾼 뒤 다시 돌린다.");
  process.exit(1);
}

let total = 0;
for (const w of WIDTHS) {
  const spec = await withPage(async (p) => {
    await p.goto(SPEC_URL);
    const picked = await p.eval(pickState(STATE));
    if (picked !== STATE) throw new Error(picked);
    if (SAMPLE) await p.eval(showSpecLive);
    await p.stripViewerShell();
    await p.resize(w, 1000);
    const naturally = await p.eval(settle, true);
    const r = await p.eval(probe(PAIRS.map(([n, s, , x, k]) => [n, s, "spec", x, k])));
    await p.shot(`${OUT}/spec-${w}.png`);
    if (DATA_BLANK) await p.eval(blank(DATA_BLANK.spec));
    if (SPEC_GONE) await p.eval(blank(SPEC_GONE));
    r.text = await p.eval(textNodes("#scr-landing .ld"));
    r.naturally = naturally;
    return r;
  });
  const impl = await withPage(async (p) => {
    await p.goto(IMPL_URL);
    await p.resize(w, 1000);
    const naturally = await p.eval(settle, true);
    const r = await p.eval(probe(PAIRS.map(([n, , i, x, k]) => [n, i, "impl", x, k])));
    await p.shot(`${OUT}/impl-${w}.png`);
    if (DATA_BLANK) await p.eval(blank(DATA_BLANK.impl));
    r.text = await p.eval(textNodes('[class*="Landing-module"][class*="__ld"]'));
    r.naturally = naturally;
    return r;
  });

  console.log(`\n\n████ 폭 ${w}   스크롤만으로 나타난 리빌 — 시안 ${spec.naturally} / 구현 ${impl.naturally}`);
  /*
    ⚠️ 스크롤만으로 안 나타난 리빌은 **불일치로 센다.** 재기 전에 전부 강제로
    켜기 때문에, 안 세면 영영 투명한 요소가 0건으로 통과한다 — 모집 중 파이널
    「참가 신청」 버튼이 그랬다(LinkButton이 Reveal의 ref를 버렸다). 수연이 눈으로 잡았다.
  */
  const [shownN, allN] = impl.naturally.split("/").map(Number);
  if (shownN !== allN) {
    console.log(`  ✗ 구현본 리빌 ${allN - shownN}개가 스크롤해도 안 나타난다`);
    total += allN - shownN;
  }
  for (const m of spec.missing) console.log(`  ⚠️ 시안에서 못 찾음: ${m}`);
  for (const m of impl.missing) console.log(`  ⚠️ 구현본에서 못 찾음: ${m}`);
  total += spec.missing.length + impl.missing.length;
  total += diffTable(`${w}px — 랜딩`, spec.out, impl.out);
  /* 글자는 폭과 무관하지만, 미디어 쿼리로 숨는 것이 있어 폭마다 다시 본다 */
  total += diffText(spec.text, impl.text, { ignore: TEXT_IGNORE, renames: TEXT_RENAMES });
}
console.log(`\n═══════════════════════════\n세 폭 합계 불일치 ${total}건`);
console.log(`스크린샷: ${OUT}`);
