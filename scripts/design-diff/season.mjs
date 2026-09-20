/*
  시즌 상세 — 시안 `#scr-season`(1843행)와 `/seasons/:slug`를 대조한다.

    STATE=pre     node scripts/design-diff/season.mjs   # ① 모집 전
    STATE=recruit node scripts/design-diff/season.mjs   # ② 모집 중
    STATE=racing  node scripts/design-diff/season.mjs   # ③ 진행 중
    (STATE를 안 주면 셋 다 돈다)

  ⚠️ 상태가 **시즌 페이즈**로 갈린다. 시안은 상태 바 버튼이 `.only-*`를 바꾸지만
  우리는 dev DB의 페이즈가 같은 일을 한다. 그래서 폭마다 재기 전에 맞춰 둔다:

    node --env-file=.env.development.local --import tsx scripts/design-diff/season-state.mts save
    node --env-file=.env.development.local --import tsx scripts/design-diff/season-state.mts pre
    STATE=pre cdp-chrome node scripts/design-diff/season.mjs
    … recruit · racing 반복 …
    node --env-file=.env.development.local --import tsx scripts/design-diff/season-state.mts restore

  ⚠️ **날짜 글자는 어긋난다.** 시안은 09.28 개막이고 dev DB는 수연의 임시 일정,
  ③은 픽스처가 s4를 지금으로 끌어온다. 데이터 차이지 구현 차이가 아니라서
  날짜가 든 자리는 width와 글자를 뺀다.
*/
import {
  withPage, diffTable, diffText, textNodes,
  SPEC_URL, IMPL_URL, WIDTHS, shotDir,
} from "./cdp.mjs";

const OUT = shotDir("season");

/*
  ⚠️ **잴 때는 창을 낮게 둔다.** 세로 스크롤바가 10px을 먹는데 시안 뷰어는 늘
  길다 — 한쪽에만 스크롤바가 있으면 본문 폭이 통째로 10px 어긋난 것처럼 나온다.
  참가작 상세와 같은 사정이다. 스크린샷은 다시 900으로 올려 찍는다.
*/
const MEASURE_H = 520;

const CSS = [
  "font-size", "font-weight", "line-height", "letter-spacing",
  "color", "background-color", "background-image",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "border-radius", "box-shadow", "gap", "display", "flex-wrap",
  "align-items", "text-align", "width", "height", "max-width", "font-family",
  "grid-template-columns", "opacity",
  "border-top-width", "border-top-style", "border-top-color",
  "border-bottom-width", "border-bottom-style", "border-bottom-color",
];

const S = "#scr-season ";
/* 헤더(NavBar)에도 `.btn`이 있다 — 반드시 본문 안으로 좁힌다 */
const WRAP = '[class*="season-module"][class*="__wrap"]';
const P = (n) => `${WRAP} [class*="season-module"][class*="__${n}"]`;
const IN = (sel) => `${WRAP} ${sel}`;

/* 세 상태가 같이 쓰는 것 — 타임라인은 상태와 무관하게 같다 */
const COMMON = [
  /*
    ⚠️ margin-left는 비교하지 않는다. `margin: 0 auto`의 계산값이 플렉스
    컨테이너 안에서는 0으로 보고된다 — 가운데인지는 ▸가운데 정렬로 잰다.
  */
  ["ss-wrap", S + ".ss-wrap", WRAP, [], ["margin-left", "margin-right", "height"]],
  ["ss-hero", S + ".ss-hero", P("hero"), [], ["height"]],
  /*
    ⚠️ 제목 블록의 width는 뺀다. 히어로가 플렉스라 이 블록의 폭은 **가장 넓은
    형제**인 기간 줄이 정하는데, 그 줄의 날짜가 시안과 다르다(dev DB는 임시 일정).
    글자가 달라 생기는 0.03px이라 디자인 차이가 아니다. 폭은 `ss-wrap`에서 잰다.
  */
  ["ld-eb", S + ".ld-eb", P("eyebrow"), [], ["width"]],
  ["ld-eb b", S + ".ld-eb b", P("eyebrow") + " b"],
  ["h1", S + ".ss-hero h1", P("title"), [], ["width"]],
  /* 기간 한 줄 — 글자가 달라 폭은 뺀다 */
  [".dt", S + ".ss-hero .dt", P("range"), [], ["width"]],
  /* margin-left도 같은 이유로 뺀다 — `auto`라 제목 블록 폭의 나머지다 */
  ["cta", S + ".ss-hero .cta", P("cta"), [], ["width", "height", "margin-left"]],

  ["tl", S + ".tl", P("stages"), [], ["height"]],
  ["tl-item s1", S + '.tl-item[data-k="s1"]', `${WRAP} [data-k="s1"]`, [], ["height"]],
  ["tl-item .k", S + '.tl-item[data-k="s1"] .k', P("stageKey")],
  ["tl-item h4", S + '.tl-item[data-k="s1"] h4', P("stageHead"), [], ["width", "height"]],
  ["tl-item .w", S + '.tl-item[data-k="s1"] .w', P("stageWhen"), [], ["width"]],
  ["tl-item p", S + '.tl-item[data-k="s1"] p', P("stageSubmits"), [], ["width", "height"]],
  ["tl-gate", S + ".tl-gate", P("gate"), [], ["height"]],
  ["tl-gate b", S + ".tl-gate b", P("gateNo")],
];

