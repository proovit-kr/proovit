/*
  참가 신청 — 시안 ver4 `#scr-apply`(2085행)와 `/apply`를 대조한다.

    node scripts/design-diff/apply.mjs               # ①② 둘 다
    STATE=form node scripts/design-diff/apply.mjs    # ① 작성
    STATE=done node scripts/design-diff/apply.mjs    # ② 신청 완료

  브라우저는 `cdp-chrome`으로만 띄운다(손으로 띄운 헤드리스가 남으면 평소
  크롬이 안 뜬다).

    npm run dev
    cdp-chrome node scripts/design-diff/apply.mjs

  ⚠️ **상태가 데이터로 갈린다.** 시안은 상태 바 버튼으로 `data-state`를 바꾸지만
  우리는 시즌 페이즈와 참가 기록이 그 둘을 만든다(page.tsx) — `apply-state.mts`가
  dev DB를 그 모양으로 만들고 대조 전용 세션 토큰을 준다. 구현본이 **지금 무엇을
  그리는지 먼저 찍고** 원하는 상태가 아니면 재지 않고 멈춘다
  (`leaderboard.mjs`의 `stateOf` 가드와 같다). 상태가 어긋난 채 0건이 나오는
  것이 제일 나쁘다.

  ⚠️ 끝나면 `apply-state.mts restore`를 **반드시** 부른다(`finally`). 중간에
  죽어도 dev DB가 픽스처인 채 남지 않게 한다.

  대조 범위는 `.ap-wrap` **안쪽**이다. 시안 `#scr-apply`에는 `.pub-head`가
  있지만 헤더는 `header-states.mjs`가 본다. 푸터는 시안에 없다(page.tsx 주석).

  ⚠️ **모듈 이름만으로 집으면 엉뚱한 것을 잡는다.** 폼의 칸·입력·힌트는
  `Field.module.css`, 동의 줄은 `ConsentFields.module.css`, 버튼은
  `Button.module.css`가 시안 값을 들고 있다 — auth.mjs처럼
  `[class*="X-module"][class*="__name"]` 꼴로 집는다.

  ⚠️ **시안의 입력값과 동의 `checked`는 목업이다.** 시안은 「리틀포션, 1인 카페
  레시피 구독」이 채워져 있고 동의 둘이 켜져 있지만, 구현은 빈 폼·동의 해제가
  기본이다(그게 맞다 — 미리 켜 두면 D4 위반이다). 그래서 `value`와 `checked`는
  대조 축에서 뺀다. 상자 값은 둘 다 같고, 글자 대조도 `value`·`placeholder`가
  텍스트 노드가 아니라 애초에 안 걸린다. ② 요약 카드의 값은 반대로 **텍스트**라
  픽스처를 시안 목업과 같은 값으로 만들어 글자까지 대조한다(apply-state.mts).

  ⚠️ 시안 337행이 초대 칸의 표시 규칙이다 —
  `.ap-wrap:has(.solo-row input:not(:checked)) .fld.invite{display:flex}`.
  「혼자 참가」 기본 해제 = 초대 칸이 처음부터 열려 있다. 기본 상태로 재고,
  체크했을 때 `display:none`이 되는지도 한 번 본다(아래 ▸초대 칸).

  시안 CSS의 최종 승자는 `fold-spec.mjs --media '<셀렉터>'`로 확인했다.
  `.ap-wrap`·`.ap-done`·`.trk`·`.solo-row`·`.consents`·`.fld`류에 `@media`
  분기는 없다 — 폭 셋이 같은 값이어야 한다.
*/
import { execFileSync } from "node:child_process";

import {
  withPage, diffTable, diffText, textNodes,
  SPEC_URL, IMPL_URL, WIDTHS, shotDir, REPO,
} from "./cdp.mjs";

const OUT = shotDir("apply");

const CSS = [
  "font-size", "font-weight", "line-height", "letter-spacing",
  "color", "background-color", "background-image",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "border-radius", "box-shadow", "gap", "display", "flex-direction",
  "align-items", "justify-content", "text-align", "width", "max-width",
  "font-family", "accent-color", "cursor", "opacity",
  "grid-template-columns", "resize", "vertical-align",
  "border-top-width", "border-top-style", "border-top-color",
];

