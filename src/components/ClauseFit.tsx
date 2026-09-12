"use client";

import { useEffect } from "react";

import styles from "./Clauses.module.css";

/*
  왜 필요한지는 `Clauses.tsx`에 적혀 있다. **화면마다 한 번만** 그린다.

  ⚠️ 여기만 클라이언트다. `Clauses` 자체는 서버에서 그린다 — 문단마다
  클라이언트 경계를 만들면 처리방침 한 장이 통째로 번들에 실린다.
*/

/**
 * ⚠️ 읽기와 쓰기를 섞지 않는다. 절이 400개가 넘는 화면(처리방침)이 있어서,
 * 하나 재고 하나 고치면 그때마다 레이아웃을 다시 계산한다. 전부 펴고 → 전부
 * 재고 → 전부 고친다.
 */
export function ClauseFit() {
  useEffect(() => {
    const run = () => {
      const spans = document.querySelectorAll<HTMLElement>(`.${styles.c}`);
      if (!spans.length) return;

      /* ① 판정을 지우고 한 줄로 편다 — 접힌 채로 재면 제 너비가 안 나온다 */
      for (const s of spans) s.classList.remove(styles.flow);
      document.documentElement.classList.add(styles.measuring);

      /* ② 읽기만 한다 */
      const tooWide: boolean[] = [];
      spans.forEach((s, i) => {
        const box = s.parentElement;
        if (!box) return;
        const cs = getComputedStyle(box);
        const avail =
          box.clientWidth -
          parseFloat(cs.paddingLeft || "0") -
          parseFloat(cs.paddingRight || "0");
        /* 0.5px은 소수점 반올림 여유다 — 딱 맞는 절이 넘친 것으로 잡힌다 */
        tooWide[i] = s.getBoundingClientRect().width > avail + 0.5;
      });

      /* ③ 쓰기만 한다 */
      document.documentElement.classList.remove(styles.measuring);
      spans.forEach((s, i) => {
        if (tooWide[i]) s.classList.add(styles.flow);
      });
    };

    let timer = 0;
    const later = () => {
      clearTimeout(timer);
      timer = window.setTimeout(run, 120);
    };

    run();
    /* 웹폰트가 붙기 전에 재면 자폭이 달라 판정이 뒤집힌다 */
    document.fonts?.ready.then(run);
    window.addEventListener("resize", later);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", later);
    };
  }, []);

  return null;
}
