/*
  리더보드 — 시안 `#scr-leaderboard`(3상태)와 `/seasons/:slug/leaderboard`를 대조한다.

  시안 마크업의 클래스를 먼저 전부 뽑아 넣었다.
    sed -n '1393,1444p' 시안.html | grep -oE 'class="[^"]*"'

  ⚠️ 상태가 데이터로 갈린다. 시안은 패널 셋을 버튼으로 바꾸지만 우리는
  DB 상태가 정한다 — dev DB가 어느 상태인지에 따라 비교 대상이 달라진다.
  아래 `IMPL_STATE`가 지금 무엇을 그리는지 먼저 찍는다.

    node scripts/design-diff/leaderboard.mjs
*/
import {
  withPage, diffTable, diffText, textNodes,
  SPEC_URL, IMPL_URL, WIDTHS, shotDir,
} from "./cdp.mjs";

const OUT = shotDir("leaderboard");
const SLUG = process.env.LB_SLUG ?? "season-1";

const CSS = [
  "font-size", "font-weight", "line-height", "letter-spacing",
  "color", "background-color", "background-image",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-bottom", "margin-left",
  "border-radius", "box-shadow", "gap", "display", "flex-wrap",
  "align-items", "text-align", "width", "max-width", "font-family",
  "text-shadow", "font-variant-numeric", "vertical-align",
  "border-top-width", "border-top-style", "border-top-color",
  "border-bottom-width", "border-bottom-style", "border-bottom-color",
  "animation-name", "animation-duration", "opacity", "mix-blend-mode",
];

const S = "#scr-leaderboard ";

/* 표가 있는 상태(레이스 운영중)에서 볼 것들 */
const RACE = [
  /*
    ⚠️ margin-left는 비교하지 않는다. `margin: 0 auto`의 계산값이 플렉스
    컨테이너 안에서는 0으로 보고된다(요소는 정상적으로 가운데 있다).
    「가운데인가」는 아래 ▸가운데 정렬로 직접 잰다.
  */
  ["lb-wrap", S + ".lb-wrap", "wrap", [], ["margin-left"]],
  ["eyebrow", S + ".lb-eyebrow", "eyebrow"],
  ["head", S + ".lb-head", "head"],
  /* 제목·갱신 문구도 글자가 달라 폭이 다르다 */
  ["h1", S + ".lb-head h1", "title", [], ["width"]],
  ["upd", S + ".lb-head .upd", "upd", [], ["width", "margin-left"]],
  /* 라임 점은 1.6초 주기로 깜빡인다 — 재는 순간의 위상이라 opacity는 뺀다 */
  ["upd i", S + ".lb-head .upd i", '[class*="__upd"] i', [], ["opacity"]],
  ["stg-track", S + ".stg-track", "track"],
  /*
    폭도 비교한다. 2026-09-06에 DB의 스테이지 이름을 시안 3351행 값으로
    맞추면서(seed.ts) 글자 수가 같아졌다 — 그전에는 이름이 길어 폭을 뺐었다.
  */
  ["stg", S + ".stg-track .stg.done", '[class*="__done"]'],
  ["stg .n", S + ".stg-track .stg.done .n", '[class*="__done"] [class*="__stgKey"]'],
  ["stg.now", S + ".stg-track .stg.now", '[class*="__now"]'],
  ["stg.gate", S + ".stg-track .stg.gate", '[class*="__gate"]'],
  ["tbl", S + ".pane[data-id='lb-race'] .lb-tbl", "table"],
  ["th", S + ".pane[data-id='lb-race'] .lb-tbl thead th", '[class*="__table"] thead th'],
  ["td", S + ".pane[data-id='lb-race'] .lb-tbl td", '[class*="__table"] tbody td'],
  ["rk", S + ".pane[data-id='lb-race'] .lb-tbl .rk", '[class*="__rank"]'],
  ["top rk", S + ".pane[data-id='lb-race'] .lb-tbl tr.top .rk", '[class*="__top"] [class*="__rank"]'],
  /* 팀명·참가작 이름이 달라 폭이 다르다 */
  ["tm", S + ".pane[data-id='lb-race'] .lb-tbl .tm", '[class*="__team"]', [], ["width"]],
  ["tm small", S + ".pane[data-id='lb-race'] .lb-tbl .tm small", '[class*="__team"] small', [], ["width"]],
  ["sv a", S + ".pane[data-id='lb-race'] .lb-tbl .sv a", '[class*="__service"] a'],
  ["usr", S + ".pane[data-id='lb-race'] .lb-tbl .usr", '[class*="__usr"]'],
  ["usr score", S + ".pane[data-id='lb-race'] .lb-tbl .usr .score", '[class*="__usr"] .score', [], ["width"]],
  ["usr small", S + ".pane[data-id='lb-race'] .lb-tbl .usr small", '[class*="__usr"] small'],
  ["dt", S + ".pane[data-id='lb-race'] .lb-tbl .dt", '[class*="__dt"]'],
  ["bd", S + ".pane[data-id='lb-race'] .lb-tbl .bd", '[class*="__bd"]'],
  ["note", S + ".pane[data-id='lb-race'] .lb-note", "note"],
];

