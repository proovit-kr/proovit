/*
  스테이지 제출 — 시안 `#scr-submit` 다섯 탭과 `/dashboard/submit/:stageKey`를 대조한다.

    STATE=s3 node scripts/design-diff/submit.mjs   # 한 판만
    node scripts/design-diff/submit.mjs            # s1~s5 전부

  ⚠️ **상태가 데이터로 갈린다.** 시안은 `.st-tab`을 눌러 `.pane.on`을 바꾸지만
  우리는 라우트가 판이고 내용은 제출 행·판정·일정이 정한다. `submit-state.mts`가
  그 판을 만들고 세션 토큰을 준다 — s1·s2·s3·s5는 「s3」 상태(s1 제출됨·s2 통과·
  s3 임시저장·s5 예정) 하나에서, s4는 「s4」 상태(1주차 작성 중)에서 본다.

  ⚠️ 시안과 일부러 다른 자리는 재지 않는다(StageForm.tsx 머리 주석):
    · 증빙 파일의 드롭 칸(`.drop`) — 열린 판에만 그린다. 시안은 잠긴 s1·s5에 있고 작성 중인
      s4에 없다. 그 칸(`.fld`)과 `.frm`의 높이를 안 보고, 드롭 칸 자체는 s3에서 본다.
    · 파일 칩의 이름은 링크(`<a>`), ×는 버튼이다 — 시안은 글자와 `<i>`다.
    · 힌트는 절 단위로 접는다(Clauses) — 좁은 폭에서 시안보다 한 줄 길 수 있다(s1 ① 페르소나).
    · s1의 버튼 둘 — dev 일정상 s1은 마감이 지나 「마감됨」 하나다.
    · s4의 「1주차 제출됨」 칩 — dev 일정은 s4가 한 주라 2주차가 없다.
    · s5의 토글 두 개의 켜짐과 버튼 색 — 아직 안 열린 판이라 꺼져 있고 잠겨 있다.
    · 시안 s1 ③의 빈 `.seg-p` 둘 — 그 칸(`.fld`)의 높이를 안 본다.

  헤더(`.db-top`)와 사이드바(`.db-side`)는 크롬이라 `header-states.mjs`가 본다.
  네 축 — 값·상태(hover)·글자·구조.
*/
import { execFileSync } from "node:child_process";

import {
  withPage, diffTable, diffText, textNodes,
  SPEC_URL, IMPL_URL, WIDTHS, shotDir, REPO,
} from "./cdp.mjs";

const OUT = shotDir("submit");

const CSS = [
  "font-size", "font-weight", "line-height", "letter-spacing",
  "color", "background-color", "background-image",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-bottom", "margin-left", "margin-right",
  "border-radius", "box-shadow", "gap", "display", "flex-wrap",
  "align-items", "justify-content", "text-align",
  "width", "height", "font-family",
  "flex-grow", "flex-shrink", "flex-basis",
  "grid-template-columns",
  "border-top-width", "border-top-style", "border-top-color",
  "border-bottom-width", "border-bottom-style", "border-bottom-color",
  "opacity",
];

/* 시안은 판마다 `.pane`이 따로 있고 켜진 것만 `.on`이다 */
const S = "#scr-submit .pane.on ";
const HEAD = "#scr-submit ";
const ROOT = '[data-probe="submit"] ';

const I = (n) => `{{${n}}}`;
const H = (n) => `{{hub:${n}}}`;
const F = (n) => `[class*="Field-module__"][class*="__${n}"]`;
const INP = F("inp");
const LABEL = F("label");
const HINT = F("hint");
const ROWSW = F("rowSw");
const SW = F("sw");
const BADGE = '[class*="Badge-module"]';
const CHIP = '[class*="Surface-module__"][class*="__chip"]';
const CARD = '[class*="Surface-module__"][class*="__card"]';
const BTN = '[class*="Button-module__"][class*="__btn"]';
/* 폼 상자의 k번째 div — 시안과 우리의 순서가 같다(증빙 파일은 맨 뒤라 앞 번호가 안 밀린다) */
const D = (k) => `> div:nth-of-type(${k}) `;

/*
  ⚠️ `input.inp.mono`는 시안에서 모노로 안 나온다(Field.module.css 주석) —
  그 입력의 font-family·height는 뺀다. 값이 길면 스크롤되므로 넘침도 안 본다.
*/
const MONO = ["font-family", "height", "overflow"];
/* 인라인 요소의 1/64px(LayoutUnit) 어긋남 */
const W = ["width"];