/*
  ⚠️ `min-height`는 공용 목록에 넣지 않는다. 이 화면에서 시안이 실제로 주는
  자리는 `textarea.inp{min-height:110px}` 하나인데, 공용으로 재면 나머지 전부가
  「블록이면 0px · 플렉스 아이템이면 auto」라는 **초기값의 표기 차이**만 뱉는다.
  그건 상자 값이 아니라 조상이 플렉스인지의 그림자라, 아래 width 줄이 이미
  더 정확하게 말한다. 소개 칸에만 붙여서 잰다.
*/

/* 구현본 쪽 모듈. 이름만으로 집으면 뒤 화면의 같은 이름을 먼저 잡는다 */
const AP = (n) => `[class*="apply-module"][class*="__${n}"]`;
const AF = (n) => `[class*="ApplyForm-module"][class*="__${n}"]`;
const AD = (n) => `[class*="ApplyDone-module"][class*="__${n}"]`;
const FD = (n) => `[class*="Field-module"][class*="__${n}"]`;
const CF = (n) => `[class*="ConsentFields-module"][class*="__${n}"]`;

/* [이름, 시안 셀렉터, 구현본 셀렉터, 추가 속성, 뺄 속성] */
const formPairs = () => {
  const S = '#scr-apply[data-state="form"] ';
  /* 시안은 `.fld`를 클래스로만 구분하므로 `.only-form`의 몇 번째 div인지로 집는다 */
  const fld = (n) => `${S}.only-form > div:nth-of-type(${n})`;
  const row = (n) => `${S}.consents label:nth-of-type(${n})`;
  const irow = (n) => `${CF("row")}:nth-of-type(${n})`;
  return [
    /*
      ⚠️ 시안 `.ap-wrap`은 ①과 ②를 **둘 다** 담고 하나를 숨긴다. 우리는 갈래가
      서버에서 갈려 한쪽만 그려진다 — 높이는 당연히 다르므로 안 잰다.
    */
    ["wrap", S + ".ap-wrap", AP("apWrap")],
    ["h1", S + ".only-form h1", AP("apWrap") + " > h1"],
    ["ss", S + ".only-form .ss", AP("ss")],
    /*
      시안 `.only-form`에는 h1·.ss까지 들어 있고 우리 `<form>`에는 없다
      (기둥이 ②와 공용이라 page.tsx가 그린다). 상자 값만 견준다.
    */
    ["form", S + ".only-form", AF("form")],

    /* ── 트랙 선택 ── */
    ["fld(트랙)", fld(1), `${FD("fld")}:has(${AF("trk")})`],
    ["fld(트랙) 라벨", fld(1) + " > label", `${FD("fld")}:has(${AF("trk")}) > ${FD("label")}`],
    ["trk", S + ".trk", AF("trk")],
    ["trk label", S + ".trk label:nth-of-type(1)", AF("trk") + " label:nth-of-type(1)"],
    ["trk label(dis)", S + ".trk label.dis", AF("dis")],
    ["trk b", S + ".trk label:nth-of-type(1) b", AF("trk") + " label:nth-of-type(1) b"],
    ["trk small", S + ".trk label:nth-of-type(1) small", AF("trk") + " label:nth-of-type(1) small"],
    ["trk input", S + ".trk input", AF("trk") + " input"],

    /* ── 아이디어명 ── */
    ["fld(아이디어명)", fld(2), `${FD("fld")}:has(#ideaTitle)`],
    ["fld(아이디어명) 라벨", fld(2) + " > label", `${FD("fld")}:has(#ideaTitle) > ${FD("label")}`],
    ["fld(아이디어명) small", fld(2) + " > label small", `${FD("fld")}:has(#ideaTitle) > ${FD("label")} small`],
    ["입력(아이디어명)", fld(2) + " .inp", "#ideaTitle", ["height"]],

    /* ── 아이디어 소개 ── */
    ["fld(소개)", fld(3), `${FD("fld")}:has(#ideaSummary)`],
    ["fld(소개) 라벨", fld(3) + " > label", `${FD("fld")}:has(#ideaSummary) > ${FD("label")}`],
    ["입력(소개)", fld(3) + " textarea.inp", "#ideaSummary", ["height", "min-height"]],

    /* ── 팀명 ── */
    ["fld(팀명)", fld(4), `${FD("fld")}:has(#teamName)`],
    ["fld(팀명) 라벨", fld(4) + " > label", `${FD("fld")}:has(#teamName) > ${FD("label")}`],
    ["입력(팀명)", fld(4) + " .inp", "#teamName", ["height"]],

    /* ── 혼자 참가 ── */
    ["solo", S + ".solo-row", AF("soloRow")],
    ["solo input", S + ".solo-row input", "#isSolo", ["height"]],
    ["solo label", S + ".solo-row label", AF("soloRow") + " label", [], ["width"]],

    /* ── 팀원 초대(기본 열림) ── */
    ["invite", S + ".fld.invite", AF("invite")],
    ["invite 라벨", S + ".fld.invite > label", `${AF("invite")} > ${FD("label")}`],
    ["invite small", S + ".fld.invite > label small", `${AF("invite")} > ${FD("label")} small`],
    ["invite 입력", S + ".fld.invite .inp", "#inviteEmail", ["height"]],
    ["invite hint", S + ".fld.invite .hint", `${AF("invite")} ${FD("hint")}`],

    /* ── 동의 ── */
    ["consents", S + ".consents", CF("root")],
    ["consent1", row(1), irow(1)],
    ["consent1 박스", row(1) + " input", `${irow(1)} ${CF("checkbox")}`, ["height", "flex-grow", "flex-basis"]],
    ["consent1 글", row(1) + " > span", `${irow(1)} ${CF("label")}`, ["flex-grow", "flex-basis", "min-width"]],
    ["consent1 req", row(1) + " .req", `${irow(1)} ${CF("tagRequired")}`],
    ["consent2", row(2), irow(2)],
    ["consent2 글", row(2) + " > span", `${irow(2)} ${CF("label")}`, ["flex-grow", "flex-basis", "min-width"]],
    ["consent2 req", row(2) + " .req", `${irow(2)} ${CF("tagRequired")}`],

    /* ── 제출 버튼. 시안이 자리마다 인라인으로 주는 값이 실리는지 본다 ── */
    ["제출", S + ".only-form .btn.btn-primary", `${AF("form")} button[type="submit"]`, ["height"]],
  ];
};

