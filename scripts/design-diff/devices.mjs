/*
  **흔한 폰·태블릿 폭에서 헤더와 가로 스크롤을 확인한다.**

  대조 프로브는 1440/768/390 세 폭만 본다. 그 사이의 기기에서만 나는 문제를
  잡으려고 따로 둔다 — 좁은 폭에서 sticky 헤더가 떨어지거나, 리빌이 시작
  위치로 밀어 둔 카드가 뷰포트를 넘겨 옆으로 밀리는 것 같은 것.

    node scripts/design-diff/devices.mjs

  ⚠️ **여기서 통과해도 iOS Safari에서 나는 문제는 못 잡는다.** Chrome의 기기
  흉내는 폭과 터치만 바꿀 뿐이고, iOS의 주소창 접힘·모멘텀 스크롤 합성은
  재현하지 않는다. 그건 실제 기기로만 확인된다.
*/
import { withPage, IMPL_URL } from "./cdp.mjs";
/* 흔한 폰 폭. 세로 기준 CSS 픽셀 */
const DEVICES = [
  ["iPhone SE 3", 375, 667], ["iPhone 13 mini", 375, 812],
  ["iPhone 15 / 14", 390, 844], ["iPhone 15 Pro", 393, 852],
  ["iPhone 15 Plus/Pro Max", 430, 932], ["Galaxy S24", 360, 780],
  ["Galaxy S24 Ultra", 384, 824], ["Pixel 8", 412, 915],
  ["iPad mini 세로", 744, 1133],
];
const Q = `(() => {
  const h = document.querySelector("header");
  const r = h.getBoundingClientRect();
  const de = document.documentElement;
  return { top: Math.round(r.top), h: Math.round(r.height),
    가로스크롤: de.scrollWidth > innerWidth + 1,
    문서폭: de.scrollWidth, 뷰포트: innerWidth };
})()`;
for (const [name, w, h] of DEVICES) {
  await withPage(async p => {
    await p.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 3, mobile: true });
    await p.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await p.goto(IMPL_URL + "/");
    await new Promise(r => setTimeout(r, 900));
    const a = await p.eval(Q);
    await p.eval(`window.scrollTo(0, 700); 1`);
    await new Promise(r => setTimeout(r, 400));
    const b = await p.eval(Q);
    const ok = a.top === 0 && b.top === 0 && !b.가로스크롤;
    console.log(`${ok ? "✓" : "✗"} ${name.padEnd(24)} ${w}×${h}  헤더top ${a.top}→${b.top}  가로스크롤 ${b.가로스크롤 ? `있음(${b.문서폭}>${b.뷰포트})` : "없음"}`);
  });
}