/* 히어로 CTA는 상태마다 하나다 — 시안은 `.only-*`로 셋 중 하나만 남긴다 */
const BTN = (only) => [
  "btn",
  `${S}.ss-hero .cta .btn.only-${only}`,
  IN('[class*="Button-module"][class*="__btn"]'),
];

const PRE = [...COMMON, BTN("pre")];
const RECRUIT = [...COMMON, BTN("recruit")];
/*
  ③만 잴 것이 둘 더 있다 — 지금 도는 스테이지의 라임 카드와 「진행 중」 배지.
  시안은 s4로 박아 두었고 우리는 날짜로 찾는다. 픽스처가 s4를 지금으로 끌어와
  같은 카드가 된다(season-state.mts racing).
*/
const RACING = [
  ...COMMON,
  BTN("racing"),
  ["tl-item s4(지금)", S + '.tl-item[data-k="s4"]', `${WRAP} [data-k="s4"]`, [], ["height"]],
  ["badge 진행 중", S + '.tl-item[data-k="s4"] .badge',
    `${WRAP} [data-k="s4"] [class*="Badge-module"][class*="__badge"]`],
];

const probe = () => `(() => {
  const CSS = ${JSON.stringify(CSS)};
  const out = {}, missing = [];
  for (const [name, sel, extra, skip] of LIST) {
    const el = document.querySelector(sel);
    if (!el) { missing.push(name + "  ← " + sel); continue; }
    const cs = getComputedStyle(el);
    for (const p of CSS.concat(extra || [])) {
      if ((skip || []).includes(p)) continue;
      if (p.startsWith("border-") && !p.endsWith("width")) {
        const side = p.split("-")[1];
        if (cs.getPropertyValue("border-" + side + "-width") === "0px") continue;
      }
      let v = cs.getPropertyValue(p);
      /* Lightning CSS가 그라디언트 위치의 0%를 0px로 줄인다. 같은 값이다 */
      if (p.startsWith("background")) v = v.replace(/ 0%/g, " 0px");
      out[name + " " + p] = v;
    }
    out[name + " ▸가로 넘침"] = String(el.scrollWidth > el.clientWidth + 1);
    if (name === "ss-wrap") {
      const r = el.getBoundingClientRect(), pr = el.parentElement.getBoundingClientRect();
      out[name + " ▸가운데 정렬"] =
        Math.abs((r.left - pr.left) - (pr.right - r.right)) < 2 ? "가운데" : "치우침";
    }
    /* 스테이지 다섯 + 게이트 둘. 하나만 재면 빠진 줄이 안 보인다 */
    if (name === "tl") out[name + " ▸칸 수"] = String(el.children.length);
    /*
      CTA는 상태마다 **하나**다 — 늘 붙는 outline이 시안엔 없다.
      시안은 셋을 다 두고 only-* 로 둘을 지우므로 **보이는 것만** 센다.
    */
    if (name === "cta") {
      out[name + " ▸버튼 수"] = String(
        [...el.querySelectorAll("a,button")].filter((b) => b.getClientRects().length).length,
      );
    }
  }
  return { out, missing };
})()`;

const run = (list, side) =>
  probe().replace("LIST", JSON.stringify(list.map(([n, s, i, x, k]) =>
    side === "spec" ? [n, s, x, k] : [n, i, x, k])));

/*
  글자. 스테이지 이름·제출물·게이트 문구는 시안과 같은 상수라 그대로 견준다.
  날짜가 든 줄(`.w`·`.dt`)은 데이터가 달라 뺀다 — 위 표에서 폭을 뺀 것과 같은 이유.
*/
const TEXT_PAIRS = [
  ["제출물", S + '.tl-item[data-k="s1"] p', P("stageSubmits")],
  ["게이트", S + ".tl-gate", P("gate")],
  ["CTA", S + ".ss-hero .cta", P("cta")],
];