/* 자식 수를 세는 이름 — 시안 `.only-*`처럼 숨긴 것은 빼고 센다 */
const COUNT = new Set([
  "tabs", "hd", "meta", "info", "ft", "sp", "chkl", "ro", "tags", "snap", "consents",
  "fld2", "pair", "weeks",
]);

const tab = (k) => [
  [`tab ${k}`, HEAD + `.st-tab:nth-child(${k})`, `${I("tabs")} > a:nth-child(${k})`, [], W],
  [`tab ${k} k`, HEAD + `.st-tab:nth-child(${k}) .k`, `${I("tabs")} > a:nth-child(${k}) ${I("k")}`, [], W],
];
const tabBadge = (k) => [`tab ${k} badge`, HEAD + `.st-tab:nth-child(${k}) .badge`, `${I("tabs")} > a:nth-child(${k}) ${BADGE}`, [], W];
const tabChip = (k) => [`tab ${k} chip`, HEAD + `.st-tab:nth-child(${k}) .chip`, `${I("tabs")} > a:nth-child(${k}) ${CHIP}`, [], W];

const COMMON = (badgeTone, ftSkip = []) => [
  ["h1", HEAD + ".hb-h1", H("h1"), [], W],
  ["sub", HEAD + ".hb-sub", H("sub"), [], W],
  ["tabs", HEAD + ".st-tabs", I("tabs")],
  ...tab(1), ...tab(2), ...tab(3), ...tab(4), ...tab(5),
  tabBadge(1), tabBadge(2), tabBadge(3), tabChip(4), tabChip(5),
  ["tab on", HEAD + ".st-tab.on", I("on"), [], W],
  ["tab on k", HEAD + ".st-tab.on .k", `${I("on")} ${I("k")}`, [], W],
  /* 증빙 파일 칸의 높이가 판마다 갈린다(머리 주석) — 높이를 안 본다 */
  ["frm", S.trim(), ROOT.trim(), [], ["height"]],
  ["hd", S + D(1).trim(), ROOT + D(1).trim()],
  ["hd h2", S + D(1) + "h2", ROOT + D(1) + "h2", [], W],
  /* 마감·제출자·시각은 데이터라 좁은 폭에서 접히는 줄 수가 다르다 — 높이는 390에서 안 본다 */
  ["meta", S + D(2).trim(), ROOT + D(2).trim(), [], [], ["height"]],
  ["meta span", S + D(2) + "span", ROOT + D(2) + "span", [], W, ["height"]],
  ["ft", S + ".frm-ft", I("frmFt"), [], ftSkip, ["height"]],
  ["who", S + ".frm-ft .who", I("who"), [], W, ["height"]],
  ...(badgeTone ? [["hd badge", S + D(1) + ".badge", ROOT + D(1) + BADGE, [], W]] : []),
];