const donePairs = () => {
  const S = '#scr-apply[data-state="done"] ';
  const sumRow = (n) => `${S}.ap-done .sum div:nth-of-type(${n})`;
  const iSumRow = (n) => `${AD("sum")} > div:nth-of-type(${n})`;
  return [
    ["wrap", S + ".ap-wrap", AP("apWrap")],
    ["done", S + ".ap-done", AD("done")],
    ["mk", S + ".ap-done .mk", AD("mk")],
    ["h2", S + ".ap-done h2", AD("done") + " h2"],
    ["p", S + ".ap-done p", AD("done") + " p"],
    ["sum", S + ".ap-done .sum", AD("sum")],
    ["sum 줄1", sumRow(1), iSumRow(1)],
    ["sum 줄1 라벨", sumRow(1) + " span", iSumRow(1) + " span"],
    ["sum 줄1 값", sumRow(1) + " b", iSumRow(1) + " b"],
    ["sum 줄3", sumRow(3), iSumRow(3)],
    /* 시안은 `<button>`, 우리는 실제로 이동하는 `<a>`다(Button.tsx 주석) */
    ["버튼", S + ".ap-done .btn", `${AD("done")} a[class*="Button-module"]`, ["height"]],
  ];
};

/*
  ⚠️ `value`·`checked`는 위 목록에 없다 — 머리 주석의 이유대로 시안 쪽이 채워진
  목업이라 견줄 축이 아니다. 계산값에도 안 실린다.
*/

