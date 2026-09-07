import type { ReactNode } from "react";

import { Badge } from "@/components/Badge";
import { ClauseFit } from "@/components/ClauseFit";
import { Clauses } from "@/components/Clauses";
import { Footer } from "@/components/Footer";
import { NavBar } from "@/components/NavBar";
import { Chip } from "@/components/Surface";
import { getCurrentSeason, resolveNav } from "@/lib/season";

import styles from "./DocPage.module.css";

/*
  법령 문서 화면의 껍데기 — 시안 `#scr-terms` / `#scr-privacy`.

  시안이 그리는 순서: 헤더 → 목차(왼쪽) → 제목 → 버전 칩 → 안내 상자 → 조 →
  푸터. 목차와 본문이 `.ru-wrap`의 2열 그리드이고, ≤1024에서 목차가 위로
  올라가 가로로 눕는다.

  ⚠️ 시안의 목차는 `<a data-scroll="pv-1">`로 href가 없다. 뷰어가 자기 스크롤
  상자를 직접 굴려야 해서 그렇다. 제품에는 그 상자가 없으므로 진짜 앵커
  링크(`#pv-1`)를 쓴다 — `.doc h3`의 `scroll-margin-top:80px`이 바로 그
  경우를 위한 값이라, 시안도 앵커 이동을 전제하고 있다.
*/

export interface DocSection {
  /** 앵커 id. 목차 링크와 조 제목이 같은 값을 쓴다 */
  id: string;
  /** 제목 앞에 붙는 번호. 시안 `.n` — 문서에서 유일하게 라임인 자리 */
  num: string;
  title: string;
  /** 목차에 적을 짧은 이름. 없으면 제목을 그대로 쓴다 */
  tocLabel?: string;
  body: ReactNode;
}

export async function DocPage({
  title,
  chips,
  badge,
  note,
  intro,
  sections,
}: {
  title: string;
  /** 버전·시행일 같은 것. 시안 `.ru-ver`의 `.chip` */
  chips: string[];
  /** 칩 옆에 붙는 한 줄. 시안은 `.badge.bd-gray`를 쓴다 */
  badge?: string;
  note?: ReactNode;
  /* 조 앞에 오는 머리말. 정본이 요약 표보다 앞에 둔다 */
  intro?: ReactNode;
  sections: DocSection[];
}) {
  const season = await getCurrentSeason();

  return (
    <main className="page">
      <NavBar {...resolveNav(season)}
      />
      <div className={`${styles.wrap} ${styles.doc} grow`}>
        <nav className={styles.toc} aria-label="목차">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              {s.tocLabel ?? s.title}
            </a>
          ))}
        </nav>
        <div>
          <h1>{title}</h1>
          <div className={styles.ver}>
            {chips.map((c) => (
              <Chip key={c}>{c}</Chip>
            ))}
            {badge ? <Badge tone="gray">{badge}</Badge> : null}
          </div>
          {note ? (
            <p className={styles.note}>
              {typeof note === "string" ? <Clauses text={note} /> : note}
            </p>
          ) : null}
          {intro}
          {sections.map((s) => (
            <section key={s.id}>
              <h3 id={s.id}>
                <span className={styles.n}>{s.num}</span>
                {s.title}
              </h3>
              {s.body}
            </section>
          ))}
        </div>
      </div>
      <Footer />
      <ClauseFit />
    </main>
  );
}

/*
  표. 6열짜리 국외이전 표가 좁은 폭에서 넘치므로 가로로 굴리는 상자에 담는다.
  시안에는 없는 상자다 — 시안의 방침 화면이 그 표를 아예 안 그린다.
*/
export function DocTable({
  head,
  rows,
  note,
}: {
  head: string[];
  rows: string[][];
  note?: string;
}) {
  return (
    <>
      <div className={styles.scroller}>
        <table>
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h} scope="col">
                  <Clauses text={h} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>
                    <Clauses text={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note ? (
        <p>
          ※ <Clauses text={note} />
        </p>
      ) : null}
    </>
  );
}