/*
  시즌 종료. 레이스와 같은 표에 배너가 붙고, 「전일 대비」 열과 아래 안내
  문장이 빠진다. 「상태」 열은 「수상」이 된다.
*/
const F = S + ".pane[data-id='lb-final'] ";
const FINAL = [
  ["lb-wrap", S + ".lb-wrap", "wrap", [], ["margin-left"]],
  ["eyebrow", S + ".lb-eyebrow", "eyebrow"],
  ["head", S + ".lb-head", "head"],
  ["h1", S + ".lb-head h1", "title", [], ["width"]],
  ["upd", S + ".lb-head .upd", "upd", [], ["width", "margin-left"]],
  ["upd i", S + ".lb-head .upd i", '[class*="__upd"] i', [], ["opacity"]],
  ["stg-track", S + ".stg-track", "track"],
  ["stg", S + ".stg-track .stg.done", '[class*="__done"]', [], ["width"]],
  ["stg.gate", S + ".stg-track .stg.gate", '[class*="__gate"]', [], ["width"]],
  /* 배너. 문구 길이가 달라 폭은 빼고, 배지는 따로 본다 */
  ["banner", F + ".lb-final-banner", "finalBanner", [], ["width"]],
  ["banner badge", F + ".lb-final-banner .badge", '[class*="__finalBanner"] [class*="__badge"]', [], ["width"]],
  ["tbl", F + ".lb-tbl", "table"],
  ["th", F + ".lb-tbl thead th", '[class*="__table"] thead th'],
  ["td", F + ".lb-tbl td", '[class*="__table"] tbody td'],
  ["rk", F + ".lb-tbl .rk", '[class*="__rank"]'],
  ["top rk", F + ".lb-tbl tr.top .rk", '[class*="__top"] [class*="__rank"]'],
  ["tm", F + ".lb-tbl .tm", '[class*="__team"]', [], ["width"]],
  ["tm small", F + ".lb-tbl .tm small", '[class*="__team"] small', [], ["width"]],
  ["sv a", F + ".lb-tbl .sv a", '[class*="__service"] a'],
  ["usr", F + ".lb-tbl .usr", '[class*="__usr"]'],
  ["usr score", F + ".lb-tbl .usr .score", '[class*="__usr"] .score', [], ["width"]],
  ["usr small", F + ".lb-tbl .usr small", '[class*="__usr"] small'],
  ["bd", F + ".lb-tbl .bd", '[class*="__bd"]'],
  ["bd badge", F + ".lb-tbl .bd .badge", '[class*="__bd"] [class*="__badge"]', [], ["width"]],
  /* 열 개수는 값이 아니라 구조다 — 시안이 다섯 열이면 다섯 열이어야 한다 */
  ["tbl ▸열", F + ".lb-tbl thead tr", '[class*="__table"] thead tr'],
];

/* 집계 전 */
const EMPTY = [
  ["lb-wrap", S + ".lb-wrap", "wrap", [], ["margin-left"]],
  ["lb-empty", S + ".pane[data-id='lb-empty'] .lb-empty", "empty"],
  ["empty big", S + ".pane[data-id='lb-empty'] .lb-empty .big", "emptyBig"],
  ["empty p", S + ".pane[data-id='lb-empty'] .lb-empty p", '[class*="__empty"] p'],
];

