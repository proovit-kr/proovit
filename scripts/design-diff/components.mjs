/*
  공용 컴포넌트 — 시안의 조각과 `/dev/components` 진열장을 1:1로 대조한다.

  시안 쪽은 클래스 셀렉터로, 구현본 쪽은 `data-probe`로 집는다. 구현본은 CSS
  Module이라 클래스 이름이 해시돼 있어 같은 셀렉터를 쓸 수 없다.

  ⚠️ 시안 화면은 `.on`이 붙은 것만 display:block이다. 감춰진 화면 안의 요소도
  computed style은 정상으로 나오지만(레이아웃 값이 아니다), width/height 같은
  것은 0이 된다. 그래서 여기서는 **박스 크기를 재지 않고 스타일만 본다.**
  크기 대조는 화면별 섹션에서 그 화면을 켜 놓고 한다.

    node scripts/design-diff/components.mjs
*/
import { withPage, diffTable, SPEC_URL, IMPL_URL, WIDTHS } from "./cdp.mjs";

const IMPL = IMPL_URL + "/dev/components";

/* 공통으로 볼 속성. 사용자가 지정한 13종에 시안이 실제로 쓰는 것을 더했다 */
const BOX = [
  "font-size", "font-weight", "line-height", "letter-spacing",
  "color", "background-color", "background-image",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-bottom",
  "border-top-width", "border-top-style", "border-top-color",
  "border-radius", "box-shadow", "gap", "display", "align-items",
];

/*
  [이름, 시안 셀렉터, 진열장 셀렉터, 추가로 볼 속성]

  시안 셀렉터는 그 조각이 실제로 쓰인 자리를 가리킨다 — 시안에는 진열장이
  없으므로 화면 안에서 골라야 한다.
*/
/*
  ⚠️ 시안 셀렉터를 고를 때 **화면별 오버라이드가 걸린 자리를 피한다.**
  예를 들어 `.ld-ctas .btn`은 랜딩이 `padding:13px 24px;font-size:15px`로
  덮어쓴 것이라 공용 `.btn`의 값이 아니다. 그런 자리를 고르면 공용 컴포넌트가
  틀린 것처럼 보인다(실제로 처음에 그렇게 잡았다).

  쓰인 자리가 없거나 전부 오버라이드 아래에 있으면 `{inject}`로 요소를 심는다.
*/
const PAIRS = [
  ["btn-primary", { html: '<button class="btn btn-primary">가</button>' }, '[data-probe="btn-primary"]'],
  ["btn-outline", { html: '<button class="btn btn-outline">가</button>' }, '[data-probe="btn-outline"]'],
  ["btn-ghost", { html: '<button class="btn btn-ghost">가</button>' }, '[data-probe="btn-ghost"]'],
  ["btn-danger", { html: '<button class="btn btn-danger">가</button>' }, '[data-probe="btn-danger"]'],
  ["btn-disabled", { html: '<button class="btn" disabled>가</button>' }, '[data-probe="btn-disabled"]'],
  ["btn-kakao", { html: '<button class="btn btn-kakao">가</button>' }, '[data-probe="btn-kakao"]'],
  ["btn-google", { html: '<button class="btn btn-google">가</button>' }, '[data-probe="btn-google"]'],

  ["bd-lime", { html: '<span class="badge bd-lime">가</span>' }, '[data-probe="bd-lime"]'],
  ["bd-red", { html: '<span class="badge bd-red">가</span>' }, '[data-probe="bd-red"]'],
  ["bd-gray", { html: '<span class="badge bd-gray">가</span>' }, '[data-probe="bd-gray"]'],
  ["bd-warn", { html: '<span class="badge bd-warn">가</span>' }, '[data-probe="bd-warn"]'],
  ["bd-blue", { html: '<span class="badge bd-blue">가</span>' }, '[data-probe="bd-blue"]'],
  ["bd-violet", { html: '<span class="badge bd-violet">가</span>' }, '[data-probe="bd-violet"]'],
  ["bd-teal", { html: '<span class="badge bd-teal">가</span>' }, '[data-probe="bd-teal"]'],

  ["card", { html: '<div class="card">가</div>' }, '[data-probe="card"]'],
  ["chip", { html: '<span class="chip">가</span>' }, '[data-probe="chip"]', ["font-family"]],
  ["score", { html: '<span class="score">1</span>' }, '[data-probe="score"]',
    ["font-family", "font-variant-numeric"]],

  ["inp", { html: '<div class="fld"><input class="inp"></div>', pick: ".inp" }, '[data-probe="inp"]'],
  ["textarea", { html: '<div class="fld"><textarea class="inp"></textarea></div>', pick: "textarea" },
    '[data-probe="textarea"]', ["min-height", "resize"]],
  ["fld", { html: '<div class="fld"></div>', pick: ".fld" }, '[data-probe="fld"]>div'],
  ["fld-label", { html: '<div class="fld"><label>가<small>나</small></label></div>', pick: "label" },
    '[data-probe="fld"] label'],
  ["fld-label-small", { html: '<div class="fld"><label>가<small>나</small></label></div>', pick: "small" },
    '[data-probe="fld"] label small', ["font-family"]],
  ["fld-hint", { html: '<div class="fld"><p class="hint">가</p></div>', pick: ".hint" },
    '[data-probe="fld"] p'],
  ["cnt", { html: '<div class="fld"><label>가<span class="cnt">1</span></label></div>', pick: ".cnt" },
    '[data-probe="fld"] label span', ["font-family"]],

  ["row-sw", { html: '<div class="row-sw"><span><b>가</b><small>나</small></span><span class="sw"><input type="checkbox"><i></i></span></div>', pick: ".row-sw" },
    '[data-probe="sw"]'],
  /* `.sw`는 실제로 `.row-sw`의 플렉스 아이템으로만 쓰인다. 그 자리에서 잰다 */
  ["sw", { html: '<div class="row-sw"><span><b>가</b></span><span class="sw"><input type="checkbox"><i></i></span></div>', pick: ".sw" },
    '[data-probe="sw"] > span:last-child', ["width", "height"]],
  ["sw-knob", { html: '<div class="row-sw"><span><b>가</b></span><span class="sw"><input type="checkbox"><i></i></span></div>', pick: ".sw i" },
    '[data-probe="sw"] > span:last-child i', ["width", "height"]],
  ["ic", { html: '<svg class="ic" viewBox="0 0 24 24"></svg>', pick: ".ic" }, '[data-probe="ic-bare"]',
    ["width", "height", "stroke-width", "stroke", "vertical-align", "fill",
     "stroke-linecap", "stroke-linejoin"]],
];