/* 칸 하나의 뼈대 — 상자·라벨·부연·힌트 */
const fld = (k, { hint = true, small = false, no = false, cnt = false, skip = [], narrow = [] } = {}) => [
  [`fld ${k}`, S + D(k).trim(), ROOT + D(k).trim(), [], skip, narrow],
  [`fld ${k} label`, S + D(k) + "> label", ROOT + D(k) + `> ${LABEL}`, [], W],
  ...(small ? [[`fld ${k} small`, S + D(k) + "> label small", ROOT + D(k) + `> ${LABEL} small`, [], W]] : []),
  ...(no ? [[`fld ${k} no`, S + D(k) + ".no", ROOT + D(k) + I("no"), [], W]] : []),
  ...(cnt ? [[`fld ${k} cnt`, S + D(k) + ".cnt", ROOT + D(k) + F("cnt"), [], W]] : []),
  ...(hint ? [[`fld ${k} hint`, S + D(k) + "> .hint", ROOT + D(k) + `> ${HINT}`, [], [], narrow]] : []),
];
const input = (k, mono = false) => [`fld ${k} input`, S + D(k) + "> input.inp", ROOT + D(k) + `> ${INP}`, [], mono ? MONO : []];
const textarea = (k) => [`fld ${k} textarea`, S + D(k) + "textarea.inp", ROOT + D(k) + "textarea"];
const select = (k) => [`fld ${k} select`, S + D(k) + "select.inp", ROOT + D(k) + "select"];
const fgrp = (k, small = true) => [
  [`fgrp ${k}`, S + D(k).trim(), ROOT + D(k).trim()],
  [`fgrp ${k} n`, S + D(k) + ".n", ROOT + D(k) + I("n"), [], W],
  [`fgrp ${k} b`, S + D(k) + "b", ROOT + D(k) + "b", [], W],
  ...(small ? [[`fgrp ${k} small`, S + D(k) + "small", ROOT + D(k) + "small", [], W]] : []),
];
/*
  체크박스의 글꼴·색은 시안에선 UA 기본값(Arial 13.33px·검정)이고 우리는 preflight가
  물려준 값이다 — 그리는 데 쓰이지 않는다(accent-color가 그린다). 그 em으로 정한
  margin-top은 값으로 맞췄으니(submit.module.css) 그것만 본다.
*/
const CHECKBOX = ["font-size", "line-height", "letter-spacing", "color", "font-family"];
const chkl = (k) => [
  ["chkl", S + D(k) + ".chkl", ROOT + D(k) + I("chkl")],
  [`chkl ${k} label`, S + D(k) + ".chkl > label", ROOT + D(k) + `${I("chkl")} > label`],
  [`chkl ${k} input`, S + D(k) + ".chkl > label input", ROOT + D(k) + `${I("chkl")} > label input`, [], CHECKBOX],
  [`chkl ${k} span`, S + D(k) + ".chkl > label > span", ROOT + D(k) + `${I("chkl")} > label > span`],
];
const guideMemo = (g, m) => [
  ...fld(g, { hint: false, small: true }),
  ...chkl(g),
  ...fld(m, { hint: false, small: true }),
  textarea(m),
];
const ro = (k, scores = 1) => [
  ["ro", S + D(k) + ".ro", ROOT + D(k) + I("ro")],
  ...Array.from({ length: scores }, (_, i) => [
    `ro ${k} score ${i + 1}`,
    S + D(k) + `.ro .score:nth-child(${i + 1})`,
    ROOT + D(k) + `${I("ro")} .score:nth-child(${i + 1})`,
    [], W,
  ]),
  /* `margin-left:auto`의 계산값이 1/64px 어긋난다 */
  [`ro ${k} lk`, S + D(k) + ".ro .lk", ROOT + D(k) + I("lk"), [], [...W, "margin-left"]],
];
/*
  ⚠️ 시안 `.tags input`은 `font-family:inherit`이 없어 UA 기본(Arial)로 그려진다 —
  `.inp`에는 있다. 우리는 상속을 따른다. 좁은 폭에서 입력이 제 줄을 차지하면
  Arial의 글줄이 1px 낮아 상자 높이가 갈린다.
*/
const tags = (k) => [
  ["tags", S + D(k) + ".tags", ROOT + D(k) + I("tags"), [], [], ["height"]],
  [`tag ${k}`, S + D(k) + ".tag", ROOT + D(k) + I("tag"), [], W],
  [`tag ${k} x`, S + D(k) + ".tag i", ROOT + D(k) + I("tagX"), [], W],
  [`tags ${k} input`, S + D(k) + ".tags > input", ROOT + D(k) + `${I("tags")} > input`, [], [...W, "font-family"], ["height"]],
];
const rowSw = (k, { small = true, sw = true } = {}) => [
  [`rowsw ${k}`, S + D(k) + ".row-sw", ROOT + D(k) + ROWSW],
  [`rowsw ${k} b`, S + D(k) + ".row-sw b", ROOT + D(k) + `${ROWSW} b`, [], W],
  ...(small ? [[`rowsw ${k} small`, S + D(k) + ".row-sw small", ROOT + D(k) + `${ROWSW} small`, [], W]] : []),
  [`rowsw ${k} sw`, S + D(k) + ".row-sw .sw", ROOT + D(k) + `${ROWSW} ${SW}`],
  ...(sw ? [[`rowsw ${k} sw i`, S + D(k) + ".row-sw .sw i", ROOT + D(k) + `${ROWSW} ${SW} i`]] : []),
];
/* 올린 파일 칩과 드롭 칸 */
const file = (k) => [
  [`file ${k}`, S + D(k) + ".file", ROOT + D(k) + I("file"), [], W],
  [`file ${k} x`, S + D(k) + ".file i", ROOT + D(k) + I("fileX"), [], W],
];
const drop = (k) => [
  [`drop ${k}`, S + D(k) + ".drop", ROOT + D(k) + I("drop")],
  [`drop ${k} b`, S + D(k) + ".drop b", ROOT + D(k) + `${I("drop")} b`, [], W],
];
const pair = (ghost, primary, { primarySkip = [] } = {}) => [
  ["sp", S + ".frm-ft .sp", I("sp"), [], ["margin-left"]],
  ["sp ghost", S + `.frm-ft .sp .${ghost}`, `${I("sp")} button[value="draft"]`, [], W],
  ["sp primary", S + `.frm-ft .sp .${primary}`, `${I("sp")} button[value="submit"]`, [], [...W, ...primarySkip]],
];

