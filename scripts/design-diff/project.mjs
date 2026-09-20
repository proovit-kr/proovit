/*
  참가작 상세 — 시안 `#scr-project`(1800행)와 `/projects/:entryId`를 대조한다.

    STATE=live       node scripts/design-diff/project.mjs   # ① 정상
    STATE=undeployed node scripts/design-diff/project.mjs   # ② 미배포
    (STATE를 안 주면 둘 다 돈다)

  ⚠️ 상태가 데이터로 갈린다. 시안은 상태 바 버튼으로 `only-live`·`only-und`를
  바꾸지만 우리는 **엔트리가 다르다** — hostname이 있는 팀과 없는 팀이다.
  그래서 먼저 dev DB를 대조용으로 맞춘다:

    node --env-file=.env.development.local --import tsx scripts/design-diff/lb-state.mts save
    node --env-file=.env.development.local --import tsx scripts/design-diff/spec-teams.mts
    node --env-file=.env.development.local --import tsx scripts/design-diff/lb-state.mts race
    … 대조 …
    node --env-file=.env.development.local --import tsx scripts/design-diff/lb-state.mts restore

  ① 정상은 시안 목업과 같은 팀(리틀포션)이라 팀명·소개·주소·지표가 전부 같다 —
  글자 폭까지 잰다. ② 미배포는 hostname이 없는 마지막 팀(혼밥연구소)이라
  팀명·소개가 다르다. 그 자리의 width만 뺀다.
*/
import { spawnSync } from "node:child_process";

import {
  withPage, diffTable, diffText, textNodes,
  SPEC_URL, IMPL_URL, WIDTHS, shotDir, REPO,
} from "./cdp.mjs";

const OUT = shotDir("project");

/*
  ⚠️ **잴 때는 창을 낮게 둔다.** 세로 스크롤바가 10px을 먹는데(globals의
  `::-webkit-scrollbar`), 시안 뷰어는 늘 길어서 항상 스크롤바가 있고 우리
  페이지는 ② 미배포·390에서만 한 화면에 들어간다. 그러면 본문 폭이 통째로
  10px 어긋난 것처럼 나온다 — 디자인 차이가 아니다. 낮은 창에서는 양쪽 다
  스크롤바가 생겨 같은 조건이 된다. 스크린샷은 다시 900으로 올려 찍는다.
*/
const MEASURE_H = 520;

const CSS = [
  "font-size", "font-weight", "line-height", "letter-spacing",
  "color", "background-color", "background-image",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "border-radius", "box-shadow", "gap", "display", "flex-wrap",
  "align-items", "text-align", "width", "height", "max-width", "font-family",
  "font-variant-numeric", "grid-template-columns", "opacity",
  "border-top-width", "border-top-style", "border-top-color",
  "border-bottom-width", "border-bottom-style", "border-bottom-color",
];

const S = "#scr-project ";
/*
  구현본의 클래스는 모듈마다 접두사가 다르다. 그리고 **반드시 본문 안으로
  좁힌다** — 헤더(NavBar)에도 `.btn`이 있어서 안 좁히면 「로그인」 버튼을
  집는다(실제로 그랬다).
*/
const WRAP = '[class*="project-module"][class*="__wrap"]';
const P = (n) => `${WRAP} [class*="project-module"][class*="__${n}"]`;
const IN = (sel) => `${WRAP} ${sel}`;

/* 두 상태가 같이 쓰는 것 */
const COMMON = [
  /*
    ⚠️ margin-left는 비교하지 않는다. `margin: 0 auto`의 계산값이 플렉스
    컨테이너 안에서는 0으로 보고된다 — 가운데인지는 ▸가운데 정렬로 잰다.
  */
  ["pj-wrap", S + ".pj-wrap", WRAP, [], ["margin-left", "margin-right"]],
  ["pj-back", S + ".pj-back", P("back")],
  ["pj-head", S + ".pj-head", P("head")],
  /*
    ⚠️ 트랙 칩의 width는 빼 둔다. 우리 `--mono`는 한글 폴백을 뒤에 붙여
    두었고(globals.css) 「자유 주제 트랙」이 한글이라 글자 폭이 0.05px
    어긋난다 — 이 화면의 문제가 아니라 그 전역 결정의 결과다.
  */
  ["chip", S + ".chip", IN('[class*="Surface-module"][class*="__chip"]'), [], ["width"]],
  ["pj-cta-row", S + ".pj-cta-row", P("ctaRow")],
  ["pj-cards", S + ".pj-cards", P("cards")],
  ["card", S + ".pj-cards .card", IN('[class*="Surface-module"][class*="__card"]')],
  ["card small", S + ".pj-cards .card small", P("card") + " small"],
  ["spark", S + ".spark", P("spark")],
];

