/*
  대시보드 허브 — 시안 `#scr-hub`의 「정상 흐름」 h1~h9와 `/dashboard`를 대조한다.

    STATE=h1 node scripts/design-diff/hub.mjs      # 한 판만
    node scripts/design-diff/hub.mjs               # h1~h9 전부

  ⚠️ **상태가 데이터로 갈린다.** 시안은 `<select id="hubSel">`로 바꾸지만 우리는
  dev DB가 정한다 — `hub-state.mts`가 페이즈·진도·온보딩·지표를 그 판으로 만들고
  세션 토큰을 준다. 이 스크립트가 알아서 부르고, 끝나면 `restore`로 되돌린다.
  구현본이 실제로 그 판을 그리는지(`data-pane`) 먼저 확인하고 다르면 멈춘다.

  ⚠️ **글자는 대부분 데이터다.** 마감 시각·순위·지표·팀명은 시안 목업과 dev DB가
  같을 수 없다. 그래서 문구 대조는 **제목·부제·골든패스 라벨·카드 라벨**처럼
  우리가 정본으로 쓰는 자리만 본다.

  ⚠️ 헤더(`.db-top`)와 사이드바(`.db-side`)는 이 화면이 아니라 크롬이다 —
  따로 옮긴다(`header-states.mjs`). 여기서는 `.db-body` 안만 잰다.
*/
import { execFileSync } from "node:child_process";

import {
  withPage, diffTable, diffText, textNodes,
  SPEC_URL, IMPL_URL, WIDTHS, shotDir, REPO,
} from "./cdp.mjs";

const OUT = shotDir("hub");

const CSS = [
  "font-size", "font-weight", "line-height", "letter-spacing",
  "color", "background-color", "background-image",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-bottom", "margin-left",
  "border-radius", "box-shadow", "gap", "display", "flex-wrap",
  "align-items", "align-self", "justify-content", "text-align",
  "width", "max-width", "font-family", "text-shadow",
  "font-variant-numeric", "vertical-align", "flex-grow", "flex-shrink",
  "grid-template-columns", "position", "overflow-x",
  "border-top-width", "border-top-style", "border-top-color",
  "border-bottom-width", "border-bottom-style", "border-bottom-color",
  "opacity",
];

const S = "#scr-hub ";
/** 그 판의 시안 셀렉터 접두 */
const P = (h) => `${S}.pane[data-id='${h}'] `;

/*
  구현본 셀렉터는 `{{이름}}`으로 적고, 브라우저 안에서 그 화면의 실제 모듈
  클래스(`hub-module__해시__이름`)로 바꾼다.

  ⚠️ **`[class*="__cd"]` 식으로 쓰면 안 된다.** 부분 일치라 `__cdLabel`·
  `__cdNote`에도 걸려서 `.hb-cd` 자리에 라벨이 잡힌다(2026-09-21에 h8이
  통째로 어긋나 보였다). 해시를 한 번 읽어 정확한 클래스로 만든다.
*/
const I = (n) => `{{${n}}}`;

/* 아홉 판이 같이 쓰는 머리 두 줄. 글자 길이가 달라 폭은 뺀다 */
const HEAD = [
  ["h1", S + ".pane.on .hb-h1", I("h1"), [], ["width"]],
  ["sub", S + ".pane.on .hb-sub", I("sub"), [], ["width"]],
];

/*
  골든패스 — 상자·머리·상태별 칸과 표식.

  ⚠️ **그 판에 실제로 있는 상태만 준다.** 시안 h1은 끝낸 칸이 없어 `done`이
  아예 없다 — 목록에 넣으면 양쪽 다 「못 찾음」으로 뜨고, 결손 둘이 폭마다
  쌓여 실제 어긋남을 덮는다.
*/
const GP = (h, states = ["done", "now", "wait"]) => [
  ["gp", P(h) + ".gp", I("gp")],
  ["gp-t", P(h) + ".gp-t", I("gpTitle"), [], ["width"]],
  ...states.flatMap((k) => [
    [`gp-i.${k}`, P(h) + `.gp-i.${k}`, `${I("gpItem")}${I(k)}`],
    [`gp-i.${k} .mk`, P(h) + `.gp-i.${k} .mk`, `${I(k)} ${I("mark")}`],
  ]),
];

