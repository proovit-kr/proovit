import type { ReactNode } from "react";

import { Badge, type BadgeTone } from "@/components/Badge";
import { ClauseFit } from "@/components/ClauseFit";
import { Clauses } from "@/components/Clauses";
import { Footer } from "@/components/Footer";
import { NavBar } from "@/components/NavBar";
import { Chip } from "@/components/Surface";
import type { PolicyBlock } from "@/content/privacy";
import { getCurrentSeason, publicHeaderSeason } from "@/lib/season";

import styles from "./DocPage.module.css";

/*
  법령 문서 화면의 껍데기 — 시안 `#scr-rules` / `#scr-terms` / `#scr-privacy`.

  시안이 그리는 순서: 헤더 → 목차(왼쪽) → 제목 → 버전 칩 → 조 → 푸터.
  목차와 본문이 `.ru-wrap`의 2열 그리드이고, ≤1024에서 목차가 위로 올라가
  가로로 눕는다.

  ⚠️ 시안의 목차는 `<a data-scroll="pv-1">`로 href가 없다. 뷰어가 자기 스크롤
  상자를 직접 굴려야 해서 그렇다. 제품에는 그 상자가 없으므로 진짜 앵커
  링크(`#pv-1`)를 쓴다 — `.doc h3`의 `scroll-margin-top:80px`이 바로 그
  경우를 위한 값이라, 시안도 앵커 이동을 전제하고 있다.
*/

/*
  본문에서 한 단계 밝히는 조각 — 조문 이름이 이 자리다. 시안 `.ru .em`.

  ⚠️ **`className="em"`이라고 쓰면 안 붙는다.** `.em`은 이 모듈 안에 있어서
  해시된 이름으로 나가고, 맨 이름 `em`은 전역에 없다(`globals.css`에도 없다).
  글자색만 조용히 본문값으로 남아 어느 대조에도 안 걸린다.
*/
export function Em({ children }: { children: ReactNode }) {
  return <span className={styles.em}>{children}</span>;
}

/** 정본의 블록 배열을 그대로 그린다. `/privacy`와 `/rules`가 같은 모양을 쓴다 */
export function DocBlocks({
  blocks,
  lead,
}: {
  blocks: PolicyBlock[];
  /** 첫 단락 앞에 붙는 조각. 첫 블록이 단락이 아니면 혼자 한 줄을 쓴다 */
  lead?: ReactNode;
}) {
  const leadInline = lead && blocks[0]?.kind === "para";

  return (
    <>
      {lead && !leadInline ? <p>{lead}</p> : null}
      {blocks.map((b, i) => {
        if (b.kind === "para")
          return (
            <p key={i}>
              {leadInline && i === 0 ? <>{lead} </> : null}
              <Clauses text={b.text} />
            </p>
          );
        if (b.kind === "list") {
          const items = b.items.map((t, j) => (
            <li key={j}>
              <Clauses text={t} />
            </li>
          ));
          return b.ordered ? (
            <ol key={i}>{items}</ol>
          ) : (
            <ul key={i}>{items}</ul>
          );
        }
        return (
          <DocTable
            key={i}
            head={b.table.head}
            rows={b.table.rows}
            note={b.table.note}
          />
        );
      })}
    </>
  );
}

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
  badgeTone = "gray",
  intro,
  sections,
}: {
  title: string;
  /** 버전·시행일 같은 것. 시안 `.ru-ver`의 `.chip` */
  chips: string[];
  /** 칩 옆에 붙는 한 줄. 시안은 약관·방침에 `.bd-gray`, 규칙에 `.bd-lime`을 쓴다 */
  badge?: string;
  badgeTone?: BadgeTone;
  /* 조 앞에 오는 머리말. 정본이 요약 표보다 앞에 둔다 */
  intro?: ReactNode;
  sections: DocSection[];
}) {
  const season = await getCurrentSeason();

  return (
    <main className="page">
      <NavBar season={publicHeaderSeason(season)}
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
            {badge ? <Badge tone={badgeTone}>{badge}</Badge> : null}
          </div>
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