const probe = () => `(() => {
  const CSS = ${JSON.stringify(CSS)};
  const out = {}, missing = [];
  for (const [name, sel, extra, skip] of LIST) {
    const el = document.querySelector(sel);
    if (!el) { missing.push(name + "  ← " + sel); continue; }
    const cs = getComputedStyle(el);
    /*
      ⚠️ display:none이면 **display만** 적는다. 상자를 안 만드는 요소의 글꼴·
      색은 화면에 못 나오는데, Tailwind 프리플라이트가 폼 컨트롤에 font·color를
      물려주는 탓에(시안에는 프리플라이트가 없다) 숨은 라디오에서만 여섯 줄이
      가짜로 뜬다. display는 그대로 재므로 「숨겨야 할 것을 안 숨겼다」는
      여전히 잡힌다 — 초대 칸의 표시 규칙이 그 자리다.
    */
    if (cs.display === "none") { out[name + " display"] = "none"; continue; }
    for (const p of CSS.concat(extra || [])) {
      if ((skip || []).includes(p)) continue;
      /* 테두리가 없으면 색·모양은 의미가 없다 */
      if (p.startsWith("border-") && !p.endsWith("width")
          && cs.getPropertyValue("border-top-width") === "0px") continue;
      out[name + " " + p] = cs.getPropertyValue(p);
    }
    /* 의사요소도 잰다 — 시안은 연출의 절반을 거기서 한다 */
    for (const pe of ["::before", "::after"]) {
      const pcs = getComputedStyle(el, pe);
      if (pcs.content === "none") continue;
      for (const p of ["content","position","width","height","z-index","opacity",
                       "background-image","animation-name","color","margin-left"]) {
        let v = pcs.getPropertyValue(p);
        if (p === "animation-name") v = v.split(", ").map(n => n.replace(/^.*__/, "")).join(", ");
        out[name + pe + " " + p] = v;
      }
    }
    /* 시안 \`.inp::placeholder{color:var(--faint)}\` — 본체만 재면 빠진다.
       라디오·체크박스에는 자리표시가 없다 */
    if (el.matches("textarea, input:not([type=radio]):not([type=checkbox])")) {
      out[name + "::placeholder color"] = getComputedStyle(el, "::placeholder").color;
    }
    /* 그리드·플렉스면 자식 키가 서로 같은지 */
    const disp = cs.display;
    if (disp === "grid" || disp === "flex") {
      const shown = [...el.children].filter(c => getComputedStyle(c).display !== "none");
      const hs = shown.map(c => Math.round(c.getBoundingClientRect().height));
      out[name + " ▸자식 수"] = String(shown.length);
      out[name + " ▸자식 높이 같음"] = hs.length > 1 ? String(new Set(hs).size === 1) : "해당없음";
    }
    /* 겹침 — 불투명한 조상 수 */
    let opaque = 0;
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const c2 = getComputedStyle(n);
      if (c2.backgroundColor !== "rgba(0, 0, 0, 0)" || c2.backgroundImage !== "none") opaque++;
    }
    out[name + " ▸불투명한 조상 수"] = String(opaque);
    /* 넘침 — 콘텐츠가 상자를 벗어났는가 */
    out[name + " ▸가로 넘침"] = String(el.scrollWidth > el.clientWidth + 1);
    /*
      ⚠️ 기둥 안에서 가운데인가. .ap-wrap은 margin:0 auto라 계산값이
      형제 폭에 딸린 값이 된다 — 뜻을 직접 잰다(AGENTS.md 함정 4).
    */
    if (name === "wrap" || name === "sum") {
      const r = el.getBoundingClientRect();
      const pr = el.parentElement.getBoundingClientRect();
      out[name + " ▸가운데"] =
        Math.abs((r.left - pr.left) - (pr.right - r.right)) < 2 ? "가운데" : "치우침";
    }
  }
  return { out, missing };
})()`;

const run = (list, side) =>
  probe().replace("LIST", JSON.stringify(list.map(([n, s, i, x, k]) =>
    side === "spec" ? [n, s, x, k] : [n, i, x, k])));

/*
  ① 폼의 구조. 셀렉터로 집은 것만 재면 칸이 하나 빠져도 값 대조는 0건이라
  말한다 — 칸 수와 순서를 통째로 센다.
*/
const formShape = (wrapSel) => `(() => {
  const wrap = document.querySelector(${JSON.stringify(wrapSel)});
  if (!wrap) return null;
  const labels = [...wrap.querySelectorAll("label")]
    .filter(l => getComputedStyle(l).display !== "none");
  /*
    ⚠️ type=hidden은 뺀다. 서버 액션 폼에 Next가 자기 몫의 숨은 input을
    몇 개 끼워 넣는데(ACTION 접두사), 그건 디자인이 아니라 프레임워크 배관이다.
  */
  return {
    "▸입력 수": String(wrap.querySelectorAll("input:not([type=hidden]), textarea, select").length),
    "▸보이는 라벨 수": String(labels.length),
    "▸버튼 수": String(wrap.querySelectorAll("button, a[class*='Button-module'], a.btn").length),
  };
})()`;

