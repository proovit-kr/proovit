/*
  시안 CSS의 누적 오버라이드를 접어 **최종 승자**만 뽑는다.

  시안은 v0.1~v2.1 패스가 겹겹이 쌓여 있어 같은 셀렉터가 최대 다섯 번 덮인다.
  눈으로 따라가면 반드시 놓친다(실제로 `.fld .hint`의 line-height를 놓쳤다).
  이식을 시작하기 전에 이걸 돌려서 나온 표를 보고 옮긴다.

    node scripts/design-diff/fold-spec.mjs '\\.ld'        # 랜딩 전체
    node scripts/design-diff/fold-spec.mjs '\\.btn' '\\.badge'
    node scripts/design-diff/fold-spec.mjs --media '\\.ld'  # @media 규칙도 함께

  인자는 셀렉터에 대한 정규식이다. 여러 개 주면 OR로 묶인다.

  ⚠️ 여기서 나온 값을 그대로 복사한다. 기억으로 다시 쓰지 않는다.
*/
import { readFileSync } from "node:fs";

import { SPEC_PATH } from "./cdp.mjs";

/* 정본 고르는 규칙은 한 곳에만 둔다 — cdp.mjs가 design/에서 최신 버전을 고른다 */
const SPEC = SPEC_PATH;

const args = process.argv.slice(2);
const withMedia = args.includes("--media");
const patterns = args.filter((a) => a !== "--media").map((a) => new RegExp(a));
if (!patterns.length) {
  console.error("셀렉터 정규식을 하나 이상 준다. 예: node fold-spec.mjs '\\\\.ld'");
  process.exit(1);
}

const css = readFileSync(SPEC, "utf8").split("<style>")[1].split("</style>")[0];
const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");

/** 규칙을 [셀렉터, 본문, 미디어조건] 으로 평탄화한다 */
function rules(src, media = "") {
  const out = [];
  let i = 0, buf = "";
  while (i < src.length) {
    const ch = src[i];
    if (ch === "{") {
      let depth = 1, j = i + 1;
      while (j < src.length && depth > 0) {
        if (src[j] === "{") depth++;
        else if (src[j] === "}") depth--;
        j++;
      }
      const sel = buf.trim();
      const body = src.slice(i + 1, j - 1);
      if (sel.startsWith("@media")) {
        if (withMedia) out.push(...rules(body, sel));
      } else if (!sel.startsWith("@")) {
        out.push([sel, body, media]);
      }
      buf = "";
      i = j;
      continue;
    }
    if (ch === ";") { buf = ""; i++; continue; }
    buf += ch;
    i++;
  }
  return out;
}

/** 선언을 순서대로 잘라낸다. 값 안의 괄호·따옴표를 보호한다 */
function decls(body) {
  const out = [];
  let buf = "", depth = 0, quote = null;
  for (const ch of body) {
    if (quote) { buf += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue; }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === ";" && depth === 0) { out.push(buf); buf = ""; continue; }
    buf += ch;
  }
  if (buf.trim()) out.push(buf);
  return out
    .map((d) => {
      const k = d.indexOf(":");
      return k < 0 ? null : [d.slice(0, k).trim(), d.slice(k + 1).trim()];
    })
    .filter(Boolean);
}

/*
  묶음 셀렉터를 쪼갠다.

  ⚠️ 이게 없으면 놓친다. `.ld-cmp li,.ld-crit li{font-size:15px}` 같은 규칙이
  `.ld-cmp li`와 다른 키로 잡혀서, `.ld-cmp li`만 보면 덮이기 전 값(14.5px)이
  최종인 것처럼 보인다. 실제로 랜딩에서 이런 규칙이 열 개 넘게 나왔다.

  `:is(a,b)`·`:not(a,b)` 안의 쉼표는 쪼개면 안 되므로 괄호 깊이를 센다.
*/
function splitSelectors(sel) {
  const out = [];
  let buf = "", depth = 0;
  for (const ch of sel) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) { out.push(buf.trim()); buf = ""; continue; }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

const hit = (sel) => patterns.some((re) => re.test(sel));

/*
  셀렉터별로 선언을 접는다. 키는 "미디어조건 | 셀렉터"다.
  나중에 온 선언이 이긴다 — 시안은 명시도를 거의 안 쓰고 순서로만 덮는다.
  덮인 값도 함께 남겨서 「무엇이 무엇을 이겼는지」 보이게 한다.
*/
const folded = new Map();
for (const [sel, body, media] of rules(clean)) {
  for (const one of splitSelectors(sel)) {
    if (!hit(one)) continue;
    const key = (media ? media + "\n" : "") + one;
    if (!folded.has(key)) folded.set(key, new Map());
    const props = folded.get(key);
    for (const [p, v] of decls(body)) {
      if (!props.has(p)) props.set(p, []);
      /* 어느 묶음에서 왔는지 남긴다 — 원본을 되짚을 때 필요하다 */
      props.get(p).push(one === sel ? v : `${v}   /* ← ${sel} */`);
    }
  }
}

if (!folded.size) {
  console.log("맞는 셀렉터가 없다.");
  process.exit(0);
}

let overridden = 0;
for (const [key, props] of folded) {
  console.log(`\n${key} {`);
  for (const [p, vals] of props) {
    const win = vals[vals.length - 1];
    if (vals.length === 1) {
      console.log(`  ${p}: ${win};`);
    } else {
      overridden++;
      /* 덮인 값을 옆에 남긴다. 「처음 만난 값」을 옮기는 실수를 막는다 */
      console.log(`  ${p}: ${win};   /* ← ${vals.slice(0, -1).join(" → ")} 를 덮음 */`);
    }
  }
  console.log("}");
}
console.log(
  `\n─────\n셀렉터 ${folded.size}개, 여러 번 덮인 속성 ${overridden}개.` +
    (withMedia ? "" : "  (@media 규칙은 --media 로 함께 본다)"),
);
