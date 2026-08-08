import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Footer } from "@/components/Footer";
import { Logo } from "@/components/NavBar";
import {
  PRIVACY_POLICY,
  type PolicyBlock,
  type PolicyTable,
} from "@/content/privacy";

import styles from "./privacy.module.css";

/*
  개인정보처리방침 게재 페이지.

  시행령 제31조 제2항이 "첫 화면 또는 첫 화면과의 연결화면"에 지속 게재하도록
  요구한다. 첫 화면(푸터)에서 여기로 잇는 구조가 그 "연결화면"이다.

  본문이 없으면 404를 낸다 — 자세한 이유는 content/privacy.ts 주석에 있다.
  요약하면, 빈칸이 남은 방침은 게재 안 한 것보다 나쁘다.
*/

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description:
    "PROOVIT이 개인정보를 어떤 목적으로 어떤 항목을 얼마 동안 처리하는지, 정보주체가 어떤 권리를 행사할 수 있는지 안내합니다.",
  /*
    법정 게재 문서라 검색에 잡혀야 한다. 정보주체가 서비스에 들어오지 않고도
    찾을 수 있어야 하는 종류의 문서다.
  */
  robots: { index: true, follow: true },
};

function Table({ table }: { table: PolicyTable }) {
  return (
    // 표가 좁은 화면에서 페이지 전체를 밀지 않도록 자기 안에서만 가로 스크롤한다
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {table.head.map((cell) => (
              <th key={cell} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.note ? <p className={styles.tableNote}>{table.note}</p> : null}
    </div>
  );
}

function Block({ block }: { block: PolicyBlock }) {
  if (block.kind === "para") return <p>{block.text}</p>;
  if (block.kind === "table") return <Table table={block.table} />;

  const items = block.items.map((item) => <li key={item}>{item}</li>);
  return block.ordered ? (
    <ol className={styles.list}>{items}</ol>
  ) : (
    <ul className={styles.list}>{items}</ul>
  );
}

export default function PrivacyPage() {
  const policy = PRIVACY_POLICY;
  if (!policy) notFound();

  return (
    <div className="page">
      <header className={styles.head}>
        <Logo />
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>개인정보처리방침</h1>

        <dl className={styles.meta}>
          <dt>시행일</dt>
          <dd>{policy.effectiveDate}</dd>
          <dt>버전</dt>
          <dd>{policy.version}</dd>
        </dl>

        <p className={styles.preamble}>{policy.preamble}</p>

        <section className={styles.summary} aria-labelledby="summary-heading">
          <h2 id="summary-heading">주요 개인정보 처리 표시 (요약)</h2>
          <Table table={policy.summary} />
        </section>

        {/*
          목차. 18개 조라 없으면 원하는 조를 찾는 데 스크롤만 한참 걸린다.
          권리 행사(제10조)나 연락처(제14조)는 실제로 급할 때 찾는 항목이다.
        */}
        <nav className={styles.toc} aria-label="조항 목차">
          <ol>
            {policy.articles.map((article) => (
              <li key={article.no}>
                <a href={`#article-${article.no}`}>
                  제{article.no}조 {article.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {policy.articles.map((article) => (
          <section
            key={article.no}
            id={`article-${article.no}`}
            className={styles.article}
          >
            <h2>
              제{article.no}조 ({article.title})
            </h2>
            {article.blocks.map((block, i) => (
              <Block key={i} block={block} />
            ))}
          </section>
        ))}
      </main>

      <Footer />
    </div>
  );
}