/*
  주 행동 상자. 글자가 달라 폭은 뺀다.

  ⚠️ 버튼의 `margin-left`도 뺀다. `auto`라 **앞 문단의 폭이 정하는데** 그
  문단에 마감 시각·주소 같은 데이터가 섞여 있다(h2에서 날짜 한 자리 차이로
  3.39px이 났다). 버튼 자체의 폭·높이는 양쪽이 같은 것을 확인했다.
*/
const HERO = (h) => [
  ["act.hero", P(h) + ".act.hero", `${I("act")}${I("hero")}`],
  ["act h3", P(h) + ".act.hero h3", `${I("hero")} h3`, [], ["width"]],
  ["act p", P(h) + ".act.hero p", `${I("hero")} p`, [], ["width"]],
  ["act .btn", P(h) + ".act.hero .btn", `${I("hero")} ${I("actBtn")}`, [], ["margin-left"]],
];

const SUM = (h) => [
  ["hb-sum", P(h) + ".hb-sum", I("sum")],
  ["hb-sum div", P(h) + ".hb-sum div", `${I("sum")} > div`],
  ["hb-sum span", P(h) + ".hb-sum span", `${I("sum")} span`, [], ["width"]],
  ["hb-sum b", P(h) + ".hb-sum b", `${I("sum")} b`, [], ["width"]],
];

const SNAP = (h) => [
  ["snap", P(h) + ".snap", I("snap")],
  ["snap .card", P(h) + ".snap .card", I("snapCard")],
  ["snap small", P(h) + ".snap small", `${I("snap")} small`, [], ["width"]],
  ["snap .score", P(h) + ".snap .score", `${I("snap")} .score`, [], ["width"]],
];

const LOCK = (h) => [
  ["lockpill", P(h) + ".lockpill", I("lockpill"), [], ["width"]],
];