/*
  ① 정상. 팀명·소개·주소가 시안과 같은 팀이라 폭도 본다.
*/
const LIVE = [
  ...COMMON,
  ["h1", S + ".pj-head h1", P("title")],
  ["pj-con", S + ".pj-con", P("con")],
  ["badge", S + ".pj-head .badge.only-live", IN('[class*="Badge-module"][class*="__badge"]')],
  ["btn", S + ".pj-cta-row .btn.only-live", IN('[class*="Button-module"][class*="__btn"]')],
  ["url", S + ".pj-cta-row .url", P("url")],
  ["score", S + ".pj-cards .score.only-live", IN(".score")],
  ["rkv", S + ".pj-cards .rkv.only-live", P("rkv")],
  /* 「02 / 12」의 뒤쪽 — 시안은 인라인 style로 준다 */
  ["rkv 뒤", S + ".pj-cards .rkv.only-live span", P("rankOf")],
  /*
    선 자체. 시안은 화면 진입 때 stroke-dashoffset을 전이로 밀고(3367행)
    우리는 같은 모양을 CSS 애니메이션으로 해서 animation-name이 갈린다 —
    의도한 차이라 그 속성은 애초에 재지 않는다.
  */
  ["spark 선", S + ".spark polyline.only-live", P("spark") + " polyline",
    ["stroke", "stroke-width", "fill"]],
];

