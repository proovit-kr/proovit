/*
  **절이 줄바꿈에 잘리는 자리를 찾는다.**

  `word-break: keep-all`(globals.css)은 어절 단위로만 끊게 해 줄 뿐, 어느
  어절 뒤에서 끊을지는 안 정한다. 그래서 이런 줄이 나온다 —

    … 참가자가 숫자를 입력하지 않고, 매출은
    결제사 정산 화면으로 확인해요.

  「매출은」 뒤는 읽는 사람이 쉬는 자리가 아니다. 바로 앞 쉼표가 그 자리다.
  `Clauses`(components/Clauses.tsx)가 절을 `inline-block`으로 붙들어 이걸
  막는데, **붙이는 것을 빠뜨려도 화면은 멀쩡해 보인다** — 폭이 넉넉하면
  드러나지 않고, 좁아졌을 때만 갈라진다. 그래서 검사로 만든다.

    node scripts/design-diff/linebreak.mjs

  판정: 한 줄에 들어갈 수 있는 절(절 너비 ≤ 칸 너비)이 두 줄에 걸치면 잡는다.
  절 자체가 한 줄보다 길면 그 안에서 끊는 수밖에 없으므로 세지 않는다.

  ⚠️ **칸 너비는 콘텐츠 상자로 잰다.** `getBoundingClientRect()`는 패딩을
  포함해서, 패딩이 있는 표 칸이 전부 가짜 불일치가 된다(th 107px/121px).
*/
import { withPage, IMPL_URL, WIDTHS } from "./cdp.mjs";

const PAGES = [
  ["랜딩", "/"],
  ["리더보드", "/seasons/season-1/leaderboard"],
  ["로그인", "/login"],
  ["회원가입", "/signup"],
  ["개인정보처리방침", "/privacy"],
  ["규칙", "/rules"],
  ["이용약관", "/terms"],
];