/*
  판별 목록. 시안의 구조를 위에서 아래로 그대로 따라간다 —
  빠진 것이 있으면 「구현본에서 못 찾음」으로 뜬다.
*/
const LIST = {
  /* 시안 h1은 1번이 진행 중, 2번이 대기 — 끝낸 칸이 없다 */
  h1: [...HEAD, ...GP("h1", ["now", "wait"]), ...HERO("h1"),
    ["gp 칩", P("h1") + ".gp-i .chip", `${I("gpItem")} ${I("rgt")}`, [], ["width", "margin-left"]]],
  h2: [...HEAD, ...GP("h2"), ...HERO("h2")],
  h3: [...HEAD,
    ["act(카운트다운)", P("h3") + ".act", `${I("act")}${I("actGap")}`],
    ["cd 라벨", P("h3") + ".act small", I("cdLabel"), [], ["width"]],
    ["hb-cd", P("h3") + ".hb-cd", I("cd"), [], ["width"]],
    ["마감 칩", P("h3") + ".act .chip", `${I("actGap")} ${I("selfCenter")}`, [], ["width"]],
    ...GP("h3"), ...HERO("h3"),
    /*
      ⚠️ **칩의 font-weight는 재지 않는다.** 시안 h3은 2·3번 칸을 **동시에**
      `now`로 칠해서 칩이 700을 상속받는다 — 우리는 미체크 중 첫 칸만 `now`라
      3번이 `wait`다(hub-read.ts `steps` 주석: h1·h2·h5는 순차이고 h3만
      다르다. 「지금 할 것 하나」에 맞춰 순차로 통일했다).
    */
    ["gp 칩", P("h3") + ".gp-i .chip", `${I("gpItem")} ${I("rgt")}`, [],
      ["width", "margin-left", "font-weight"]]],
  h4: [...HEAD, ...SUM("h4"), ...LOCK("h4")],
  h5: [...HEAD, ...GP("h5"), ...SUM("h5"), ...HERO("h5")],
  h6: [...HEAD,
    ["hb-cards", P("h6") + ".hb-cards", I("cards")],
    ["kpi", P("h6") + ".hb-cards .card", I("kpi")],
    ["kpi small", P("h6") + ".hb-cards small", `${I("cards")} small`, [], ["width"]],
    ["kpi .score", P("h6") + ".hb-cards .score", `${I("cards")} .score`, [], ["width"]],
    ["act.hero", P("h6") + ".act.hero", `${I("act")}${I("hero")}`],
    ["act h3", P("h6") + ".act.hero h3", `${I("hero")} h3`, [], ["width"]],
    ["act p", P("h6") + ".act.hero p", `${I("hero")} p`, [], ["width"]],
    ["버튼 묶음", P("h6") + '.act.hero > span[style*="margin-left"]', I("actBtns")],
    ["btn 1", P("h6") + ".act.hero .btn-primary", `${I("actBtns")} button${I("actBtn")}`, [], ["width"]],
    ["btn 2", P("h6") + ".act.hero .btn-outline", `${I("actBtns")} a${I("actBtn")}`, [], ["width"]]],
  h7: [...HEAD, ...SNAP("h7"), ...LOCK("h7")],
  h8: [...HEAD,
    ["act.hero", P("h8") + ".act.hero", `${I("act")}${I("hero")}`],
    ["cd 라벨", P("h8") + ".act.hero small", I("cdLabel"), [], ["width"]],
    ["hb-cd", P("h8") + ".hb-cd", I("cd"), [], ["width"]],
    ["hb-cd span", P("h8") + ".hb-cd span", I("cdUnit"), [], ["width"]],
    ["순위 설명", P("h8") + '.act.hero p[style*="margin-top"]', I("cdNote"), [], ["width"]],
    ["수상 배지", P("h8") + ".act.hero .badge", I("awardBadge"), [], ["width"]],
    ["act(보증금)", P("h8") + ".act:not(.hero)", `${I("act")}:not(${I("hero")})`],
    ["보증금 h3", P("h8") + ".act:not(.hero) h3", `${I("act")}:not(${I("hero")}) h3`, [], ["width"]],
    ["보증금 p", P("h8") + ".act:not(.hero) p", `${I("act")}:not(${I("hero")}) p`, [], ["width"]],
    ["보류 배지", P("h8") + ".act:not(.hero) .badge", `${I("actBtnsCenter")} [class*="Badge-module"]`, [], ["width"]],
    /*
      ⚠️ **보증금 버튼의 색은 재지 않는다.** 시안은 활성 `btn-outline`(라임
      테두리·라임 글자)인데 우리는 `disabled`다 — 보증금이 도입 미정이라 갈
      곳이 없고, 눌러도 아무 일이 없는 버튼보다 잠긴 버튼이 정직하다(내가
      정함, 2026-09-21). 옆 배지가 그 사실을 이미 말한다.
    */
    ["보증금 버튼", P("h8") + ".act:not(.hero) .btn", `${I("actBtnsCenter")} ${I("actBtn")}`, [],
      ["width", "color", "background-color", "border-top-color", "border-bottom-color"]]],
  h9: [...HEAD, ...SNAP("h9")],
};

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
    for (const pe of ["::before", "::after"]) {
      const pcs = getComputedStyle(el, pe);
      if (pcs.content === "none") continue;
      for (const p of ["content","position","width","height","background","color","margin-right"]) {
        let v = pcs.getPropertyValue(p);
        if (p.startsWith("background")) v = v.replace(/ 0%/g, " 0px");
        out[name + pe + " " + p] = v;
      }
    }
    out[name + " ▸가로 넘침"] = String(el.scrollWidth > el.clientWidth + 1);
    /* 형제 수는 값이 아니라 구조다 — 카드가 셋이면 셋이어야 한다 */
    if (["gp", "hb-cards", "snap", "hb-sum"].includes(name)) {
      out[name + " ▸자식 수"] = String(el.children.length);
    }
  }
  return { out, missing };
})()`;

/*
  자리표(`{{이름}}`)를 그 화면의 실제 모듈 클래스로 바꾼다.

  ⚠️ **브라우저 밖에서 바꾼다.** 안에서 하면 글자 대조(`textNodes`)가 자리표를
  그대로 받아 터진다 — 셀렉터를 넘기는 자리가 둘이다.
*/
const hashOf = `(() => {
  const e = document.querySelector('[class*="hub-module__"]');
  return e ? (e.className.match(/hub-module__([A-Za-z0-9_-]+?)__/) || [])[1] : null;
})()`;

const fixer = (hash) => (sel) =>
  sel.replace(/\{\{(\w+)\}\}/g, (_, n) => `.hub-module__${hash}__${n}`);

const run = (list, side, fix = (v) => v) =>
  probe().replace("LIST", JSON.stringify(list.map(([n, s, i, x, k]) =>
    side === "spec" ? [n, s, x, k] : [n, fix(i), x, k])));

/*
  글자 대조. 우리가 정본으로 쓰는 자리만 본다 — 제목·부제·골든패스 라벨·
  카드 라벨. 값(마감·순위·지표·주소·팀명)은 데이터라 아래 IGNORE가 거른다.
*/
const TEXT = {
  h1: [["머리", S + ".pane.on .hb-h1", I("h1")], ["부제", S + ".pane.on .hb-sub", I("sub")],
       ["골든패스", P("h1") + ".gp", I("gp")]],
  h2: [["머리", S + ".pane.on .hb-h1", I("h1")], ["부제", S + ".pane.on .hb-sub", I("sub")],
       ["골든패스", P("h2") + ".gp", I("gp")]],
  h3: [["머리", S + ".pane.on .hb-h1", I("h1")], ["부제", S + ".pane.on .hb-sub", I("sub")],
       ["골든패스", P("h3") + ".gp", I("gp")]],
  h4: [["머리", S + ".pane.on .hb-h1", I("h1")], ["부제", S + ".pane.on .hb-sub", I("sub")],
       ["요약 라벨", P("h4") + ".hb-sum", I("sum")], ["잠금", P("h4") + ".lockpill", I("lockpill")]],
  h5: [["머리", S + ".pane.on .hb-h1", I("h1")], ["부제", S + ".pane.on .hb-sub", I("sub")],
       ["골든패스", P("h5") + ".gp", I("gp")]],
  h6: [["머리", S + ".pane.on .hb-h1", I("h1")], ["부제", S + ".pane.on .hb-sub", I("sub")],
       ["카드 라벨", P("h6") + ".hb-cards", I("cards")]],
  h7: [["머리", S + ".pane.on .hb-h1", I("h1")], ["부제", S + ".pane.on .hb-sub", I("sub")],
       ["확정 라벨", P("h7") + ".snap", I("snap")]],
  h8: [["부제", S + ".pane.on .hb-sub", I("sub")],
       ["보증금", P("h8") + ".act:not(.hero)", `${I("act")}:not(${I("hero")})`]],
  h9: [["부제", S + ".pane.on .hb-sub", I("sub")],
       ["확정 라벨", P("h9") + ".snap", I("snap")]],
};

/*
  ⚠️ 데이터로 갈리는 글자를 거른다.

  숫자·날짜·주소·팀명은 시안 목업(리틀포션 471명 …)과 dev DB가 같을 수 없다.
  ✓와 번호는 표식이라 `.mk` 값으로 따로 본다.
*/
const IGNORE = [
  /^✓$/, /^\d+$/,
  /\d/,                       // 마감·지표·순위가 섞인 줄
  /proovit\.kr/,              // 주소
  /명$/, /%$/, /^₩/, /^-$/, /^—$/,
  /대기|진행 중/,             // 온보딩 칩 — 시안도 우리도 상태로 갈린다
];

/*
  시안의 판 이름(h1~h9)과 구현본이 찍는 판 이름(`data-pane`)의 대응.
  hub-state.ts의 `HubPane`과 짝이다 — 한쪽을 고치면 여기도 고친다.
*/
const PANE_OF = {
  h1: "onboarding", h2: "s1", h3: "s2", h4: "gate1", h5: "s3",
  h6: "race", h7: "gate2", h8: "awarded", h9: "archived",
};

/* 구현본이 지금 어느 판을 그리는지 */
const paneOf = `(document.querySelector('[data-probe="hub"]')?.dataset.pane ?? "없음")`;

/** 시안의 판 고르개. `stripViewerShell()`이 상태 바를 가리기 전에 누른다 */
const pickPane = (h) => `(() => {
  const sel = document.getElementById("hubSel");
  sel.value = ${JSON.stringify(h)};
  sel.dispatchEvent(new Event("change"));
  const on = document.querySelector("#scr-hub .pane.on");
  return on ? on.dataset.id : "켜진 패널 없음";
})()`;

/** 그 판의 dev DB 상태를 만들고 세션 토큰을 받는다 */
const setup = (h) =>
  execFileSync("node", [
    "--env-file=.env.development.local", "--import", "tsx",
    "scripts/design-diff/hub-state.mts", h,
  ], { cwd: REPO, encoding: "utf8" }).trim().split("\n").pop();

const PANES = process.env.STATE ? [process.env.STATE] : Object.keys(LIST);
for (const h of PANES) {
  if (!LIST[h]) throw new Error(`STATE는 h1~h9 중 하나: ${h}`);
}

/* 지금 dev DB를 떠 둔다 — 끝나면 그대로 되돌린다 */
const state = (...args) =>
  execFileSync("node", [
    "--env-file=.env.development.local", "--import", "tsx",
    "scripts/design-diff/hub-state.mts", ...args,
  ], { cwd: REPO, encoding: "utf8" });
console.log(state("save").trim());

let total = 0;
try {
  for (const h of PANES) {
    const token = setup(h);
    const list = LIST[h];
    const texts = TEXT[h];

    for (const w of WIDTHS) {
      const spec = await withPage(async (p) => {
        /*
          ⚠️ 감축 모션으로 연다. 시안 뷰어는 화면이 들어올 때 `.score`를 0부터
          세고(`countUp`, 750ms rAF) **폭을 바꿀 때마다 다시 센다.** 헤드리스에서는
          rAF가 띄엄띄엄 돌아 시간으로 기다려도 세는 도중의 숫자를 집는다
          (참가작 상세에서 겪은 것과 같다).
        */
        await p.send("Emulation.setEmulatedMedia", {
          features: [{ name: "prefers-reduced-motion", value: "reduce" }],
        });
        await p.goto(SPEC_URL + "#hub");
        const picked = await p.eval(pickPane(h));
        if (picked !== h) throw new Error(`시안 판 전환 실패: ${picked}`);
        await p.stripViewerShell();
        await p.eval(`(() => {
          /* 전환 애니메이션(fadeUp)을 끝낸다 — 캡처가 페이드 도중을 찍지 않게 */
          document.getElementById("scr-hub").getAnimations({ subtree: true })
            .forEach(a => { if (a.effect?.getTiming().iterations !== Infinity) a.finish(); });
          return 1;
        })()`);
        await p.resize(w, 520);
        const r = await p.eval(run(list, "spec"));
        r.text = {};
        for (const [n, sel] of texts) r.text[n] = await p.eval(textNodes(sel));
        await p.resize(w, 900);
        await p.shot(`${OUT}/spec-${h}-${w}.png`);
        return r;
      });

      const impl = await withPage(async (p) => {
        await p.send("Network.clearBrowserCookies");
        await p.send("Network.setCookie", {
          name: "authjs.session-token", value: token,
          domain: new URL(IMPL_URL).hostname, path: "/",
        });
        await p.goto(IMPL_URL + "/dashboard");
        const fix = fixer(await p.eval(hashOf));
        const pane = await p.eval(paneOf);
        if (pane !== PANE_OF[h]) {
          throw new Error(`구현본이 ${pane}을 그린다 — ${h}는 ${PANE_OF[h]}여야 한다`);
        }
        await p.resize(w, 520);
        const r = await p.eval(run(list, "impl", fix));
        r.text = {};
        for (const [n, , sel] of texts) r.text[n] = await p.eval(textNodes(fix(sel)));
        await p.resize(w, 900);
        await p.shot(`${OUT}/impl-${h}-${w}.png`);
        return r;
      });

      console.log(`\n\n████ ${h} · 폭 ${w}`);
      for (const m of spec.missing) console.log(`  ⚠️ 시안에서 못 찾음: ${m}`);
      for (const m of impl.missing) console.log(`  ⚠️ 구현본에서 못 찾음: ${m}`);
      total += spec.missing.length + impl.missing.length;
      total += diffTable(`${h} ${w}px — 허브`, spec.out, impl.out);
      for (const [n] of texts) {
        total += diffText(spec.text[n], impl.text[n], { ignore: IGNORE, label: n });
      }
    }
  }
} finally {
  console.log(state("restore").trim());
}

console.log(`\n═══════════════════════════\n합계 불일치 ${total}건`);
console.log(`스크린샷: ${OUT}`);
