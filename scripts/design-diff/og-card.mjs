/*
  OG 공유 카드를 굳힌다. `og-card.html`을 헤드리스 Chrome으로 열어
  1200×630 그대로 떠서 `src/app/opengraph-image.png`으로 쓴다.

    node scripts/design-diff/og-card.mjs

  헤드리스 Chrome이 9222에 떠 있어야 한다(cdp.mjs 오류 메시지에 명령이 있다).
  개발 서버는 필요 없다 — file://만 연다.

  ═══ 왜 ImageResponse(next/og)를 안 쓰나 ═══

  satori(그 밑에 있는 렌더러)는 woff2를 못 읽는다. 우리가 쓰는 Pretendard는
  동적 서브셋이라 **전부 woff2**이고, 남은 것은 1.5MB짜리 OTF뿐이라 그대로는
  함수 번들에 실을 수 없다. 서브셋을 따로 떠야 하는데, 그 값은 카드에 **가변
  텍스트**가 들어갈 때 치르는 것이 맞다. 지금 카드는 글자가 고정이다.

  브라우저로 뜨면 덤이 하나 더 있다 — 시안이 쓰는 CSS(radial-gradient 겹침,
  mask-image)를 그대로 쓸 수 있다. satori는 그 둘 다 지원이 부분적이다.

  ⚠️ 결과 PNG는 **커밋한다.** 빌드 때 다시 그리지 않는다 — CI에 Chrome이
  없고, 폰트를 네트워크로 받는 빌드는 막힌 CI에서 통째로 실패한다
  (layout.tsx가 next/font/google을 안 쓰는 것과 같은 이유).
*/
import { statSync } from "node:fs";
import { join, relative } from "node:path";

import { REPO, withPage } from "./cdp.mjs";

const SRC = join(REPO, "scripts/design-diff/og-card.html");
const OUT = join(REPO, "src/app/opengraph-image.png");

/* OG 카드의 표준 크기. 이 비율이라야 X·슬랙·카톡이 큰 카드로 그린다 */
const W = 1200;
const H = 630;

await withPage(async (p) => {
  /* goto → resize 순서다(globals.mjs와 같다). resize가 innerWidth로 검증한다 */
  await p.goto("file://" + encodeURI(SRC));
  await p.resize(W, H);

  /* 폰트가 붙기 전에 뜨면 자폭이 다른 대체 글꼴로 굳는다 */
  const font = await p.eval(
    `document.fonts.check('800 88px "Pretendard Variable"')`,
  );
  if (!font) throw new Error("Pretendard가 안 붙었다 — node_modules 경로를 확인한다");

  /* 카드가 뷰포트와 정확히 같아야 한다. 어긋나면 여백이 잘리거나 남는다 */
  const size = await p.eval(
    `[document.body.offsetWidth, document.body.offsetHeight].join("x")`,
  );
  if (size !== `${W}x${H}`) throw new Error(`카드가 ${W}x${H}가 아니라 ${size}다`);

  await p.shot(OUT);
});

const bytes = statSync(OUT).size;
console.log(`${relative(REPO, OUT)} — ${W}×${H}, ${(bytes / 1024).toFixed(0)}KB`);
