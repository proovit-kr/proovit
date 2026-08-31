"use client";

import { useEffect, useState } from "react";

import styles from "./DevBar.module.css";

/*
  **화면 맨 위가 지금 어떻게 잡혀 있는지 폰에서 눈으로 읽는 줄.**

  iOS 사파리에서 나는 자리는 데스크톱 Chrome이 재현하지 못하고(devices.mjs
  머리말), 폰에는 콘솔이 없다. 웹 인스펙터를 USB로 붙이면 되지만 매번 케이블을
  꽂는 대신, 개발 바에 숫자 한 줄을 실어 스크린샷 한 장으로 끝나게 한다.

  읽는 법 — 8/31 헤더 문제 기준.
    안전 ↑0    `viewport-fit=cover`가 안 걸렸다. 사파리는 cover가 아니면
               `env(safe-area-inset-*)`를 전부 0으로 준다. 즉 이 값이 0이면
               캐시된 문서를 보고 있거나 meta가 안 나갔다는 뜻이다.
    헤더 top   스크롤하는 동안 0이 아니면 헤더가 뷰포트를 놓친 것이다.
               그 값이 곧 헤더 위로 새는 띠의 높이다.
    보임 ↑     visualViewport.offsetTop. 레이아웃 뷰포트와 실제로 보이는
               화면이 세로로 어긋난 양 — 사파리가 주소창을 접는 순간 뜬다.

  ⚠️ `env()`는 JS로 직접 못 읽는다. 그래서 padding에 그 값을 받은 요소를
  하나 심어 두고 계산된 padding을 읽는다.
*/
export function ViewportProbe() {
  const [text, setText] = useState("측정 전");

  useEffect(() => {
    const probe = document.createElement("div");
    probe.style.cssText = [
      "position:fixed",
      "top:0",
      "left:0",
      "width:0",
      "height:0",
      "visibility:hidden",
      "pointer-events:none",
      "padding-top:env(safe-area-inset-top)",
      "padding-bottom:env(safe-area-inset-bottom)",
    ].join(";");
    document.body.append(probe);

    let queued = 0;
    const read = () => {
      queued = 0;
      const inset = getComputedStyle(probe);
      const head = document.querySelector("header")?.getBoundingClientRect();
      const vv = window.visualViewport;
      setText(
        [
          `안전 ↑${parseFloat(inset.paddingTop)} ↓${parseFloat(inset.paddingBottom)}`,
          head
            ? `헤더 top ${head.top.toFixed(1)} h ${Math.round(head.height)}`
            : "헤더 없음",
          vv
            ? `보임 ↑${vv.offsetTop.toFixed(1)} h ${Math.round(vv.height)}/${window.innerHeight}`
            : null,
          `sy ${Math.round(window.scrollY)}`,
        ]
          .filter(Boolean)
          .join(" · "),
      );
    };
    /* 스크롤마다 재는 줄이라 프레임당 한 번으로 묶는다 */
    const tick = () => {
      if (!queued) queued = requestAnimationFrame(read);
    };

    read();
    window.addEventListener("scroll", tick, { passive: true });
    window.addEventListener("resize", tick);
    window.visualViewport?.addEventListener("scroll", tick);
    window.visualViewport?.addEventListener("resize", tick);
    return () => {
      if (queued) cancelAnimationFrame(queued);
      window.removeEventListener("scroll", tick);
      window.removeEventListener("resize", tick);
      window.visualViewport?.removeEventListener("scroll", tick);
      window.visualViewport?.removeEventListener("resize", tick);
      probe.remove();
    };
  }, []);

  return <div className={styles.probe}>{text}</div>;
}