const LIST = {
  s1: [
    ...COMMON(true),
    ["info", S + ".info-strip", H("infoStrip")],
    ...fld(4, { cnt: true }), input(4),
    ...fgrp(5),
    /* 힌트는 문장·쉼표 절 단위로만 접는다(Clauses) — 390에서 시안보다 한 줄 길다 */
    ...fld(6, { no: true, cnt: true, narrow: ["height"] }), textarea(6),
    ...fld(7, { no: true, cnt: true }), input(7),
    /* 「문제 정의 상세」 — 세그와 두 판(`.seg-p`). 파일 판은 감춰져 있다 */
    ...fld(8, { hint: false, small: true }),
    ["seg 8", S + D(8) + ".seg", ROOT + D(8) + I("seg")],
    ["seg 8 on", S + D(8) + ".seg button.on", ROOT + D(8) + `${I("seg")} ${I("segOn")}`, [], W],
    ["seg 8 off", S + D(8) + ".seg button:not(.on)", ROOT + D(8) + `${I("seg")} button:not(${I("segOn")})`, [], W],
    ["seg-p 8", S + D(8) + "> div:nth-of-type(2)", ROOT + D(8) + "> div:nth-of-type(2)"],
    ["fld 8 textarea", S + D(8) + "textarea.inp", ROOT + D(8) + "textarea"],
    ...fgrp(9),
    /* 시안 ③은 빈 `.seg-p` 둘이 있어 높이를 안 본다(머리 주석) */
    ...fld(10, { no: true, small: true, skip: ["height"] }),
    /* 모노 입력이 든 줄은 그 줄 높이가 같이 늘어 옆 칸도 늘어난다(grid stretch) */
    ["fld2", S + D(10) + ".fld-2", ROOT + D(10) + I("fld2"), [], ["height"]],
    ["fld2 mono", S + D(10) + ".fld-2 input.mono", ROOT + D(10) + `${I("fld2")} ${INP}:first-child`, [], MONO],
    ["fld2 input", S + D(10) + ".fld-2 input:not(.mono)", ROOT + D(10) + `${I("fld2")} ${INP}:last-child`, [], ["height"]],
    ["seg", S + D(10) + ".seg", ROOT + D(10) + I("seg")],
    ["seg on", S + D(10) + ".seg button.on", ROOT + D(10) + `${I("seg")} ${I("segOn")}`, [], W],
    ["seg off", S + D(10) + ".seg button:not(.on)", ROOT + D(10) + `${I("seg")} button:not(${I("segOn")})`, [], W],
    ["fld 10 textarea", S + D(10) + "> textarea.inp", ROOT + D(10) + "> textarea"],
    ...fld(11, { no: true, cnt: true }), textarea(11),
    ...fgrp(12),
    ...fld(13, { no: true, small: true }),
    ["pair", S + D(13) + ".pair", ROOT + D(13) + I("pair")],
    ["pair a", S + D(13) + ".pair input:first-child", ROOT + D(13) + `${I("pair")} ${INP}:first-child`],
    ["pair b", S + D(13) + ".pair input:last-child", ROOT + D(13) + `${I("pair")} ${INP}:last-child`],
    ...fld(14, { no: true, cnt: true }), textarea(14),
    ...fgrp(15),
    ...fld(16, { no: true, cnt: true }), input(16),
    ...fld(17, { hint: false, small: true }),
    ["fld 17 input a", S + D(17) + "> input:first-of-type", ROOT + D(17) + `> ${INP}:first-of-type`],
    ["fld 17 input b", S + D(17) + "> input:last-of-type", ROOT + D(17) + `> ${INP}:last-of-type`],
    ...fld(18, { hint: false, no: true, small: true }), textarea(18),
    ...fld(19, { no: true, small: true }), textarea(19),
    ...fgrp(20),
    ...fld(21, { no: true, small: true }), select(21),
    ...fld(22, { hint: false, small: true }), input(22),
    ...fld(23, { cnt: true }), textarea(23),
    ...fgrp(24, false),
    ...fld(25, { cnt: true }), textarea(25),
    ...guideMemo(26, 27),
    /* 증빙 파일 — 시안은 드롭 칸 + 칩 둘, 우리 s1은 마감돼 칩 둘뿐(머리 주석) */
    ...fld(28, { hint: false, small: true, skip: ["height"] }), ...file(28),
    ["cnt-note", S + ".cnt-note", I("cntNote")],
    /* 버튼 둘은 안 본다 — s1은 dev 일정상 마감이 지나 「마감됨」 하나다(머리 주석) */
  ],
  s2: [
    ...COMMON(true),
    ["info", S + ".info-strip", H("infoStrip")],
    /* 모노 입력이 든 칸은 높이가 2px 다르다(MONO 주석) */
    ...fld(4, { hint: false, small: true, skip: ["height"] }), input(4, true),
    ...fld(5, { hint: false, small: true }), ...ro(5),
    ...fld(6, { hint: false, small: true }), ...ro(6),
    ...fld(7, { hint: false, small: true }), ...ro(7),
    ...fld(8, { small: true, narrow: ["height"] }), ...tags(8),
    ...fld(9, { hint: false, small: true, skip: ["height"] }), input(9, true),
    ...guideMemo(10, 11),
    ...fld(12, { hint: false, small: true }), ...file(12),
    ["sp", S + ".frm-ft .sp", I("sp"), [], ["margin-left"]],
    ["sp locked", S + ".frm-ft .sp .btn", `${I("sp")} ${BTN}`, [], W],
  ],
  s3: [
    ...COMMON(true),
    ...fld(3, { skip: ["height"] }), input(3, true),
    ...fld(4, { small: true }), select(4),
    ...fld(5, { hint: false }), ...rowSw(5),
    ["warn-off", S + D(5) + ".warn-off", ROOT + D(5) + I("warnOff")],
    ...fld(6, { hint: false, small: true }), ...rowSw(6),
    ...fld(7, { hint: false, small: true }),
    ["fld 7 hint", S + D(7) + "> .hint", ROOT + D(7) + `> ${HINT}`],
    ...chkl(7),
    ["grp a", S + D(7) + ".chkl > div:nth-of-type(1)", ROOT + D(7) + `${I("chkl")} > div:nth-of-type(1)`, [], W],
    ["grp b", S + D(7) + ".chkl > div:nth-of-type(2)", ROOT + D(7) + `${I("chkl")} > div:nth-of-type(2)`, [], W],
    ["chk key", S + D(7) + ".chkl > label .k", ROOT + D(7) + `${I("chkl")} > label ${I("chkKey")}`, [], W],
    ["b0", S + D(7) + ".b0", ROOT + D(7) + I("b0")],
    ["b0 label", S + D(7) + ".b0 label", ROOT + D(7) + `${I("b0")} label`],
    ["b-hint", S + D(7) + ".b-hint", ROOT + D(7) + I("bHint")],
    ["chkl-b", S + D(7) + ".chkl-b", ROOT + D(7) + I("chklB")],
    ["chkl-b label", S + D(7) + ".chkl-b label", ROOT + D(7) + `${I("chklB")} label`],
    ...guideMemo(8, 9),
    ...fld(10, { hint: false, small: true }), ...drop(10),
    ...pair("btn-ghost", "btn-primary"),
  ],
  s4: [
    /* s4 판의 s3 탭은 제출됨(회색)이고 시안은 작성 중(주황) — 상태가 다르다 */
    ...COMMON(true).map((row) =>
      row[0] === "tab 3 badge"
        ? [row[0], row[1], row[2], [], [...W, "color", "background-color", "border-top-color", "border-bottom-color"]]
        : row),
    /* 시안은 「1주차 제출됨 · 2주차 작성 중」 둘, dev 일정은 1주차뿐(머리 주석) — 자식 수·폭을 안 본다 */
    ["weeks", S + D(3).trim(), I("weeks"), [], ["width", "count"]],
    ["wk now", S + ".wk.now", I("wkNow"), [], W],
    ...fld(4, { hint: false }), textarea(4),
    ...fld(5, { hint: false, small: true, narrow: ["height"] }), ...tags(5),
    ...fld(6, { hint: false, small: true }), input(6),
    ...fld(7, { hint: false, small: true }), ...ro(7, 2),
    ...guideMemo(8, 9),
    /* 시안은 칩만, 우리는 작성 중이라 드롭 칸도 있다(머리 주석) — 높이를 안 본다 */
    ...fld(10, { hint: false, small: true, skip: ["height"] }), ...file(10),
    ...pair("btn-ghost", "btn-primary"),
  ],
  s5: [
    /* 잠긴 버튼의 테두리 1px만큼 발자국이 높다(아래 `sp final`) */
    ...COMMON(true, ["height"]),
    ["info", S + ".info-strip", H("infoStrip")],
    /* 토글 두 개는 시안이 켜진 모양이고 우리는 아직 안 열린 판이라 꺼져 있다 — 손잡이(`i`)는 안 본다 */
    ...fld(4, { hint: false }), ...rowSw(4, { sw: false }),
    ...fld(5, { hint: false, small: true }), ...rowSw(5, { sw: false }),
    ["fld 5 hint", S + D(5) + "> .hint", ROOT + D(5) + `> ${HINT}`],
    ...fld(6, { hint: false, small: true }),
    ["snap", S + D(6) + ".snap", ROOT + D(6) + H("snap")],
    ["snap card", S + D(6) + ".snap .card", ROOT + D(6) + `${H("snap")} ${CARD}`],
    ["snap small", S + D(6) + ".snap small", ROOT + D(6) + `${H("snap")} small`, [], W],
    ["snap score", S + D(6) + ".snap .score", ROOT + D(6) + `${H("snap")} .score`, [], W],
    ...fld(7), textarea(7),
    ...fld(8, { hint: false, small: true }), ...chkl(8),
    ...fld(9, { hint: false, small: true }), textarea(9),
    /* 시안은 드롭 칸, 우리는 아직 안 열린 판이라 라벨뿐(머리 주석) — 높이를 안 본다 */
    ...fld(10, { hint: false, small: true, skip: ["height"] }),
    ["consents", S + ".consents", I("consents")],
    ["consents label", S + ".consents label", `${I("consents")} label`],
    ["consents input", S + ".consents input", `${I("consents")} input`, [], CHECKBOX],
    ["consents req", S + ".consents .req", I("req"), [], W],
    ["consents span", S + ".consents label > span", `${I("consents")} label > span`],
    ["sp", S + ".frm-ft .sp", I("sp"), [], ["margin-left", "width", "height"]],
    /* 안 열린 판이라 우리 버튼은 잠겨 있다 — 색·그림자·테두리(그래서 크기)를 안 본다 */
    ["sp final", S + ".frm-ft .sp .btn-primary", `${I("sp")} button[value="submit"]`, [],
      [...W, "height", "color", "background-color", "background-image", "box-shadow",
        "border-top-width", "border-top-style", "border-top-color",
        "border-bottom-width", "border-bottom-style", "border-bottom-color"]],
  ],
};

