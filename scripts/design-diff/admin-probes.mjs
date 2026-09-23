/*
  `admin.mjs`의 화면별 탐침 — 화면 하나가 한 칸이다.

    hash   시안 뷰어의 화면 id(`#scr-<hash>`)
    route  구현본 경로
    mod    그 화면의 CSS 모듈 이름(`{{p:이름}}` 자리표가 이것으로 바뀐다)
    states 판이 있는 화면만 — { 판: { pane: 시안 data-pane, query: 구현본 쿼리 } }
    list   (S, 판) → [이름, 시안 셀렉터, 구현 셀렉터, 더 잴 속성, 뺄 속성, 390에서만 뺄 속성, {kids}]
    text   (S, 판) → [이름, 시안, 구현, 무시할 정규식[]]
    hover  (S, 판) → [이름, 시안, 구현]

  구현 셀렉터의 자리표 — `{{c:x}}` console.module.css, `{{hub:x}}` hub.module.css,
  `{{p:x}}` 그 화면 모듈. 공용 컴포넌트는 `data-probe` 아래로 좁혀 부분 일치로 집는다.
*/

const BADGE = '[class*="Badge-module__"][class*="__badge"]';
const CARD = '[class*="Surface-module__"][class*="__card"]';
const BTN = '[class*="Button-module__"][class*="__btn"]';

/* 제목·부제 — 모든 화면이 hub의 `.h1`·`.sub`를 쓴다 */
const head = (S) => [
  ["h1", S + ".hb-h1", '[data-probe="ad-body"] {{hub:h1}}', [], ["width"]],
  ["sub", S + ".hb-sub", '[data-probe="ad-body"] {{hub:sub}}', [], ["width"]],
];

export const SCREENS = {
  /* ── 운영 대시보드 ── */
  dash: {
    hash: "admin",
    route: "/admin",
    list: (S) => [
      ...head(S),
      /* 390에서 카드 높이는 숫자 폭에 달렸다 — 추세가 숫자 옆에 서느냐 다음 줄로 가느냐 */
      ["kpi", S + ".kpi", "{{c:kpi}}", [], [], ["height"], { kids: true }],
      ["kpi 카드1", S + ".kpi .card:nth-child(1)", `{{c:kpi}} > ${CARD}:nth-child(1)`, [], ["width", "height"]],
      ["kpi 카드2", S + ".kpi .card:nth-child(2)", `{{c:kpi}} > ${CARD}:nth-child(2)`, [], ["width", "height"]],
      ["kpi 카드3", S + ".kpi .card:nth-child(3)", `{{c:kpi}} > ${CARD}:nth-child(3)`, [], ["width", "height"]],
      ["kpi 카드4", S + ".kpi .card:nth-child(4)", `{{c:kpi}} > ${CARD}:nth-child(4)`, [], ["width", "height"]],
      ["kpi small", S + ".kpi .card:nth-child(1) small", `{{c:kpi}} > ${CARD}:nth-child(1) small`, [], ["width"]],
      ["kpi score", S + ".kpi .card:nth-child(1) .score", `{{c:kpi}} > ${CARD}:nth-child(1) .score`, [], ["width"]],
      ["kpi trend up", S + ".kpi .card:nth-child(1) .trend", `{{c:kpi}} > ${CARD}:nth-child(1) {{c:trend}}`, [], ["width"]],
      ["kpi trend", S + ".kpi .card:nth-child(2) .trend", `{{c:kpi}} > ${CARD}:nth-child(2) {{c:trend}}`, [], ["width"]],
      ["pair", S + ".ad-body > div[style*=grid]", '[data-probe="ad-body"] > div[style*="grid"]', [], ["height"]],
      ["gate", S + ".ad-body > div[style*=grid] > .card:nth-child(1)", '[data-probe="adm-gate"]', [], ["width", "height"]],
      ["gate b", S + ".ad-body > div[style*=grid] > .card:nth-child(1) > b", '[data-probe="adm-gate"] > b', [], ["width"]],
      ["gate p", S + ".ad-body > div[style*=grid] > .card:nth-child(1) > p", '[data-probe="adm-gate"] > p', [], ["width", "height"]],
      ["gate D", S + ".ad-body > div[style*=grid] > .card:nth-child(1) > p .mono", '[data-probe="adm-gate"] > p .mono', [], ["width"]],
      ["gate 버튼", S + ".ad-body > div[style*=grid] > .card:nth-child(1) .btn", `[data-probe="adm-gate"] ${BTN}`, [], []],
      ["flags", S + ".ad-body > div[style*=grid] > .card:nth-child(2)", '[data-probe="adm-flags"]', [], ["width", "height"]],
      ["flags p", S + ".ad-body > div[style*=grid] > .card:nth-child(2) > p", '[data-probe="adm-flags"] > p', [], ["width", "height"]],
      ["flags b", S + ".ad-body > div[style*=grid] > .card:nth-child(2) > p b", '[data-probe="adm-flags"] > p b', [], ["width"]],
      ["flags 배지", S + ".ad-body > div[style*=grid] > .card:nth-child(2) .badge", `[data-probe="adm-flags"] ${BADGE}`, [], ["width"]],
      ["log", S + ".ad-body > .card", '[data-probe="adm-log"]', [], ["height"]],
      ["log 머리", S + ".ad-body > .card > div:first-child", '[data-probe="adm-log"] > div:first-child'],
      ["log 전체", S + ".ad-body > .card > div:first-child a", '[data-probe="adm-log"] > div:first-child a', [], ["width", "margin-left"]],
      ["minlog", S + ".minlog", "{{c:minlog}}", [], ["height"]],
      ["minlog 줄", S + ".minlog > div:first-child", "{{c:minlog}} > div:first-child", [], ["height"]],
      ["minlog 끝줄", S + ".minlog > div:last-child", "{{c:minlog}} > div:last-child", [], ["height"]],
      ["minlog t", S + ".minlog .t", "{{c:minlog}} {{c:t}}", [], ["width"]],
    ],
    text: (S) => [
      ["제목", S + ".hb-h1", '[data-probe="ad-body"] {{hub:h1}}'],
      /* 부제의 「6분 전」은 롤업 시각이다 */
      ["부제", S + ".hb-sub", '[data-probe="ad-body"] {{hub:sub}}', [/^시즌 1, 자동 집계 정상, 마지막 롤업 \d+분 전$/]],
      ["KPI 라벨", S + ".kpi", "{{c:kpi}}", [/^[\d,]+$/, /이번 주$/]],
      ["게이트", S + ".ad-body > div[style*=grid] > .card:nth-child(1)", '[data-probe="adm-gate"]', [/^D-\d+$/, /^\d+$/, /대상 \d+팀/, /^s\d$/]],
      ["플래그", S + ".ad-body > div[style*=grid] > .card:nth-child(2)", '[data-probe="adm-flags"]', [/^\d+$/]],
      ["감사 로그", S + ".ad-body > .card", '[data-probe="adm-log"]'],
    ],
    hover: (S) => [
      ["gate 버튼", S + ".ad-body > div[style*=grid] > .card:nth-child(1) .btn", `[data-probe="adm-gate"] ${BTN}`],
    ],
  },
};
