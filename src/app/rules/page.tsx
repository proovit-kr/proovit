import type { Metadata } from "next";

import { Footer } from "@/components/Footer";
import { ClauseFit } from "@/components/ClauseFit";
import { Clauses } from "@/components/Clauses";
import { NavBar } from "@/components/NavBar";
import type { PolicyBlock, PolicyTable } from "@/content/privacy";
import { SEASON_RULES } from "@/content/rules";
import { getCurrentSeason, publicHeaderSeason } from "@/lib/season";

import styles from "./rules.module.css";

/*
  시즌 운영 규칙 게재 페이지.

  ⚠️ **참가 신청의 필수 동의가 「이용약관 및 시즌 운영규칙 동의」다.** 동의할 대상이
  화면에 없으면 그 동의가 성립하지 않는다. 규칙 제3조 ①도 "웹사이트 게시로 효력을
  가짐"이라고 정하므로, 이 페이지가 곧 효력 발생 지점이다.

  본문의 정본은 팀장 문서이고 여기 있는 것은 사본이다(content/rules.ts 주석).
  개발이 문구를 고치지 않는다 — 고칠 일이 있으면 원본을 고치고 다시 옮긴다.

  ⚠️ 시행일이 아직 비어 있다. 날짜를 지어내지 않고 「확정 전」이라고 밝힌다.
*/

export const metadata: Metadata = {
  title: "시즌 운영 규칙",
  description:
    "PROOVIT 시즌의 참가 자격, 제출, 지표 검증, 심사, 시상, 지식재산권과 제재를 정한 규칙입니다.",
  /* 참가 전에 읽고 판단하는 문서라 검색에 잡혀야 한다 */
  robots: { index: true, follow: true },
  alternates: { canonical: "/rules" },
};

function Table({ table }: { table: PolicyTable }) {
  return (
    /* 표가 좁은 화면에서 페이지를 밀지 않도록 자기 안에서만 가로 스크롤한다 */
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {table.head.map((cell) => (
              <th key={cell} scope="col">
                <Clauses text={cell} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
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
      {table.note ? (
        <p className={styles.tableNote}>
          <Clauses text={table.note} />
        </p>
      ) : null}
    </div>
  );
}

function Block({ block }: { block: PolicyBlock }) {
  if (block.kind === "para")
    return (
      <p className={styles.para}>
        <Clauses text={block.text} />
      </p>
    );
  if (block.kind === "table") return <Table table={block.table} />;

  const items = block.items.map((item) => (
    <li key={item}>
      <Clauses text={item} />
    </li>
  ));
  return block.ordered ? (
    <ol className={styles.clauses}>{items}</ol>
  ) : (
    <ul className={styles.bullets}>{items}</ul>
  );
}

export default async function Page() {
  const rules = SEASON_RULES;
  const season = await getCurrentSeason();

  return (
    <main className={`page ${styles.page}`}>
      <NavBar season={publicHeaderSeason(season)}
      />
      <div className={`container container--narrow grow ${styles.wrap}`}>
        <header className={styles.head}>
          <h1 className={styles.title}>시즌 운영 규칙</h1>
          <dl className={styles.meta}>
            <dt>시행일</dt>
            <dd>
              {rules.effectiveDate ?? (
                <span className={styles.pending}>
                  시즌1 개시 공고와 함께 확정
                </span>
              )}
            </dd>
          </dl>
          <p className={styles.preamble}>
            <Clauses text={rules.preamble} />
          </p>
        </header>

        <section className={styles.overview} aria-labelledby="overview">
          <h2 id="overview" className={styles.sectionTitle}>
            시즌 구조 한눈에 보기
          </h2>
          <p className={styles.para}>
            <Clauses text={rules.overview.note} />
          </p>
          <ol className={styles.flow}>
            {rules.overview.flow.map((step) => (
              <li key={step}>
                <Clauses text={step} />
              </li>
            ))}
          </ol>
          <Table table={rules.overview.gates} />
        </section>

        {/*
          목차. 28개 조라 없으면 원하는 조를 찾는 데 스크롤만 한참 걸린다.
          이의신청(제11조)·제재(제16조)는 실제로 급할 때 찾는 항목이다.
        */}
        <nav className={styles.toc} aria-label="조항 목차">
          {rules.chapters.map((chapter) => (
            <div key={chapter.no} className={styles.tocChapter}>
              <p className={styles.tocChapterTitle}>
                제{chapter.no}장 {chapter.title}
              </p>
              <ol className={styles.tocList}>
                {chapter.articles.map((article) => (
                  <li key={article.no}>
                    <a href={`#article-${article.no}`}>
                      제{article.no}조 {article.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </nav>

        {rules.chapters.map((chapter) => (
          <section key={chapter.no} className={styles.chapter}>
            <h2 className={styles.chapterTitle}>
              제{chapter.no}장 {chapter.title}
            </h2>
            {chapter.articles.map((article) => (
              <article
                key={article.no}
                id={`article-${article.no}`}
                className={styles.article}
              >
                <h3 className={styles.articleTitle}>
                  제{article.no}조 <span>{article.title}</span>
                </h3>
                {article.blocks.map((block, i) => (
                  <Block key={i} block={block} />
                ))}
              </article>
            ))}
          </section>
        ))}

        <section className={styles.chapter}>
          <h2 className={styles.chapterTitle}>별표</h2>
          {rules.appendices.map((appendix) => (
            <article
              key={appendix.no}
              id={`appendix-${appendix.no}`}
              className={styles.article}
            >
              <h3 className={styles.articleTitle}>
                별표 {appendix.no} <span>{appendix.title}</span>
              </h3>
              {appendix.paragraphs.map((text) => (
                <p key={text} className={styles.para}>
                  <Clauses text={text} />
                </p>
              ))}
              {appendix.table ? <Table table={appendix.table} /> : null}
            </article>
          ))}
        </section>
      </div>
      <Footer />
      <ClauseFit />
    </main>
  );
}