/* 상태 축 — hover에만 있는 규칙 */
const HOVER_CSS = ["color", "background-color", "background-image", "box-shadow",
  "border-top-color", "filter"];
const HOVER = {
  s1: [], s2: [], s5: [],
  s3: [
    ["ghost hover", S + ".frm-ft .sp .btn-ghost", `${I("sp")} button[value="draft"]`],
    ["primary hover", S + ".frm-ft .sp .btn-primary", `${I("sp")} button[value="submit"]`],
  ],
  s4: [
    ["ghost hover", S + ".frm-ft .sp .btn-ghost", `${I("sp")} button[value="draft"]`],
    ["primary hover", S + ".frm-ft .sp .btn-primary", `${I("sp")} button[value="submit"]`],
  ],
};

/* 글자 — 머리·탭·판 전체. 데이터와 일부러 다른 자리는 IGNORE */
const TEXT = [
  ["머리", HEAD + ".hb-h1", H("h1")],
  ["부제", HEAD + ".hb-sub", H("sub")],
  ["탭", HEAD + ".st-tabs", I("tabs")],
  ["판", S.trim(), ROOT.trim()],
];
const IGNORE_ALL = [
  /* 데이터 — 마감·제출자·시각·주차·수치·글자 수 */
  /^(마감|이번 주 마감|집계 확정|판정|제출|임시저장|submitted_by) /, /^\d+ \/ \d+$/,
  /^[\d,]+$/, /^[\d.]+%$/, /^₩[\d,]+$/, /^\d\d\.\d\d~/, /^(방문|가입) /, /^\d주차 /,
  /^—$/, /^결제 연동 상태:/, /^(연동 확인됨 ✓|확인 대기|등록 전|문의형)$/,
];
const IGNORE = {
  /* s1은 마감이 지나 버튼이 「마감됨」 하나고 드롭 칸이 없다(머리 주석) */
  s1: [/^(임시저장|재제출하기|마감됨)$/, /^파일을 끌어다 놓거나/],
  s2: [],
  s3: [],
  /* dev 일정은 s4가 한 주라 「1주차 제출됨」 칩이 없고, s3 탭은 제출됨이다. 드롭 칸은 우리에게만 */
  s4: [/^1주차 제출됨$/, /^작성 중$/, /^파일을 끌어다 놓거나/],
  /* s5는 아직 안 열려 드롭 칸이 없다 */
  s5: [/^파일을 끌어다 놓거나/, /^이용자 개별 식별 항목/],
};