const probe = () => `(() => {
  const CSS = ${JSON.stringify(CSS)};
  const out = {}, missing = [];
  /*
    ⚠️ 모듈을 좁힌다. 클래스 이름은 모듈마다 겹친다 — head 는 NavBar에도
    있어서 안 좁히면 페이지 헤더를 잡는다(실제로 그랬다).
  */
  const byModuleName = (n) => [...document.querySelectorAll('[class*="leaderboard-module"]')]
    .find(el => [...el.classList].some(c => c.endsWith("__" + n)));

  for (const [name, sel, mode, extra, skip] of LIST) {
    const el = mode === "impl" && !/[ .#>\\[]/.test(sel) ? byModuleName(sel) : document.querySelector(sel);
    if (!el) { missing.push(name + "  ← " + sel); continue; }
    const cs = getComputedStyle(el);
    for (const p of CSS.concat(extra || [])) {
      if ((skip || []).includes(p)) continue;
      if (p.startsWith("border-") && !p.endsWith("width")) {
        const side = p.split("-")[1];
        if (cs.getPropertyValue("border-" + side + "-width") === "0px") continue;
      }
      let v = cs.getPropertyValue(p);
      if (p === "animation-name") v = v.split(", ").map(n => n.replace(/^.*__/, "")).join(", ");
      /* Lightning CSS가 그라디언트 위치의 0%를 0px로 줄인다. 같은 값이다 */
      if (p.startsWith("background")) v = v.replace(/ 0%/g, " 0px");
      out[name + " " + p] = v;
    }
    for (const pe of ["::before", "::after"]) {
      const pcs = getComputedStyle(el, pe);
      if (pcs.content === "none") continue;
      for (const p of ["content","position","width","height","opacity","mix-blend-mode",
                       "background","animation-name","color","margin-left"]) {
        /* top은 5.5초 스윕이 진행 중인 프레임이라 잴 때마다 다르다 —
           도는지는 animation-name으로 본다 */
        let v = pcs.getPropertyValue(p);
        if (p === "animation-name") v = v.split(", ").map(n => n.replace(/^.*__/, "")).join(", ");
        if (p.startsWith("background")) v = v.replace(/ 0%/g, " 0px");
        out[name + pe + " " + p] = v;
      }
    }
    let opaque = 0;
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const c2 = getComputedStyle(n);
      if (c2.backgroundColor !== "rgba(0, 0, 0, 0)" || c2.backgroundImage !== "none") opaque++;
    }
    out[name + " ▸불투명한 조상 수"] = String(opaque);
    out[name + " ▸가로 넘침"] = String(el.scrollWidth > el.clientWidth + 1);
    if (name.endsWith("▸열")) out[name + " 개수"] = String(el.children.length);
    if (name === "lb-wrap") {
      const r = el.getBoundingClientRect(), pr = el.parentElement.getBoundingClientRect();
      out[name + " ▸가운데 정렬"] =
        Math.abs((r.left - pr.left) - (pr.right - r.right)) < 2 ? "가운데" : "치우침";
    }
  }
  return { out, missing };
})()`;

/*
  ⚠️ 좁은 폭에서는 표의 열 폭을 비교하지 않는다.

  `width: 150px` 같은 선언은 표가 안 눌릴 때만 그대로 나온다. 좁아지면
  브라우저가 **글자 길이에 따라** 다시 나누는데, 시안의 팀명·지표와 우리
  dev 데이터가 달라서 분배 결과가 다르다 — 데이터 차이지 디자인 차이가 아니다.
  선언값 자체는 1440에서 정확히 대조된다(150 / 110 / 100).
*/
/*
  1440 아래에서는 열이 눌린다. 눌린 폭은 글자 수가 정하므로(팀명·참가작 이름이
  시안과 다르다) 폭 대신 「넘치지 않는가」로 본다.
*/
const SQUEEZED = ["tbl", "usr", "dt", "bd", "tm", "sv a", "rk", "tbl ▸열"];

const run = (list, side, w) =>
  probe().replace("LIST", JSON.stringify(list.map(([n, s, i, x, k]) => {
    const skip = [...(k || []), ...(w < 1440 && SQUEEZED.includes(n) ? ["width"] : [])];
    return side === "spec" ? [n, s, "spec", x, skip] : [n, i, "impl", x, skip];
  })));

/* 구현본이 지금 어느 상태를 그리는지 */
const stateOf = `(() => {
  const has = (n) => !!document.querySelector('[class*="__' + n + '"]');
  return has("locked") ? "잠김" : has("empty") ? "집계 전"
       : has("finalBanner") ? "시즌 종료" : has("table") ? "레이스 운영중" : "알 수 없음";
})()`;

/*
  글자 대조. **표의 몸통은 데이터라 빼고**, 머리글과 라벨만 본다 —
  팀명·지표는 시안의 목업과 dev DB가 같을 수 없다.

  그래서 긁는 자리를 셋으로 나눈다: 눈썹·제목 줄, 스테이지 트랙, 표 머리.
  집계 전 상태에서는 표 대신 빈 상자의 문구를 본다.
*/
const TEXT_PAIRS = {
  공통: [
    ["머리", S + ".lb-eyebrow", "eyebrow"],
    ["트랙", S + ".stg-track", "track"],
  ],
  "lb-race": [["표 머리", S + ".pane[data-id='lb-race'] .lb-tbl thead", '[class*="__table"] thead']],
  "lb-final": [["표 머리", S + ".pane[data-id='lb-final'] .lb-tbl thead", '[class*="__table"] thead']],
  "lb-empty": [["빈 상자", S + ".pane[data-id='lb-empty'] .lb-empty", "empty"]],
};