/*
  ② 미배포. 팀명·소개가 시안 목업(리틀포션)과 다르다 — 그 두 줄의 폭만 뺀다.
  숫자 자리(0·-·평평한 선)는 시안과 같은 글자라 그대로 잰다.
*/
const UND = [
  ...COMMON.map((row) =>
    row[0] === "pj-wrap" ? [row[0], row[1], row[2], row[3], [...row[4], "height"]] : row,
  ),
  ["h1", S + ".pj-head h1", P("title"), [], ["width"]],
  ["pj-con", S + ".pj-con", P("con"), [], ["width", "height"]],
  /* 소개가 시안(세 줄)과 달라 390에서 본문 전체 높이가 한 줄만큼 짧다 */
  ["badge", S + ".pj-head .badge.only-und", IN('[class*="Badge-module"][class*="__badge"]')],
  ["btn", S + ".pj-cta-row .btn.only-und", IN('[class*="Button-module"][class*="__btn"]')],
  ["score", S + ".pj-cards .score.only-und", IN(".score")],
  ["rkv", S + ".pj-cards .rkv.only-und", P("rkv")],
  ["spark 선", S + ".spark polyline.only-und", P("spark") + " polyline",
    ["stroke", "stroke-width", "fill"]],
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
    let opaque = 0;
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const c2 = getComputedStyle(n);
      if (c2.backgroundColor !== "rgba(0, 0, 0, 0)" || c2.backgroundImage !== "none") opaque++;
    }
    out[name + " ▸불투명한 조상 수"] = String(opaque);
    out[name + " ▸가로 넘침"] = String(el.scrollWidth > el.clientWidth + 1);
    if (name === "pj-wrap") {
      const r = el.getBoundingClientRect(), pr = el.parentElement.getBoundingClientRect();
      out[name + " ▸가운데 정렬"] =
        Math.abs((r.left - pr.left) - (pr.right - r.right)) < 2 ? "가운데" : "치우침";
    }
    /* 카드는 셋이다 — 하나만 재면 두 번째부터 어긋난 것이 안 보인다 */
    if (name === "pj-cards") out[name + " ▸칸 수"] = String(el.children.length);
  }
  return { out, missing };
})()`;

const run = (list, side) =>
  probe().replace("LIST", JSON.stringify(list.map(([n, s, i, x, k]) =>
    side === "spec" ? [n, s, x, k] : [n, i, x, k])));

/*
  글자. 카드 라벨·버튼·배지는 시안과 같은 문구라 그대로 견준다.
  팀명·소개·주소는 ①에서만 같다(②는 다른 팀이다).
*/
const TEXT_PAIRS = {
  live: [
    ["머리", S + ".pj-head", P("head")],
    ["소개", S + ".pj-con", P("con")],
    ["CTA", S + ".pj-cta-row", P("ctaRow")],
    ["카드", S + ".pj-cards", P("cards")],
  ],
  undeployed: [
    ["배지", S + ".pj-head .badge.only-und", IN('[class*="Badge-module"][class*="__badge"]')],
    ["CTA", S + ".pj-cta-row", P("ctaRow")],
    ["카드", S + ".pj-cards", P("cards")],
  ],
};

/*
  시안 상태 바 버튼을 누른다 — `stripViewerShell()`이 바를 가리기 **전에**.
  패널만 켜면 버튼에 딸린 헤더 페이즈가 따라오지 않는다(auth.mjs와 같은 방식).
*/
const clickState = (state) => `(() => {
  const sec = document.getElementById("scr-project");
  const btn = sec.querySelector('.sb[data-set=' + ${JSON.stringify(JSON.stringify(state))} + ']');
  if (!btn) return "버튼 없음";
  btn.click();
  return sec.dataset.state;
})()`;

/* dev DB에서 대조할 두 엔트리의 id를 받아 온다 */
const ids = spawnSync(
  "node",
  ["--env-file=.env.development.local", "--import", "tsx", "scripts/design-diff/project-ids.mts"],
  { cwd: REPO, encoding: "utf8" },
);
if (ids.status !== 0) throw new Error(`entryId를 못 찾았다:\n${ids.stderr}`);
const ENTRY = JSON.parse(ids.stdout.trim().split("\n").at(-1));
console.log(`① 정상 ${ENTRY.live}\n② 미배포 ${ENTRY.undeployed} (${ENTRY.undeployedTeam})`);

/* 구현본이 지금 어느 상태를 그리는지 — 주소가 있으면 정상이다 */
const stateOf = `(() => {
  if (!document.querySelector('[class*="project-module"][class*="__wrap"]')) return "없음";
  return document.querySelector('[class*="project-module"][class*="__url"]')
    ? "live" : "undeployed";
})()`;

const LIST_OF = { live: LIVE, undeployed: UND };
const plan = process.env.STATE ? [process.env.STATE] : ["live", "undeployed"];
for (const state of plan) {
  if (!LIST_OF[state]) throw new Error(`STATE는 live·undeployed 중 하나: ${state}`);
}

let total = 0;
for (const state of plan) {
  const list = LIST_OF[state];
  const path = `/projects/${state === "live" ? ENTRY.live : ENTRY.undeployed}`;

  for (const w of WIDTHS) {
    const spec = await withPage(async (p) => {
      /*
        ⚠️ 시안 뷰어를 **모션 감축으로 연다**(`RM`, 3355행). 그러면 `animateIn`이
        통째로 건너뛰어 `.score` 카운트업(750ms rAF)도, 카드 페이드도 돌지 않는다.
        시간으로 기다리는 방법은 통하지 않는다 — 헤드리스에서 rAF가 띄엄띄엄
        돌고 **폭을 바꿀 때마다 다시 세기** 때문에, 매번 세는 도중의 숫자를
        집었다(「480」 vs 「1,102」). 끝난 상태가 곧 원래 값이라 잃는 것은 없다.
      */
      await p.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }],
      });
      await p.goto(SPEC_URL + "#project");
      const got = await p.eval(clickState(state));
      if (got !== state) throw new Error(`시안 상태 전환 실패: ${got}`);
      await p.stripViewerShell();
      await p.eval(`(() => {
        /* 화면 전환 페이드를 끝낸다 — 안 끄면 캡처가 도중을 찍는다 */
        document.getElementById("scr-project")
          .getAnimations({ subtree: true })
          .forEach(a => { if (a.effect?.getTiming().iterations !== Infinity) a.finish(); });
        return 1;
      })()`);
      await p.resize(w, MEASURE_H);
      const r = await p.eval(run(list, "spec"));
      /* ⚠️ 글자는 **창을 다시 키우기 전에** 긁는다 — 그때 또 세기 시작한다 */
      r.text = {};
      for (const [n, sel] of TEXT_PAIRS[state]) r.text[n] = await p.eval(textNodes(sel));
      await p.resize(w, 900);
      await p.shot(`${OUT}/spec-${state}-${w}.png`);
      return r;
    });

    const impl = await withPage(async (p) => {
      /* 공개 화면이다. 다른 대조가 남긴 세션이 있으면 로그인 헤더로 그려진다 */
      await p.send("Network.clearBrowserCookies");
      await p.goto(IMPL_URL + path);
      const drawing = await p.eval(stateOf);
      if (drawing !== state) {
        throw new Error(`구현본이 ${drawing}을 그린다 — dev DB를 먼저 맞춘다`);
      }
      await p.resize(w, MEASURE_H);
      const r = await p.eval(run(list, "impl"));
      r.text = {};
      for (const [n, , sel] of TEXT_PAIRS[state]) r.text[n] = await p.eval(textNodes(sel));
      await p.resize(w, 900);
      await p.shot(`${OUT}/impl-${state}-${w}.png`);
      return r;
    });

    console.log(`\n\n████ ${state} · 폭 ${w}`);
    for (const m of spec.missing) console.log(`  ⚠️ 시안에서 못 찾음: ${m}`);
    for (const m of impl.missing) console.log(`  ⚠️ 구현본에서 못 찾음: ${m}`);
    total += spec.missing.length + impl.missing.length;
    total += diffTable(`${state} ${w}px — 참가작 상세`, spec.out, impl.out);
    for (const [n] of TEXT_PAIRS[state]) {
      total += diffText(spec.text[n], impl.text[n], { label: n });
    }
  }
}
console.log(`\n═══════════════════════════\n합계 불일치 ${total}건`);
console.log(`스크린샷: ${OUT}`);