/*
  초대 칸의 표시 규칙(시안 337행). 기본은 열림이고 「혼자 참가」를 켜면 닫힌다.
  눌러 보고 되돌린다 — 이어지는 측정이 켜진 상태로 흐르면 안 된다.
*/
const inviteToggle = (chk, inv) => `(() => {
  const box = document.querySelector(${JSON.stringify(chk)});
  const fld = document.querySelector(${JSON.stringify(inv)});
  if (!box || !fld) return null;
  const off = getComputedStyle(fld).display;
  box.click();
  const on = getComputedStyle(fld).display;
  box.click();
  return { "▸초대 칸(혼자 참가 해제)": off, "▸초대 칸(혼자 참가 체크)": on,
           "▸초대 칸(되돌린 뒤)": getComputedStyle(fld).display };
})()`;

/*
  상태(hover/focus) 축. 계산값은 기본 상태만 말한다.
    · `.btn-primary:hover` — 배경·그림자가 바뀐다
    · `.inp:focus` — 라임 테두리 + 링. 이 화면 입력칸 전부에 걸린다
    · `.trk label`에는 hover 규칙이 **없다** — 우리가 덧붙이지 않았는지 본다
*/
const STATE_CSS = ["color", "background-color", "background-image", "box-shadow",
                   "border-top-color", "filter", "outline-color", "outline-width"];
const STATES = {
  form: [
    ["제출:hover", '#scr-apply[data-state="form"] .only-form .btn-primary',
      `${AF("form")} button[type="submit"]`, ["hover"]],
    ["trk label:hover", '#scr-apply[data-state="form"] .trk label:nth-of-type(1)',
      AF("trk") + " label:nth-of-type(1)", ["hover"]],
    ["입력:focus", '#scr-apply[data-state="form"] .only-form > div:nth-of-type(2) .inp',
      "#ideaTitle", ["focus"]],
    ["소개:focus", '#scr-apply[data-state="form"] .only-form > div:nth-of-type(3) textarea.inp',
      "#ideaSummary", ["focus"]],
  ],
  done: [
    ["버튼:hover", '#scr-apply[data-state="done"] .ap-done .btn',
      `${AD("done")} a[class*="Button-module"]`, ["hover"]],
  ],
};

async function stateValues(p, mode, side) {
  const out = {};
  for (const [name, specSel, implSel, pseudo] of STATES[mode]) {
    const sel = side === "spec" ? specSel : implSel;
    await p.hover(sel, pseudo);
    const v = await p.eval(`(() => {
      const cs = getComputedStyle(document.querySelector(${JSON.stringify(sel)}));
      const o = {};
      for (const k of ${JSON.stringify(STATE_CSS)}) o[k] = cs.getPropertyValue(k);
      return o;
    })()`);
    for (const [k, val] of Object.entries(v)) out[`${name} ${k}`] = val;
  }
  await p.hover();
  return out;
}

/*
  시안은 상태 바 버튼(`.sb[data-set]`)으로 고른다. `stripViewerShell()`이
  상태 바를 가리기 **전에** 누른다 — data-state만 바꾸면 버튼에 딸린 연출이
  따라오지 않는다(auth.mjs·leaderboard.mjs와 같은 방식).
*/
const pickState = (state) => `(() => {
  const sec = document.getElementById("scr-apply");
  sec.querySelector('.sb[data-set="' + ${JSON.stringify(state)} + '"]').click();
  return sec.dataset.state;
})()`;

/* 구현본이 지금 어느 갈래를 그리는지. 시안에 없는 둘도 이름으로 가른다 */
const stateOf = `(() => {
  if (!location.pathname.startsWith("/apply")) return "다른 화면: " + location.pathname;
  const q = (s) => !!document.querySelector(s);
  if (q(${JSON.stringify(AD("done"))})) return "done";
  if (q(${JSON.stringify(AF("form"))})) return "form";
  if (q(${JSON.stringify(AP("ctaNote"))})) return "모집 아님(시안 밖)";
  if (q('form[action] input[name="code"]')) return "초대 코드(시안 밖)";
  return "알 수 없음";
})()`;

/*
  ⚠️ 계정 동의 모달이 화면을 덮으면 그 아래를 재게 된다. `apply-state.mts`가
  계정 동의를 채워 두지만, 못 채운 채로 흐르면 조용히 틀린 값이 나온다.
*/
const modalCount = `String([...document.querySelectorAll('[aria-modal="true"]')]
  .filter((d) => d.getClientRects().length).length)`;

