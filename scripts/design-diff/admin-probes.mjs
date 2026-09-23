/*
  `admin.mjs`의 화면별 탐침 — 화면 하나가 한 칸이다.

    hash   시안 뷰어의 화면 id(`#scr-<hash>`)
    route  구현본 경로
    mod    그 화면의 CSS 모듈 이름(`{{p:이름}}` 자리표가 이것으로 바뀐다)
    states 판이 있는 화면만 — { 판: { pane: 시안 data-pane, query: 구현본 쿼리 } }
    list   (S, 판) → [이름, 시안 셀렉터, 구현 셀렉터, 더 잴 속성, 뺄 속성, 390에서만 뺄 속성, {kids}]
    text   (S, 판) → [이름, 시안, 구현, 무시할 정규식[]]
    hover  (S, 판) → [이름, 시안, 구현, 시안 hover 대상?, 구현 hover 대상?]

  구현 셀렉터의 자리표 — `{{c:x}}` console.module.css, `{{hub:x}}` hub.module.css,
  `{{p:x}}` 그 화면 모듈. 공용 컴포넌트는 `data-probe` 아래로 좁혀 부분 일치로 집는다.
*/

const BADGE = '[class*="Badge-module__"][class*="__badge"]';
const CARD = '[class*="Surface-module__"][class*="__card"]';
const BTN = '[class*="Button-module__"][class*="__btn"]';
const FLD = '[class*="Field-module__"][class*="__fld"]';

/*
  필터 줄 — 첫 셀렉트·검색 칸·줄 자체. 셀렉트 폭은 선택지 글자 폭이라 뺀다.
*/
const fbar = (S, { selects = 1, search = false } = {}) => [
  ["fbar", S + ".fbar", '[data-probe="fbar"]', [], ["height"], [], { kids: true }],
  ["fbar select", S + ".fbar select", '[data-probe="fbar"] select', [], ["width"]],
  ...(selects > 1
    ? [["fbar select 끝", S + `.fbar select:nth-of-type(${selects})`, `[data-probe="fbar"] select:nth-of-type(${selects})`, [], ["width"]]]
    : []),
  ...(search ? [["fbar 검색", S + ".fbar input", '[data-probe="fbar"] input', [], ["width"]]] : []),
];