const probe = () => `(() => {
  const CSS = ${JSON.stringify(CSS)};
  const COUNT = new Set(${JSON.stringify([...COUNT])});
  const out = {}, missing = [];
  for (const [name, sel, extra, skip0] of LIST) {
    const skip = skip0 || [];
    const el = document.querySelector(sel);
    if (!el) { missing.push(name + "  ← " + sel); continue; }
    const cs = getComputedStyle(el);
    for (const p of CSS.concat(extra || [])) {
      if (skip.includes(p)) continue;
      if (p.startsWith("border-") && !p.endsWith("width")) {
        const side = p.split("-")[1];
        if (cs.getPropertyValue("border-" + side + "-width") === "0px") continue;
      }
      let v = cs.getPropertyValue(p);
      if (p.startsWith("background")) v = v.replace(/ 0%/g, " 0px");
      out[name + " " + p] = v;
    }
    if (!skip.includes("overflow")) {
      out[name + " ▸가로 넘침"] = String(el.scrollWidth > el.clientWidth + 1);
    }
    if (COUNT.has(name) && !skip.includes("count")) {
      out[name + " ▸자식 수"] = String(
        [...el.children]
          .filter((c) => !(c.tagName === "BR" || (c.tagName === "INPUT" && c.type === "hidden")))
          .filter((c) => getComputedStyle(c).display !== "none").length,
      );
    }
  }
  return { out, missing };
})()`;