/*
  ⚠️ 스테이지 이름은 이제 **대조한다.** 2026-09-06에 DB 값을 시안 3351행에
  맞췄다(seed.ts). 그전에는 이름이 달라 통째로 빼 두었는데, 그러는 동안
  트랙이 두 줄로 깨져 있는 것도 함께 가려져 있었다.
*/
const TEXT_IGNORE = [
  /^✓$/, /갱신|롤업|집계 대기/, /^\d+$/,
  /*
    ⚠️ **아는 차이.** 시안의 집계 전 문구는 「집계 시작됨, 첫 갱신까지 14분」
    이고 우리는 「첫 갱신을 기다려요」다.

    롤업이 아직 없어서다 — 크론도 없고 스냅샷을 만드는 것은 dev 샌드박스뿐이다.
    없는 주기로 남은 시간을 찍으면 숫자를 지어내는 것이 되고, 그건 이 제품이
    파는 「조작 불가능한 지표」와 정확히 반대다.

    **롤업이 붙으면 이 줄을 지우고 카운트다운을 구현한다.**
  */
  /^\d+분$/,
];

/** 모듈 이름만 준 것은 구현본 쪽에서 클래스로 바꾼다 */
const implSel = (v) =>
  /[ .#>[]/.test(v) ? v : `[class*="leaderboard-module"][class*="__${v}"]`;

let total = 0;
const implState = await withPage(async (p) => {
  await p.goto(`${IMPL_URL}/seasons/${SLUG}/leaderboard`);
  await p.resize(1440, 900);
  return p.eval(stateOf);
});
console.log(`구현본이 지금 그리는 상태: ${implState}`);

const plan =
  implState === "집계 전"
    ? [["lb-empty", EMPTY]]
    : implState === "시즌 종료"
      ? [["lb-final", FINAL]]
      : [["lb-race", RACE]];

for (const [pane, list] of plan) {
  for (const w of WIDTHS) {
    const spec = await withPage(async (p) => {
      await p.goto(SPEC_URL + "#leaderboard");
      await p.stripViewerShell();
      /* 시안은 상태 바 버튼이 패널을 바꾼다. 직접 켠다 */
      await p.eval(`(() => {
        const sec = document.getElementById("scr-leaderboard");
        sec.querySelectorAll(".pane").forEach(x => x.classList.toggle("on", x.dataset.id === ${JSON.stringify(pane)}));
        /*
          ⚠️ 화면 전환 애니메이션(fadeUp .3s)을 끝낸다. 안 끄면 캡처가 페이드
          도중을 찍어서 스크린샷 전체가 흐리게 나온다 — 값은 맞는데 눈으로
          대조할 수 없게 된다.
        */
        sec.getAnimations({ subtree: true }).forEach(a => {
          /* 무한 반복(blink·pul·sweep)은 끝낼 수 없다 — 유한한 것만 */
          if (a.effect?.getTiming().iterations !== Infinity) a.finish();
        });
        return 1;
      })()`);
      await p.resize(w, 900);
      const r = await p.eval(run(list, "spec", w));
      await p.shot(`${OUT}/spec-${pane}-${w}.png`);
      r.text = {};
      for (const [n, sel] of [...TEXT_PAIRS.공통, ...(TEXT_PAIRS[pane] ?? [])]) {
        r.text[n] = await p.eval(textNodes(sel));
      }
      return r;
    });
    const impl = await withPage(async (p) => {
      await p.goto(`${IMPL_URL}/seasons/${SLUG}/leaderboard`);
      await p.resize(w, 900);
      const r = await p.eval(run(list, "impl", w));
      await p.shot(`${OUT}/impl-${pane}-${w}.png`);
      r.text = {};
      for (const [n, , sel] of [...TEXT_PAIRS.공통, ...(TEXT_PAIRS[pane] ?? [])]) {
        r.text[n] = await p.eval(textNodes(implSel(sel)));
      }
      return r;
    });
    console.log(`\n\n████ ${pane} · 폭 ${w}`);
    for (const m of spec.missing) console.log(`  ⚠️ 시안에서 못 찾음: ${m}`);
    for (const m of impl.missing) console.log(`  ⚠️ 구현본에서 못 찾음: ${m}`);
    total += spec.missing.length + impl.missing.length;
    total += diffTable(`${pane} ${w}px — 리더보드`, spec.out, impl.out);
    for (const [n] of [...TEXT_PAIRS.공통, ...(TEXT_PAIRS[pane] ?? [])]) {
      total += diffText(spec.text[n], impl.text[n], { ignore: TEXT_IGNORE, label: n });
    }
  }
}
console.log(`\n═══════════════════════════\n합계 불일치 ${total}건`);
console.log(`스크린샷: ${OUT}`);
