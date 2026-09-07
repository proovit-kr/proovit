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
import {
  withPage, diffTable, diffText, textNodes,
  SPEC_URL, IMPL_URL, WIDTHS, shotDir,
} from "./cdp.mjs";

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
  /*
    ⚠️ `::before`/`::after`의 **inset만** 뺀다. 세 번째 값이 히어로 높이라서다
    (`-40px -20px 699.609px`). 390에서 우리 히어로가 시안보다 한 줄 높다 —
    부제 두 문장을 `Clauses`가 문장 끝에서 끊기 때문이고, 의도한 차이다
    (2026-09-07 수연 지시). 나머지 의사요소 값은 그대로 대조한다.
  */
  ["hero", S + ".ld-hero", "hero", undefined,
   ["::before inset", "::after inset"]],
  ["h1", S + ".ld-hero h1", "title"],
  ["sub", S + ".ld-hero .sub", "sub"],
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
  ["live", S + ".ld-live", "live"],
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
  /* Reveal이 감싸지 않고 자식에 붙으므로 카드가 곧 그리드의 자식이다 */
  ["three 카드", S + ".ld-3 .card", '[class*="__three"] > *', [], ["width", "height"]],
  ["three n", S + ".ld-3 .n", "threeNo"],
  ["crit", S + ".ld-crit", "crit"],
  ["crit 카드", S + ".ld-crit .card", '[class*="__crit"] > *', [], ["width", "height"]],
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
      const hs = [...el.children].map((c) => Math.round(c.getBoundingClientRect().height));
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
  for (let y = 0; y <= h(); y += 400) { window.scrollTo(0, y); await nap(90); }
  await nap(500);
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
  데이터가 정하는 것만 뺀다 — 사전 신청 수 하나뿐이다.
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
];

/*
  ⚠️ **랜딩은 이제 시즌 단계를 타지 않는다.** 버튼 셋(헤더·히어로·파이널)이
  시안대로 「사전 신청하기」 고정이 됐고(2026-09-06), 사전신청 폼은 원래부터
  단계와 무관하게 늘 렌더된다.

  그래서 예전의 단계 확인 가드를 지웠다. CTA 문구로 dev 시즌이 사전 신청
  단계인지 보던 것인데, 문구가 고정이라 무엇을 하든 통과하는 검사가 됐다.
  리더보드 픽스처(`lbfix.mts race`)를 돌린 뒤에 이어 돌려도 0건이다.

  헤더 메뉴는 모집 중부터 나오지만 대조 목록에 없다 — 시안은 메뉴를 늘 그리고
  우리는 모집 전에 숨기는 것이 **의도적 차이**라(2026-08-31 수연 지시) 애초에
  비교하지 않는다.
*/

let total = 0;
for (const w of WIDTHS) {
  const spec = await withPage(async (p) => {
    await p.goto(SPEC_URL);
    await p.stripViewerShell();
    await p.resize(w, 1000);
    const naturally = await p.eval(settle, true);
    const r = await p.eval(probe(PAIRS.map(([n, s, , x, k]) => [n, s, "spec", x, k])));
    r.text = await p.eval(textNodes("#scr-landing .ld"));
    r.naturally = naturally;
    await p.shot(`${OUT}/spec-${w}.png`);
    return r;
  });
  const impl = await withPage(async (p) => {
    await p.goto(IMPL_URL);
    await p.resize(w, 1000);
    const naturally = await p.eval(settle, true);
    const r = await p.eval(probe(PAIRS.map(([n, , i, x, k]) => [n, i, "impl", x, k])));
    r.text = await p.eval(textNodes('[class*="Landing-module"][class*="__ld"]'));
    r.naturally = naturally;
    await p.shot(`${OUT}/impl-${w}.png`);
    return r;
  });

  console.log(`\n\n████ 폭 ${w}   스크롤만으로 나타난 리빌 — 시안 ${spec.naturally} / 구현 ${impl.naturally}`);
  for (const m of spec.missing) console.log(`  ⚠️ 시안에서 못 찾음: ${m}`);
  for (const m of impl.missing) console.log(`  ⚠️ 구현본에서 못 찾음: ${m}`);
  total += spec.missing.length + impl.missing.length;
  total += diffTable(`${w}px — 랜딩`, spec.out, impl.out);
  /* 글자는 폭과 무관하지만, 미디어 쿼리로 숨는 것이 있어 폭마다 다시 본다 */
  total += diffText(spec.text, impl.text, { ignore: TEXT_IGNORE });
}
console.log(`\n═══════════════════════════\n세 폭 합계 불일치 ${total}건`);
console.log(`스크린샷: ${OUT}`);