const probeFor = (pairs) => `(() => {
  const BOX = ${JSON.stringify(BOX)};
  const PAIRS = ${JSON.stringify(pairs)};
  const out = {};
  const missing = [];
  const planted = [];

  for (const [name, sel, extra] of PAIRS) {
    let el;
    if (sel && typeof sel === "object" && sel.html) {
      /*
        시안 쪽 조각을 그대로 심어서 잰다. 화면 안의 실제 자리를 쓰면
        그 화면의 오버라이드와 **부모의 블록화**가 섞인다 — 예를 들어
        .act 안의 버튼은 부모가 flex라 inline-flex가 flex로 바뀐다.
        공용 컴포넌트 자체의 값을 보려면 양쪽 다 평범한 블록 부모에 둬야 한다.
        실제 자리에서의 확인은 화면별 섹션이 한다.

        ⚠️ position을 주지 않는다. absolute/fixed도 요소를 블록화한다.
      */
      const host = document.createElement("div");
      host.innerHTML = sel.html;
      document.body.appendChild(host);
      planted.push(host);
      el = sel.pick ? host.querySelector(sel.pick) : host.firstElementChild;
    } else {
      el = document.querySelector(sel);
    }
    if (!el) { missing.push(name + "  ← " + JSON.stringify(sel)); continue; }

    const cs = getComputedStyle(el);
    for (const p of BOX.concat(extra || [])) {
      /*
        테두리 폭이 0이면 style·color는 화면에 아무 영향이 없다.
        Tailwind preflight가 모든 요소에 border-style:solid를 주는데
        시안은 none이라 여기서만 전부 불일치로 뜬다 — 폭이 0인 동안은 뺀다.
      */
      if (p.startsWith("border-top-") && p !== "border-top-width"
          && cs.getPropertyValue("border-top-width") === "0px") continue;
      out[name + " " + p] = cs.getPropertyValue(p);
    }
  }
  for (const el of planted) el.remove();
  return { out, missing };
})()`;

let total = 0;
for (const w of WIDTHS) {
  const specPairs = PAIRS.map(([n, s, , x]) => [n, s, x]);
  const implPairs = PAIRS.map(([n, , i, x]) => [n, i, x]);

  /*
    ⚠️ 글자 대조가 없다. 시안의 컴포넌트 갤러리와 우리 `/dev/components`는
    각자 다른 예시 문구로 같은 부품을 늘어놓은 진열장이라, 글자가 다른 것이
    정상이다. 부품의 **값**이 같은지가 이 프로브의 일이다.
  */
  const spec = await withPage(async (p) => {
    await p.goto(SPEC_URL);
    await p.resize(w);
    return p.eval(probeFor(specPairs));
  });
  const impl = await withPage(async (p) => {
    await p.goto(IMPL);
    await p.resize(w);
    return p.eval(probeFor(implPairs));
  });

  console.log(`\n\n████ 폭 ${w}`);
  for (const m of spec.missing) console.log(`  ⚠️ 시안에서 못 찾음: ${m}`);
  for (const m of impl.missing) console.log(`  ⚠️ 구현본에서 못 찾음: ${m}`);
  total += spec.missing.length + impl.missing.length;
  total += diffTable(`${w}px — 공용 컴포넌트`, spec.out, impl.out);
}
console.log(`\n═══════════════════════════\n세 폭 합계 불일치 ${total}건`);