/*
  시안 상태 바 버튼을 누른다 — `stripViewerShell()`이 바를 가리기 **전에**.
  패널만 켜면 버튼에 딸린 헤더 페이즈(P1·P2·P3)가 따라오지 않는다.
*/
const clickState = (state) => `(() => {
  const sec = document.getElementById("scr-season");
  const btn = sec.querySelector('.sb[data-set=' + ${JSON.stringify(JSON.stringify(state))} + ']');
  if (!btn) return "버튼 없음";
  btn.click();
  return sec.dataset.state;
})()`;

/*
  구현본이 지금 어느 상태를 그리는지 — 히어로 CTA의 문구가 곧 페이즈다.
  ③은 리더보드 플래그가 꺼져 있으면 버튼이 없다(그때는 상태를 못 가린다).
*/
const stateOf = `(() => {
  const wrap = document.querySelector('${WRAP}');
  if (!wrap) return "없음";
  const cta = wrap.querySelector('[class*="season-module"][class*="__cta"]');
  const label = (cta?.textContent ?? "").trim();
  if (label.includes("사전 신청")) return "pre";
  if (label.includes("참가 신청")) return "recruit";
  if (label.includes("리더보드")) return "racing";
  return "CTA 없음";
})()`;

const LIST_OF = { pre: PRE, recruit: RECRUIT, racing: RACING };
const SPEC_STATE = { pre: "pre", recruit: "recruit", racing: "racing" };
const plan = process.env.STATE ? [process.env.STATE] : ["pre", "recruit", "racing"];
for (const state of plan) {
  if (!LIST_OF[state]) throw new Error(`STATE는 pre·recruit·racing 중 하나: ${state}`);
}

const SLUG = process.env.SEASON_SLUG ?? "season-1";

let total = 0;
for (const state of plan) {
  const list = LIST_OF[state];

  for (const w of WIDTHS) {
    const spec = await withPage(async (p) => {
      /* 화면 전환 페이드를 끝내려고 모션 감축으로 연다(참가작 상세와 같다) */
      await p.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }],
      });
      await p.goto(SPEC_URL + "#season");
      const got = await p.eval(clickState(SPEC_STATE[state]));
      if (got !== SPEC_STATE[state]) throw new Error(`시안 상태 전환 실패: ${got}`);
      await p.stripViewerShell();
      await p.resize(w, MEASURE_H);
      const r = await p.eval(run(list, "spec"));
      r.text = {};
      for (const [n, sel] of TEXT_PAIRS) r.text[n] = await p.eval(textNodes(sel));
      await p.resize(w, 900);
      await p.shot(`${OUT}/spec-${state}-${w}.png`);
      return r;
    });

    const impl = await withPage(async (p) => {
      /* 공개 화면이다. 다른 대조가 남긴 세션이 있으면 로그인 헤더로 그려진다 */
      await p.send("Network.clearBrowserCookies");
      await p.goto(`${IMPL_URL}/seasons/${SLUG}`);
      const drawing = await p.eval(stateOf);
      if (drawing !== state) {
        throw new Error(
          `구현본이 ${drawing}을 그린다 — season-state.mts ${state}를 먼저 돌린다`,
        );
      }
      await p.resize(w, MEASURE_H);
      const r = await p.eval(run(list, "impl"));
      r.text = {};
      for (const [n, , sel] of TEXT_PAIRS) r.text[n] = await p.eval(textNodes(sel));
      await p.resize(w, 900);
      await p.shot(`${OUT}/impl-${state}-${w}.png`);
      return r;
    });

    console.log(`\n\n████ ${state} · 폭 ${w}`);
    for (const m of spec.missing) console.log(`  ⚠️ 시안에서 못 찾음: ${m}`);
    for (const m of impl.missing) console.log(`  ⚠️ 구현본에서 못 찾음: ${m}`);
    total += spec.missing.length + impl.missing.length;
    total += diffTable(`${state} ${w}px — 시즌 상세`, spec.out, impl.out);
    for (const [n] of TEXT_PAIRS) {
      total += diffText(spec.text[n], impl.text[n], { label: n });
    }
  }
}
console.log(`\n═══════════════════════════\n합계 불일치 ${total}건`);
console.log(`스크린샷: ${OUT}`);