/* dev DB 상태 스위치. `.env`는 운영 DB라 반드시 .env.development.local로 돈다 */
const devState = (arg) =>
  execFileSync("node", [
    "--env-file=.env.development.local", "--import", "tsx",
    "scripts/design-diff/apply-state.mts", arg,
  ], { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] })
    .trim().split("\n").pop();

const MODES = process.env.STATE ? [process.env.STATE] : ["form", "done"];
for (const m of MODES) {
  if (m !== "form" && m !== "done") throw new Error(`STATE는 form·done 중 하나: ${m}`);
}

const TEXT_SPEC = (mode) =>
  `#scr-apply[data-state="${mode}"] ` + (mode === "form" ? ".only-form" : ".ap-done");
const TEXT_IMPL = (mode) => (mode === "form" ? AP("apWrap") : AD("done"));

let total = 0;
devState("save");
try {
  for (const mode of MODES) {
    const token = devState(mode);
    const list = mode === "form" ? formPairs() : donePairs();

    for (const w of WIDTHS) {
      const spec = await withPage(async (p) => {
        await p.goto(SPEC_URL + "#apply");
        const picked = await p.eval(pickState(mode));
        if (picked !== mode) throw new Error(`시안 상태 전환 실패: ${picked}`);
        await p.stripViewerShell();
        /* 헤더는 header-states.mjs가 본다 — 여기서는 기둥만 남긴다 */
        await p.eval(`(() => {
          document.querySelectorAll("#scr-apply .pub-head").forEach(el => { el.style.display = "none" });
          return 1;
        })()`);
        await p.resize(w, 900);
        const r = await p.eval(run(list, "spec"));
        if (mode === "form") {
          Object.assign(r.out, await p.eval(formShape('#scr-apply[data-state="form"] .only-form')));
          Object.assign(r.out, await p.eval(
            inviteToggle("#soloChk", '#scr-apply[data-state="form"] .fld.invite')));
        }
        Object.assign(r.out, await stateValues(p, mode, "spec"));
        await p.shot(`${OUT}/spec-${mode}-${w}.png`);
        r.text = await p.eval(textNodes(TEXT_SPEC(mode)));
        return r;
      });

      const impl = await withPage(async (p) => {
        /* ⚠️ 쿠키는 브라우저 전체가 나눠 쓴다 — 앞선 실행의 세션을 비우고 심는다 */
        await p.send("Network.clearBrowserCookies");
        await p.send("Network.setCookie", {
          name: "authjs.session-token", value: token,
          domain: new URL(IMPL_URL).hostname, path: "/",
        });
        await p.goto(IMPL_URL + "/apply");
        const now = await p.eval(stateOf);
        if (now !== mode) {
          throw new Error(`구현본이 「${now}」를 그린다 — ${mode}를 재려면 dev DB/세션을 먼저 맞춘다`);
        }
        const modals = await p.eval(modalCount);
        if (modals !== "0") throw new Error(`화면을 덮은 모달이 ${modals}개 있다`);
        await p.resize(w, 900);
        const r = await p.eval(run(list, "impl"));
        if (mode === "form") {
          Object.assign(r.out, await p.eval(formShape(AP("apWrap"))));
          Object.assign(r.out, await p.eval(inviteToggle("#isSolo", AF("invite"))));
        }
        Object.assign(r.out, await stateValues(p, mode, "impl"));
        await p.shot(`${OUT}/impl-${mode}-${w}.png`);
        r.text = await p.eval(textNodes(TEXT_IMPL(mode)));
        return r;
      });

      console.log(`\n\n████ ${mode} · 폭 ${w}`);
      for (const m of spec.missing) console.log(`  ⚠️ 시안에서 못 찾음: ${m}`);
      for (const m of impl.missing) console.log(`  ⚠️ 구현본에서 못 찾음: ${m}`);
      total += spec.missing.length + impl.missing.length;
      total += diffTable(`${mode} ${w}px — 참가 신청`, spec.out, impl.out);
      /*
        ⚠️ 예외 목록을 두지 않는다. 폼의 입력값은 텍스트 노드가 아니고,
        ② 요약 카드의 값은 픽스처를 시안과 같게 만들어 실제로 대조한다.
        차이가 나오면 가리지 말고 빨간 줄로 남긴다(AGENTS.md).
      */
      total += diffText(spec.text, impl.text, { label: mode });
    }
  }
} finally {
  devState("restore");
}

console.log(`\n═══════════════════════════\n합계 불일치 ${total}건`);
console.log(`스크린샷: ${OUT}`);