/*
  ⚠️ 글자를 담는 요소만 본다. 안에 블록 자식이 있으면 그 자식이 따로 잡히므로
  건너뛴다 — 안 그러면 같은 줄바꿈을 조상마다 다시 센다.
*/
const PROBE = `(() => {
  const BLOCK = /^(block|flex|grid|list-item|table|table-row|table-cell)$/;
  const out = [];
  const cand = document.querySelectorAll(
    "p,li,dd,dt,td,th,summary,figcaption,blockquote,h1,h2,h3,h4,label,small"
  );
  for (const el of cand) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    let hasBlockChild = false;
    for (const c of el.children) {
      const d = getComputedStyle(c).display;
      if (d !== "none" && BLOCK.test(d)) { hasBlockChild = true; break }
    }
    if (hasBlockChild) continue;

    /* 텍스트 노드를 순서대로 모아 문자열 하나와 「offset → (노드, 위치)」 지도를 만든다 */
    const nodes = [];
    const brAt = [];
    let full = "";
    const walk = (n, owner) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) {
          if (!c.nodeValue) continue;
          nodes.push({ node: c, at: full.length, len: c.nodeValue.length, owner });
          full += c.nodeValue;
        } else if (c.nodeName === "BR") {
          /* ⚠️ br은 글자를 안 보태서 앞뒤 줄이 붙어 버린다 — 가짜 절이 생긴다 */
          brAt.push(full.length);
        } else if (c.nodeType === 1 && getComputedStyle(c).display !== "none") {
          walk(c, c);
        }
      }
    };
    /* owner = 글자를 품은 가장 가까운 자손 요소. 칸 자신은 null이다 */
    walk(el, null);
    const text = full.replace(/\\s+/g, " ").trim();
    if (text.length < 12 || !/[가-힣]/.test(text)) continue;

    /*
      ⚠️ 경계에서 **다음 노드의 처음**을 고른다. 「off <= at + len」으로 고르면
      경계값이 앞 노드의 끝을 가리키고, 그게 절 사이의 공백 노드라 앞 줄에
      rect가 하나 더 생긴다 — 안 갈라진 절이 전부 갈라진 것으로 잡혔다.
    */
    const locate = (off) => {
      for (const n of nodes) {
        if (off < n.at + n.len) return [n.node, Math.max(0, off - n.at)];
      }
      const last = nodes[nodes.length - 1];
      return [last.node, last.len];
    };

    /* 콘텐츠 상자 너비 — 패딩을 뺀다 (⚠️ 함정) */
    const avail = el.clientWidth
      - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
    if (!(avail > 0)) continue;

    /*
      ⚠️ **강조 조각 안의 구두점은 절 경계가 아니다.** ClauseParts가 조각을
      쪼개지 않으므로(Clauses.tsx) 그 자리에는 붙들 상자를 만들 수 없다. 여기서
      (⚠️ 이 주석은 템플릿 문자열 안이라 역따옴표를 못 쓴다)
      세면 만들 수 없는 상자를 내놓으라는 말이 된다 — 시안 약관 제10조
      「…제공 시간과 변경, 중단」의 쉼표가 그랬다. 조각 끝과 본문 사이에서
      끊기는 것은 오히려 읽기 좋은 자리다.
    */
    const ownerAt = (off) => {
      for (const n of nodes) if (off < n.at + n.len) return n.owner;
      return null;
    };

    /* 문장 끝과 쉼표 뒤에서 자른다. 뒤에 공백이 올 때만 — 「팀명.proovit.kr」을 지킨다 */
    const bounds = [0, ...brAt];
    for (let i = 0; i < full.length - 1; i++) {
      if (!/[.?!,]/.test(full[i]) || !/\\s/.test(full[i + 1])) continue;
      const before = ownerAt(i), after = ownerAt(i + 1);
      if (before && before === after) continue;
      bounds.push(i + 1);
    }
    bounds.push(full.length);
    bounds.sort((a2, b2) => a2 - b2);
    if (bounds.length < 3) continue;

    const r = document.createRange();
    const bad = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const a = bounds[i], b = bounds[i + 1];
      const piece = full.slice(a, b).trim();
      if (!piece) continue;
      const s = locate(a + (full.slice(a, b).length - full.slice(a, b).trimStart().length));
      const e = locate(b);
      r.setStart(s[0], s[1]);
      r.setEnd(e[0], e[1]);
      const rects = [...r.getClientRects()].filter((x) => x.width > 0.5);
      if (!rects.length) continue;
      /*
        ⚠️ **top이 다르다고 다른 줄이 아니다.** 범위가 inline-block을 걸치면
        그 요소의 상자 rect가 글자 rect보다 몇 px 위에서 하나 더 나온다
        (903 vs 908). 그대로 세면 안 갈라진 절이 갈라진 것으로 잡힌다.
        줄 높이의 절반 안에 있으면 같은 줄로 본다.
      */
      const gap = (parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4) / 2;
      const tops = [];
      for (const t of rects.map((x) => x.top).sort((a2, b2) => a2 - b2)) {
        if (!tops.length || t - tops[tops.length - 1] > gap) tops.push(t);
      }
      if (tops.length < 2) continue;
      /*
        ⚠️ **갈라진 rect를 더해서 절 너비를 재면 안 된다.** 줄 끝에서 사라진
        공백만큼 모자라게 나와, 칸에 못 들어가는 절(49.4px)이 들어가는 것
        (46px)처럼 보인다. 안 접힌 상태의 너비를 따로 잰다.
      */
      const probe = document.createElement("span");
      probe.textContent = piece;
      probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;left:-9999px";
      el.appendChild(probe);
      const w = probe.getBoundingClientRect().width;
      probe.remove();
      if (w > avail) continue; /* 절이 한 줄보다 길다 — 끊을 수밖에 없다 */
      bad.push({ piece: piece.slice(0, 54), w: Math.round(w), avail: Math.round(avail) });
    }
    if (bad.length) {
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.getAttribute("class") || "").split(" ")[0],
        text: text.slice(0, 60),
        bad,
      });
    }
  }
  return out;
})()`;

let total = 0;
for (const w of WIDTHS) {
  console.log(`\n\n████ 폭 ${w}`);
  for (const [name, path] of PAGES) {
    const res = await withPage(async (p) => {
      await p.resize(w, 1200);
      await p.goto(IMPL_URL + path);
      /* 스크롤 리빌이 붙기 전에는 요소가 안 그려진다 */
      await p.eval(
        `(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)) } scrollTo(0, 0); return 1 })()`,
        true,
      );
      await p.settle();
      return p.eval(PROBE);
    });
    const n = res.reduce((s, r) => s + r.bad.length, 0);
    total += n;
    console.log(`  ${name}: ${n ? `✗ ${n}건` : "잘린 절 없음 ✓"}`);
    for (const r of res) {
      console.log(`    · <${r.tag}${r.cls ? ` class="${r.cls}"` : ""}> ${r.text}`);
      for (const b of r.bad) console.log(`        ✗ 「${b.piece}」  절 ${b.w}px / 칸 ${b.avail}px`);
    }
  }
}
console.log(`\n═══════════════════════════\n세 폭 합계 ${total}건`);