/*
  표 — 표 자체·머리 칸·첫 행 첫 칸·끝 행. 칸 폭은 글자(데이터)에 달려 뺀다.
  `cols`는 머리글 수(구조 축).
*/
const table = (S, impl, { cols } = {}) => [
  /* 좁은 폭에서 표는 본문 밖으로 넘친다 — 얼마나 넘치는지는 칸 글자(데이터)가 정한다 */
  ["atbl", S + ".atbl", impl, [], ["height"], ["width"]],
  ["th", S + ".atbl th", `${impl} th`, [], ["width", "height"]],
  ["thead tr", S + ".atbl thead tr", `${impl} thead tr`, [], ["width", "height"], [], { kids: !!cols }],
  ["td 첫칸", S + ".atbl tbody tr:first-child td", `${impl} tbody tr:first-child td`, [], ["width", "height"]],
  ["td 끝행", S + ".atbl tbody tr:last-child td", `${impl} tbody tr:last-child td`, [], ["width", "height"]],
];

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

  /* ── 시즌 관리 ── */
  seasons: {
    hash: "adm-seasons",
    route: "/admin/seasons",
    mod: "seasons",
    list: (S) => {
      const F = (k) => S + `.ad-body > .fld:nth-of-type(${k})`;
      const G = (k) => `[data-probe="ad-body"] > ${FLD}:nth-of-type(${k})`;
      return [
        ...head(S),
        ["fld 시즌", F(1), G(1), [], ["width"]],
        ["fld label", F(1) + " > label", G(1) + " > label", [], ["width"]],
        ["시즌 keybox", F(1) + " .keybox", '[data-probe="season-box"]', [], ["width"]],
        ["시즌 배지", F(1) + " .keybox .badge", `[data-probe="season-box"] ${BADGE}`, [], ["width"]],
        /* 기간 글자는 데이터라 폭을 뺀다 */
        ["시즌 기간", F(1) + " .keybox .cp", '[data-probe="season-box"] {{p:cp}}', [], ["width", "margin-left"]],
        ["일정 label small", F(2) + " > label small", G(2) + " > label small", [], ["width"]],
        /*
          ⚠️ 줄 높이는 뺀다 — 날짜 칸이 모노라 시안(캐스케이드로 모노가 안 먹는다)보다
          2px 높다(플레이북 함정 「input.inp.mono」). 카드 높이도 그만큼 다르다.
        */
        ["일정 card", F(2) + " > .card", '[data-probe="stages"]', [], ["width", "height"]],
        ["stgrow s1", F(2) + " .stgrow:nth-child(1)", '[data-probe="stages"] > {{p:stgrow}}:nth-child(1)', [], ["width", "height"]],
        ["stgrow .k", F(2) + " .stgrow:nth-child(1) .k", '[data-probe="stages"] > {{p:stgrow}}:nth-child(1) {{p:k}}', [], ["width"]],
        ["stgrow 이름", F(2) + " .stgrow:nth-child(1) > span:nth-child(2)", '[data-probe="stages"] > {{p:stgrow}}:nth-child(1) > span:nth-child(2)', [], ["width"]],
        /* `.inp.mono` — 시안은 캐스케이드로 모노가 안 먹는다(플레이북 함정). 글꼴·높이는 뺀다 */
        ["stgrow 입력", F(2) + " .stgrow:nth-child(1) input", '[data-probe="stages"] > {{p:stgrow}}:nth-child(1) input', [], ["font-family", "height"]],
        ["gate-chip", F(2) + " .stgrow:nth-child(2) .gate-chip", '[data-probe="stages"] > {{p:stgrow}}:nth-child(2) {{p:gateChip}}', [], ["width"]],
        ["주간 chip", F(2) + " .stgrow:nth-child(4) .chip", '[data-probe="stages"] > {{p:stgrow}}:nth-child(4) [class*="Surface-module__"][class*="__chip"]', [], ["width"]],
        ["stgrow s5", F(2) + " .stgrow:nth-child(5)", '[data-probe="stages"] > {{p:stgrow}}:nth-child(5)', [], ["width", "height"]],
        /* 트랙 수는 데이터다(시안 둘째 「테마 트랙 비활성」은 목업) — 줄 폭은 뺀다 */
        ["트랙 줄", F(3) + " > div", '[data-probe="tracks"]', [], ["width", "height"]],
        ["트랙 keybox", F(3) + " > div > .keybox:first-child", '[data-probe="tracks"] > span:first-child', [], ["width"]],
        ["트랙 배지", F(3) + " > div > .keybox:first-child .badge", `[data-probe="tracks"] > span:first-child ${BADGE}`, [], ["width"]],
        /* 390에서 버튼이 트랙 옆에 서느냐 다음 줄로 가느냐는 트랙 수(데이터)에 달렸다 */
        ["트랙 추가", F(3) + " > div > .btn", `[data-probe="tracks"] > ${BTN}`, [], [], ["height", "width"]],
        ["pre", F(4) + " .pre", G(4) + " {{c:pre}}", [], ["width"]],
        ["row-sw 1", F(5) + " .row-sw:nth-of-type(1)", G(5) + ` > div > [class*="Field-module__"][class*="__rowSw"]:nth-child(1)`, [], ["width"]],
        ["row-sw b", F(5) + " .row-sw:nth-of-type(1) b", G(5) + ` > div > [class*="Field-module__"][class*="__rowSw"]:nth-child(1) b`, [], ["width"]],
        ["row-sw 2 small", F(5) + " .row-sw:nth-of-type(2) small", G(5) + ` > div > [class*="Field-module__"][class*="__rowSw"]:nth-child(2) small`, [], ["width"]],
        ["row-sw 3", F(5) + " .row-sw:nth-of-type(3)", G(5) + ` > div > [class*="Field-module__"][class*="__rowSw"]:nth-child(3)`, [], ["width", "height"]],
        ["sw 켬", F(5) + " .row-sw:nth-of-type(1) .sw i", G(5) + ` > div > [class*="Field-module__"][class*="__rowSw"]:nth-child(1) i`],
        ["sw 끔", F(5) + " .row-sw:nth-of-type(2) .sw i", G(5) + ` > div > [class*="Field-module__"][class*="__rowSw"]:nth-child(2) i`],
      ];
    },
    text: (S) => [
      ["제목", S + ".hb-h1", '[data-probe="ad-body"] {{hub:h1}}'],
      ["부제", S + ".hb-sub", '[data-probe="ad-body"] {{hub:sub}}'],
      /* 기간·페이즈는 데이터 */
      ["시즌", S + ".ad-body > .fld:nth-of-type(1)", `[data-probe="ad-body"] > ${FLD}:nth-of-type(1)`, [/^\d{4}-\d\d-\d\d → \d\d-\d\d$/]],
      ["일정", S + ".ad-body > .fld:nth-of-type(2)", '[data-probe="ad-body"] > div:nth-of-type(2)'],
      /* 시안 둘째 트랙은 목업이다 */
      ["트랙", S + ".ad-body > .fld:nth-of-type(3)", '[data-probe="ad-body"] > div:nth-of-type(3)', [/^테마 트랙$/, /^비활성$/]],
      /* JSON 본문은 시즌 값이다 — 게다가 jsonb는 키 순서를 제 식으로 바꿔 저장한다 */
      ["config", S + ".ad-body > .fld:nth-of-type(4)", '[data-probe="ad-body"] > div:nth-of-type(4)', [/^\{/]],
      ["flags", S + ".ad-body > .fld:nth-of-type(5)", '[data-probe="ad-body"] > div:nth-of-type(5)'],
    ],
    hover: (S) => [
      ["트랙 추가 hover", S + ".ad-body > .fld:nth-of-type(3) .btn", `[data-probe="tracks"] > ${BTN}`],
    ],
  },

  /* ── 참가 관리 ── */
  entries: {
    hash: "adm-entries",
    route: "/admin/entries",
    list: (S) => [
      ...head(S),
      ...fbar(S, { selects: 3, search: true }),
      ...table(S, '[data-probe="entries"]', { cols: 7 }),
      ["td 팀 b", S + ".atbl tbody tr:first-child td:first-child b", '[data-probe="entries"] tbody tr:first-child td:first-child b', [], ["width"]],
      ["td stage", S + ".atbl tbody tr:first-child td:nth-child(3)", '[data-probe="entries"] tbody tr:first-child td:nth-child(3)', [], ["width", "height"]],
      ["td 상태 배지", S + ".atbl tbody tr:first-child td:nth-child(4) .badge", `[data-probe="entries"] tbody tr:first-child td:nth-child(4) ${BADGE}`, [], ["width"]],
      ["td 온보딩", S + ".atbl tbody tr:first-child td:nth-child(5)", '[data-probe="entries"] tbody tr:first-child td:nth-child(5)', [], ["width", "height", "color"]],
      /* 칸 폭이 모자라면 버튼 글자가 두 줄이 된다 — 다른 칸 글자(데이터)가 정한다 */
      ["td 버튼", S + ".atbl tbody tr:first-child .btn", `[data-probe="entries"] tbody tr:first-child ${BTN}`, [], ["width", "height"]],
    ],
    text: (S) => [
      ["제목", S + ".hb-h1", '[data-probe="ad-body"] {{hub:h1}}'],
      ["부제", S + ".hb-sub", '[data-probe="ad-body"] {{hub:sub}}'],
      /* 상태 값은 스키마를 따른다(page.tsx 주석) — 시안 `completed`는 우리 상태에 없다 */
      ["필터", S + ".fbar", '[data-probe="fbar"]', [/^completed$/, /^withdrawn$/]],
      ["머리글", S + ".atbl thead", '[data-probe="entries"] thead'],
      ["버튼", S + ".atbl tbody tr:first-child td:last-child", '[data-probe="entries"] tbody tr:first-child td:last-child'],
    ],
    hover: (S) => [
      ["행 hover td", S + ".atbl tbody tr:first-child td:first-child", '[data-probe="entries"] tbody tr:first-child td:first-child',
        S + ".atbl tbody tr:first-child", '[data-probe="entries"] tbody tr:first-child'],
      ["버튼 hover", S + ".atbl tbody tr:first-child .btn", `[data-probe="entries"] tbody tr:first-child ${BTN}`],
    ],
  },

  /* ── 심사 ── */
  judging: {
    hash: "adm-judging",
    route: "/admin/judging",
    mod: "judging",
    list: (S) => {
      const T = '[data-probe="judging"]';
      const R = (k) => `${T} tbody tr:nth-child(${k})`;
      return [
        ...head(S),
        ...fbar(S),
        ["fbar chip", S + ".fbar .chip", '[data-probe="fbar"] [class*="Surface-module__"][class*="__chip"]', [], ["width", "margin-left"]],
        ["fbar chip b", S + ".fbar .chip b", '[data-probe="fbar"] [class*="Surface-module__"][class*="__chip"] b', [], ["width"]],
        ["fbar 버튼", S + ".fbar .btn", `[data-probe="fbar"] ${BTN}`, [], ["width"]],
        ...table(S, T, { cols: 5 }),
        ["td b", S + ".atbl tbody tr:nth-child(1) b", R(1) + " b", [], ["width"]],
        ["td 제출", S + ".atbl tbody tr:nth-child(1) td:nth-child(2)", R(1) + " td:nth-child(2)", [], ["width", "height"]],
        /* 줄 순서는 제출 시각(데이터)이라 판정 값으로 집는다 */
        ["판정 pass", S + ".atbl select.pass", `${T} select{{p:pass}}`, [], ["width"]],
        ["판정 fail", S + ".atbl select.fail", `${T} select{{p:fail}}`, [], ["width"]],
        /* 사유 글자가 칸보다 긴지는 데이터다 */
        ["사유", S + ".atbl tbody tr:nth-child(1) input", R(1) + " input", [], ["width", "overflow"]],
        ["미제출 행", S + ".atbl tr.strike td:first-child", `${T} tr{{c:strike}} td:first-child`, [], ["width", "height"]],
        ["미제출 시각", S + ".atbl tr.strike td:nth-child(2)", `${T} tr{{c:strike}} td:nth-child(2)`, [], ["width", "height"]],
        ["미제출 배지", S + ".atbl tr.strike .badge", `${T} tr{{c:strike}} ${BADGE}`, [], ["width"]],
        ["미제출 사유", S + ".atbl tr.strike td:last-child", `${T} tr{{c:strike}} td:last-child`, [], ["width", "height"]],
        ["안내", S + ".ad-body > p:last-child", '[data-probe="ad-body"] > p:last-child', [], ["width", "height"]],
      ];
    },
    text: (S) => [
      ["제목", S + ".hb-h1", '[data-probe="ad-body"] {{hub:h1}}'],
      ["부제", S + ".hb-sub", '[data-probe="ad-body"] {{hub:sub}}'],
      /* 게이트 마감·SLA·잔여 수는 일정·데이터다 */
      ["필터", S + ".fbar", '[data-probe="fbar"]', [/^GATE \d, s\d \d차 심사\((사업성|최종)\), 마감 \d\d\.\d\d \d\d:\d\d$/, /^\d\d\.\d\d \d\d:\d\d$/, /^, 잔여 \d+팀$/, /^\d+$/]],
      ["머리글", S + ".atbl thead", '[data-probe="judging"] thead'],
      ["미제출 행", S + ".atbl tr.strike", '[data-probe="judging"] tr{{c:strike}}', [/^.+$/].slice(0, 0).concat([/^모카브루$/])],
      ["안내", S + ".ad-body > p:last-child", '[data-probe="ad-body"] > p:last-child'],
    ],
    hover: (S) => [
      ["버튼 hover", S + ".fbar .btn", `[data-probe="fbar"] ${BTN}`],
    ],
  },

  /* ── 지표 검토 ① 큐 ② 빈 상태 ── */
  metrics: {
    hash: "adm-metrics",
    route: "/admin/metrics",
    states: { q: { pane: "am-q" }, empty: { pane: "am-empty" } },
    guard: `document.querySelector('[data-probe="ad-body"] [data-state]')?.dataset.state ?? "없음"`,
    list: (S, st) => {
      const P = S + `.pane.on `;
      if (st === "empty") {
        return [
          ...head(S),
          ["lb-empty", P + ".lb-empty", '[data-probe="metrics-empty"]', [], ["height"]],
          ["big", P + ".lb-empty .big", '[data-probe="metrics-empty"] {{c:big}}', [], ["width"]],
          ["p", P + ".lb-empty p", '[data-probe="metrics-empty"] p', [], ["width"]],
        ];
      }
      const T = '[data-probe="metrics"]';
      return [
        ...head(S),
        ...table(S.replace(/ $/, "") + " .pane.on ", T, { cols: 4 }),
        ["td b", P + ".atbl tbody tr:first-child b", `${T} tbody tr:first-child b`, [], ["width"]],
        ["td 수치", P + ".atbl tbody tr:first-child td:nth-child(3)", `${T} tbody tr:first-child td:nth-child(3)`, [], ["width", "height"]],
        ["td 수치 b", P + ".atbl tbody tr:first-child td:nth-child(3) b", `${T} tbody tr:first-child td:nth-child(3) b`, [], ["width"]],
        ["td 버튼칸", P + ".atbl tbody tr:first-child td:last-child", `${T} tbody tr:first-child td:last-child`, [], ["width", "height"]],
        ["확정", P + ".atbl tbody tr:first-child .btn:nth-child(1)", `${T} tbody tr:first-child ${BTN}:nth-child(1)`],
        ["이관", P + ".atbl tbody tr:first-child .btn:nth-child(3)", `${T} tbody tr:first-child ${BTN}:nth-child(3)`],
      ];
    },
    text: (S, st) => [
      ["제목", S + ".hb-h1", '[data-probe="ad-body"] {{hub:h1}}'],
      ["부제", S + ".hb-sub", '[data-probe="ad-body"] {{hub:sub}}'],
      ...(st === "empty"
        ? [["빈 상태", S + ".pane.on .lb-empty", '[data-probe="metrics-empty"]', [/^자동 집계 정상 작동 중, 다음 롤업 \d+분 후\.$/]]]
        : [
            ["머리글", S + ".pane.on .atbl thead", '[data-probe="metrics"] thead'],
            ["버튼", S + ".pane.on .atbl tbody tr:first-child td:last-child", '[data-probe="metrics"] tbody tr:first-child td:last-child'],
          ]),
    ],
    hover: (S, st) =>
      st === "empty"
        ? []
        : [["확정 hover", S + ".pane.on .atbl tbody tr:first-child .btn", `[data-probe="metrics"] tbody tr:first-child ${BTN}`]],
  },

  /* ── 사전신청 리드 ── */
  leads: {
    hash: "adm-leads",
    route: "/admin/leads",
    list: (S) => {
      const K = '[data-probe="leads-kpi"]';
      const T = '[data-probe="leads"]';
      return [
        ...head(S),
        ["sub 버튼", S + ".hb-sub .btn", `[data-probe="ad-body"] {{hub:sub}} ${BTN}`, [], ["width"]],
        ["kpi", S + ".kpi", K, [], ["height"], ["height"], { kids: true }],
        ["kpi 카드", S + ".kpi .card:nth-child(1)", `${K} > ${CARD}:nth-child(1)`, [], ["width", "height"]],
        ["kpi 카드3", S + ".kpi .card:nth-child(3)", `${K} > ${CARD}:nth-child(3)`, [], ["width", "height"]],
        ["kpi small", S + ".kpi .card:nth-child(1) small", `${K} > ${CARD}:nth-child(1) small`, [], ["width"]],
        ["kpi score", S + ".kpi .card:nth-child(1) .score", `${K} > ${CARD}:nth-child(1) .score`, [], ["width"]],
        ["kpi 오늘", S + ".kpi .card:nth-child(2) .score", `${K} > ${CARD}:nth-child(2) .score`, [], ["width"]],
        ...table(S, T, { cols: 4 }),
        ["td 이메일", S + ".atbl tbody tr:first-child td:nth-child(1)", `${T} tbody tr:first-child td:nth-child(1)`, [], ["width", "height"]],
        ["td 동의", S + ".atbl tbody tr:first-child td:nth-child(2)", `${T} tbody tr:first-child td:nth-child(2)`, [], ["width", "height"]],
      ];
    },
    text: (S) => [
      ["제목", S + ".hb-h1", '[data-probe="ad-body"] {{hub:h1}}'],
      ["부제", S + ".hb-sub", '[data-probe="ad-body"] {{hub:sub}}'],
      ["KPI 라벨", S + ".kpi", '[data-probe="leads-kpi"]', [/^[+]?[\d,]+%?$/, /^\+$/]],
      ["머리글", S + ".atbl thead", '[data-probe="leads"] thead'],
    ],
    hover: (S) => [
      ["CSV hover", S + ".hb-sub .btn", `[data-probe="ad-body"] {{hub:sub}} ${BTN}`],
    ],
  },

  /* ── 어뷰징 ── */
  abuse: {
    hash: "adm-abuse",
    route: "/admin/abuse",
    list: (S) => {
      const T = '[data-probe="abuse"]';
      const K = '[data-probe="abuse-card"]';
      return [
        ...head(S),
        ...table(S, T, { cols: 5 }),
        ["td 유형 b", S + ".atbl tbody tr:first-child b", `${T} tbody tr:first-child b`, [], ["width"]],
        ["td 심각도", S + ".atbl tbody tr:first-child .badge", `${T} tbody tr:first-child td:nth-child(3) ${BADGE}`, [], ["width"]],
        ["td 증거", S + ".atbl tbody tr:first-child td:nth-child(4)", `${T} tbody tr:first-child td:nth-child(4)`, [], ["width", "height"]],
        ["td 상태", S + ".atbl tbody tr:first-child td:nth-child(5) .badge", `${T} tbody tr:first-child td:nth-child(5) ${BADGE}`, [], ["width"]],
        ["카드", S + ".ad-body > .card", K, [], ["height"]],
        ["카드 b", S + ".ad-body > .card > b", `${K} > b`, [], ["width"]],
        ["카드 p", S + ".ad-body > .card > p", `${K} > p`, [], ["width", "height"]],
        ["버튼줄", S + ".ad-body > .card > div", `${K} > div`, [], ["width", "height"], [], { kids: true }],
        ["경고", S + ".ad-body > .card .btn:nth-child(1)", `${K} ${BTN}:nth-child(1)`, [], ["width"]],
        ["무효화", S + ".ad-body > .card .btn:nth-child(2)", `${K} ${BTN}:nth-child(2)`, [], ["width"]],
        ["실격", S + ".ad-body > .card .btn:nth-child(3)", `${K} ${BTN}:nth-child(3)`, [], ["width"]],
      ];
    },
    text: (S) => [
      ["제목", S + ".hb-h1", '[data-probe="ad-body"] {{hub:h1}}'],
      ["부제", S + ".hb-sub", '[data-probe="ad-body"] {{hub:sub}}'],
      ["머리글", S + ".atbl thead", '[data-probe="abuse"] thead'],
      ["카드", S + ".ad-body > .card", '[data-probe="abuse-card"]'],
    ],
    hover: (S) => [
      ["경고 hover", S + ".ad-body > .card .btn:nth-child(1)", `[data-probe="abuse-card"] ${BTN}:nth-child(1)`],
      ["실격 hover", S + ".ad-body > .card .btn:nth-child(3)", `[data-probe="abuse-card"] ${BTN}:nth-child(3)`],
    ],
  },

  /* ── 공지 발송 ── */
  noti: {
    hash: "adm-noti",
    route: "/admin/notifications",
    list: (S) => {
      const F = (k) => S + `.ad-body > .fld:nth-of-type(${k})`;
      const G = (k) => `[data-probe="ad-body"] > ${FLD}:nth-of-type(${k})`;
      const T = '[data-probe="notices"]';
      return [
        ...head(S),
        ["fld 제목", F(1), G(1), [], ["width"]],
        ["제목 input", F(1) + " input", G(1) + " input", [], ["width"]],
        ["본문 textarea", F(2) + " textarea", G(2) + " textarea", [], ["width"]],
        ...fbar(S, { selects: 2 }),
        ["fbar 체크 label", S + ".fbar label", '[data-probe="fbar"] label', [], ["width"]],
        ["fbar chip", S + ".fbar .chip", '[data-probe="fbar"] [class*="Surface-module__"][class*="__chip"]', [], ["width", "margin-left"]],
        ["fbar chip b", S + ".fbar .chip b", '[data-probe="fbar"] [class*="Surface-module__"][class*="__chip"] b', [], ["width"]],
        ["발송", S + ".ad-body > .btn", `[data-probe="ad-body"] > ${BTN}`, [], ["width"]],
        /* 셋째 div는 필터 줄이라 이력 칸은 넷째다 */
        ["fld 이력", F(4), G(4), [], ["width", "height"]],
        ...table(S, T, { cols: 4 }),
        ["td 일시", S + ".atbl tbody tr:first-child td:first-child", `${T} tbody tr:first-child td:first-child`, [], ["width", "height"]],
      ];
    },
    text: (S) => [
      ["제목", S + ".hb-h1", '[data-probe="ad-body"] {{hub:h1}}'],
      ["부제", S + ".hb-sub", '[data-probe="ad-body"] {{hub:sub}}'],
      ["라벨", S + ".ad-body > .fld:nth-of-type(1) > label", `[data-probe="ad-body"] > ${FLD}:nth-of-type(1) > label`],
      /* 선택지 순서·셋째 이후는 우리 대상 규칙(notify.ts)이다. 예상 대상 수는 데이터 */
      ["필터", S + ".fbar", '[data-probe="fbar"]', [/^stage, s5$/, /^\d+팀, \d+명$/]],
      ["버튼", S + ".ad-body > .btn", `[data-probe="ad-body"] > ${BTN}`],
      ["이력 머리", S + ".ad-body > .fld:nth-of-type(4) > label", `[data-probe="ad-body"] > ${FLD}:nth-of-type(4) > label`],
      ["이력 머리글", S + ".atbl thead", '[data-probe="notices"] thead'],
    ],
    hover: (S) => [
      ["발송 hover", S + ".ad-body > .btn", `[data-probe="ad-body"] > ${BTN}`],
    ],
  },

  /* ── 감사 로그 ── */
  audit: {
    hash: "adm-audit",
    /*
      시안의 「최근 30일」은 시안 속 오늘(10.24 무렵) 기준이라 09.25가 든다. dev의
      「오늘」은 개발 시계(11.02)라 그 줄이 빠진다 — 시즌 전체로 연다.
    */
    route: "/admin/audit-logs?period=season",
    list: (S) => {
      const T = '[data-probe="audit"]';
      return [
        ...head(S),
        ...fbar(S, { selects: 3 }),
        ...table(S, T, { cols: 5 }),
        ["td 시각", S + ".atbl tbody tr:first-child td:nth-child(1)", `${T} tbody tr:first-child td:nth-child(1)`, [], ["width", "height"]],
        ["td 액션", S + ".atbl tbody tr:first-child td:nth-child(3)", `${T} tbody tr:first-child td:nth-child(3)`, [], ["width", "height"]],
        ["td 대상", S + ".atbl tbody tr:first-child td:nth-child(4)", `${T} tbody tr:first-child td:nth-child(4)`, [], ["width", "height"]],
        ["td 사유 b", S + ".atbl tbody tr:first-child b", `${T} tbody tr:first-child b`, [], ["width"]],
      ];
    },
    text: (S) => [
      ["제목", S + ".hb-h1", '[data-probe="ad-body"] {{hub:h1}}'],
      ["부제", S + ".hb-sub", '[data-probe="ad-body"] {{hub:sub}}'],
      /* 운영자 선택지는 계정(데이터), 액션 묶음은 시안 넷에 우리 화면 것을 더했다 */
      ["필터", S + ".fbar", '[data-probe="fbar"]', [/^system$/, /^(season|notification|lead|award|credit)\.\*$/, /^[a-z0-9._-]+$/]],
      ["머리글", S + ".atbl thead", '[data-probe="audit"] thead'],
      /* 몸통은 시안 목업 여섯 줄을 그대로 심었다(dev-admin-fixture) — 글자까지 본다 */
      ["몸통", S + ".atbl tbody", '[data-probe="audit"] tbody', [/^admin$/, /^hub-check$/]],
    ],
  },

  /* ── 시상 ── */
  awards: {
    hash: "adm-awards",
    route: "/admin/awards",
    list: (S) => {
      const T = '[data-probe="awards"]';
      const B = '[data-probe="awards-bar"]';
      return [
        ["h1", S + ".hb-h1", '[data-probe="ad-body"] {{hub:h1}}', [], ["width"]],
        ["wbar", S + ".wbar", '[data-probe="ad-body"] {{hub:wbar}}', [], ["width", "height"]],
        ["줄", S + ".ad-body > div[style*=flex]", B, [], ["height"], [], { kids: true }],
        ["chip", S + ".ad-body > div[style*=flex] .chip", `${B} [class*="Surface-module__"][class*="__chip"]`, [], ["width"]],
        ["확정 버튼", S + ".ad-body > div[style*=flex] .btn", `${B} ${BTN}`, [], ["width", "margin-left"]],
        ...table(S, T, { cols: 6 }),
        ["td rank", S + ".atbl tbody tr:first-child td:nth-child(1)", `${T} tbody tr:first-child td:nth-child(1)`, [], ["width", "height"]],
        ["td b", S + ".atbl tbody tr:first-child b", `${T} tbody tr:first-child b`, [], ["width"]],
        ["td 수상", S + ".atbl tbody tr:first-child td:nth-child(5) .badge", `${T} tbody tr:first-child td:nth-child(5) ${BADGE}`, [], ["width"]],
        ["td 보증금", S + ".atbl tbody tr:first-child td:nth-child(6)", `${T} tbody tr:first-child td:nth-child(6)`, [], ["width", "height"]],
        ["줄긋기 td", S + ".atbl tr.strike td:nth-child(3)", `${T} tr{{c:strike}} td:nth-child(3)`, [], ["width", "height"]],
        ["줄긋기 팀", S + ".atbl tr.strike .tnm", `${T} tr{{c:strike}} {{c:tnm}}`, [], ["width", "height"]],
        ["제재 배지", S + ".atbl tr.strike .badge", `${T} tr{{c:strike}} ${BADGE}`, [], ["width"]],
        ["안내", S + ".ad-body > p:last-child", '[data-probe="ad-body"] > p:last-child', [], ["width", "height"]],
      ];
    },
    text: (S) => [
      ["제목", S + ".hb-h1", '[data-probe="ad-body"] {{hub:h1}}'],
      ["경고줄", S + ".wbar", '[data-probe="ad-body"] {{hub:wbar}}'],
      ["줄", S + ".ad-body > div[style*=flex]", '[data-probe="awards-bar"]'],
      ["머리글", S + ".atbl thead", '[data-probe="awards"] thead'],
      /* 몸통 다섯 줄도 시안 목업 그대로 심었다(dev-admin-fixture) */
      ["몸통", S + ".atbl tbody", '[data-probe="awards"] tbody'],
      ["안내", S + ".ad-body > p:last-child", '[data-probe="ad-body"] > p:last-child'],
    ],
    hover: (S) => [
      ["확정 hover", S + ".ad-body > div[style*=flex] .btn", `[data-probe="awards-bar"] ${BTN}`],
    ],
  },
};