const hoverProbe = (name, sel) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return { [${JSON.stringify(name)} + " ▸없음"]: "true" };
  const cs = getComputedStyle(el), out = {};
  for (const p of ${JSON.stringify(HOVER_CSS)}) {
    let v = cs.getPropertyValue(p);
    if (p.startsWith("background")) v = v.replace(/ 0%/g, " 0px");
    out[${JSON.stringify(name)} + " " + p] = v;
  }
  return out;
})()`;

const hashOf = `(() => {
  const pick = (mod) => {
    const e = document.querySelector('[class*="' + mod + '-module__"]');
    return e ? (e.className.match(new RegExp(mod + '-module__([A-Za-z0-9_-]+?)__')) || [])[1] : null;
  };
  return { hub: pick("hub"), m: pick("submit") };
})()`;

const fixer = ({ hub, m }) => (sel) =>
  sel
    .replace(/\{\{hub:(\w+)\}\}/g, (_, n) => `.hub-module__${hub}__${n}`)
    .replace(/\{\{(\w+)\}\}/g, (_, n) => `.submit-module__${m}__${n}`);

/* 다섯째 칸(narrow)은 390px에서만 더 빼는 속성 */
const run = (list, side, w, fix = (v) => v) =>
  probe().replace("LIST", JSON.stringify(list.map(([n, s, i, x, k, narrow]) => {
    const skip = [...(k || []), ...(w <= 390 ? narrow || [] : [])];
    return side === "spec" ? [n, s, x, skip] : [n, fix(i), x, skip];
  })));

/** 시안의 판 고르개 — 탭을 누른다. `stripViewerShell()`이 상태 바를 가리기 전에 */
const pickState = (st) => `(() => {
  document.querySelector('#scr-submit .st-tab[data-k="${st}"]').click();
  return document.querySelector("#scr-submit .pane.on")?.dataset.id ?? "없음";
})()`;

const stateOf = `(document.querySelector('[data-probe="submit"]')?.dataset.state ?? "없음")`;

const hideScrollbars = (p) =>
  p.send("Emulation.setScrollbarsHidden", { hidden: true });

const state = (...args) =>
  execFileSync("node", [
    "--env-file=.env.development.local", "--import", "tsx",
    "scripts/design-diff/submit-state.mts", ...args,
  ], { cwd: REPO, encoding: "utf8" });

/* s1·s2·s3·s5는 「s3」 상태에서, s4는 「s4」 상태에서 본다 */
const DB_STATE = { s1: "s3", s2: "s3", s3: "s3", s4: "s4", s5: "s3" };

const STATES = process.env.STATE ? [process.env.STATE] : ["s1", "s2", "s3", "s5", "s4"];
for (const st of STATES) {
  if (!LIST[st]) throw new Error(`STATE는 s1~s5 중 하나: ${st}`);
}

console.log(state("save").trim());

let total = 0;
let made = null;
let token = null;
try {
  for (const st of STATES) {
    if (made !== DB_STATE[st]) {
      made = DB_STATE[st];
      token = state(made).trim().split("\n").pop();
    }
    const list = LIST[st];
    const hovers = HOVER[st];
    const ignore = [...IGNORE_ALL, ...IGNORE[st]];

    for (const w of WIDTHS) {
      const spec = await withPage(async (p) => {
        await hideScrollbars(p);
        await p.send("Emulation.setEmulatedMedia", {
          features: [{ name: "prefers-reduced-motion", value: "reduce" }],
        });
        await p.goto(SPEC_URL + "#submit");
        const picked = await p.eval(pickState(st));
        if (picked !== st) throw new Error(`시안 판 전환 실패: ${picked}`);
        await p.stripViewerShell();
        await p.eval(`(() => {
          document.getElementById("scr-submit").getAnimations({ subtree: true })
            .forEach(a => { if (a.effect?.getTiming().iterations !== Infinity) a.finish(); });
          return 1;
        })()`);
        await p.resize(w, 520);
        const r = await p.eval(run(list, "spec", w));
        r.text = {};
        for (const [n, sel] of TEXT) r.text[n] = await p.eval(textNodes(sel));
        r.hover = {};
        for (const [n, sel] of hovers) {
          await p.hover(sel);
          Object.assign(r.hover, await p.eval(hoverProbe(n, sel)));
        }
        await p.hover();
        await p.resize(w, 900);
        await p.shot(`${OUT}/spec-${st}-${w}.png`);
        return r;
      });

      const impl = await withPage(async (p) => {
        await hideScrollbars(p);
        await p.send("Network.clearBrowserCookies");
        await p.send("Network.setCookie", {
          name: "authjs.session-token", value: token,
          domain: new URL(IMPL_URL).hostname, path: "/",
        });
        await p.goto(IMPL_URL + `/dashboard/submit/${st}`);
        const fix = fixer(await p.eval(hashOf));
        const drawn = await p.eval(stateOf);
        if (drawn !== st) {
          throw new Error(`구현본이 ${drawn}을 그린다 — ${st}여야 한다`);
        }
        await p.resize(w, 520);
        const r = await p.eval(run(list, "impl", w, fix));
        r.text = {};
        for (const [n, , sel] of TEXT) r.text[n] = await p.eval(textNodes(fix(sel)));
        r.hover = {};
        for (const [n, , sel] of hovers) {
          await p.hover(fix(sel));
          Object.assign(r.hover, await p.eval(hoverProbe(n, fix(sel))));
        }
        await p.hover();
        await p.resize(w, 900);
        await p.shot(`${OUT}/impl-${st}-${w}.png`);
        return r;
      });

      console.log(`\n\n████ ${st} · 폭 ${w}`);
      for (const m of spec.missing) console.log(`  ⚠️ 시안에서 못 찾음: ${m}`);
      for (const m of impl.missing) console.log(`  ⚠️ 구현본에서 못 찾음: ${m}`);
      total += spec.missing.length + impl.missing.length;
      total += diffTable(`${st} ${w}px — 스테이지 제출`, spec.out, impl.out);
      total += diffTable(`${st} ${w}px — hover`, spec.hover, impl.hover);
      for (const [n] of TEXT) {
        total += diffText(spec.text[n], impl.text[n], { label: n, ignore });
      }
    }
  }
} finally {
  console.log(state("restore").trim());
}

console.log(`\n═══════════════════════════\n합계 불일치 ${total}건`);
console.log(`스크린샷: ${OUT}`);
