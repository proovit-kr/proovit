import type { Metadata } from "next";

import {
  DocArticle,
  DocBlocks,
  DocPage,
  DocTable,
  Em,
  type DocSection,
} from "@/components/DocPage";
import { Clauses } from "@/components/Clauses";
import { SEASON_RULES } from "@/content/rules";

/*
  시즌 운영 규칙 게재 페이지 — 시안 `#scr-rules`.

  ⚠️ **참가 신청의 필수 동의가 「이용약관 및 시즌 운영규칙 동의」다.** 동의할 대상이
  화면에 없으면 그 동의가 성립하지 않는다. 규칙 제3조 ①도 "웹사이트 게시로 효력을
  가짐"이라고 정하므로, 이 페이지가 곧 효력 발생 지점이다.

  본문의 정본은 팀장 문서이고 여기 있는 것은 사본이다(content/rules.ts 주석).
  개발이 문구를 고치지 않는다 — 고칠 일이 있으면 원본을 고치고 다시 옮긴다.

  ⚠️ **시안은 규칙을 여섯 꼭지로 줄여 그린다**(참가 자격·일정과 게이트·심사 기준·
  지표 검증·실격 기준·소명). `/privacy`와 같은 사정이다 — 시안이 주는 것은
  **레이아웃**이고, 조의 목록과 본문은 `content/rules.ts`가 정본이다. 그래서 여기는
  8장 28조와 별표 다섯을 그대로 싣고, 껍데기만 `DocPage`(시안 `.ru-wrap`)를 쓴다.
*/

export const metadata: Metadata = {
  title: "시즌 운영 규칙",
  description:
    "PROOVIT 시즌의 참가 자격, 제출, 지표 검증, 심사, 시상, 지식재산권과 제재를 정한 규칙입니다.",
  /* 참가 전에 읽고 판단하는 문서라 검색에 잡혀야 한다 */
  robots: { index: true, follow: true },
  alternates: { canonical: "/rules" },
};

/*
  칩에 찍을 시행일. 정본 표기는 「2026. 08. 31.」이고 `content/rules.ts`는 그것을
  그대로 들고 있다(원본 표기를 고치지 않는다). 칩에서만 구분자를 바꾼다 —
  시안이 「시행 2026-08-31」이고 `/privacy`의 칩도 그 모양이라, 푸터에서 나란히
  열리는 두 문서가 서로 다른 날짜 표기를 쓰게 두지 않는다. 날짜 값은 그대로다.
*/
function isoDate(text: string) {
  return text.replaceAll(". ", "-").replace(/\.$/, "");
}

export default function Page() {
  const rules = SEASON_RULES;

  const sections: DocSection[] = [
    /*
      정본 머리의 흐름도. 28조를 읽기 전에 시즌이 어떻게 굴러가는지 한 번
      보여 준다 — `/privacy`의 요약 표가 같은 자리에 있다.
    */
    {
      id: "ru-0",
      num: "요약",
      title: "시즌 구조 한눈에 보기",
      tocLabel: "요약",
      body: (
        <>
          <p>
            <Clauses text={rules.overview.note} />
          </p>
          <ol>
            {rules.overview.flow.map((step) => (
              <li key={step}>
                <Clauses text={step} />
              </li>
            ))}
          </ol>
          <DocTable
            head={rules.overview.gates.head}
            rows={rules.overview.gates.rows}
            note={rules.overview.gates.note}
          />
        </>
      ),
    },

    /* 앵커는 장 단위다(시안의 약관 화면도 `tm-1 … tm-7`로 장을 가리킨다) */
    ...rules.chapters.map((chapter) => ({
      id: `ru-${chapter.no}`,
      num: `${chapter.no}장`,
      title: chapter.title,
      tocLabel: `제${chapter.no}장 ${chapter.title}`,
      body: (
        <>
          {chapter.articles.map((article) => (
            <DocArticle key={article.no} id={`article-${article.no}`}>
              <DocBlocks
                blocks={article.blocks}
                lead={
                  <Em>
                    제{article.no}조 {article.title}
                  </Em>
                }
              />
            </DocArticle>
          ))}
        </>
      ),
    })),

    /*
      별표. 앵커 이름을 `appendix-N`으로 두는 것은 푸터의 「유효 이용자 기준」이
      별표 1을 직접 가리키기 때문이다(`Footer.tsx`).
    */
    ...rules.appendices.map((appendix) => ({
      id: `appendix-${appendix.no}`,
      num: `별표 ${appendix.no}`,
      title: appendix.title,
      tocLabel: `별표 ${appendix.no}. ${appendix.title}`,
      body: (
        <>
          {appendix.paragraphs.map((text) => (
            <p key={text}>
              <Clauses text={text} />
            </p>
          ))}
          {appendix.table ? (
            <DocTable
              head={appendix.table.head}
              rows={appendix.table.rows}
              note={appendix.table.note}
            />
          ) : null}
        </>
      ),
    })),
  ];

  return (
    <DocPage
      title="시즌 운영규칙"
      /*
        ⚠️ 시안(1903줄)의 버전 칩 `v1.1`은 옮기지 않았다 — `/privacy`와 같은
        판단이다(2026-09-07 수연 지시). v1.1은 노션 정본의 판번호이고, 게시본은
        2026-08-31 시행이 처음이라 대외 화면에 붙으면 개정이 있었던 것처럼 읽힌다.

        시행일이 비어 있던 동안 화면이 그 사실을 밝히던 자리도 그대로 살렸다 —
        날짜를 지어내지 않는다.
      */
      chips={[
        rules.effectiveDate
          ? `시행 ${isoDate(rules.effectiveDate)}`
          : "시행일 시즌1 개시 공고와 함께 확정",
      ]}
      /* 시안 1904줄. 제3조 ③이 근거다 — 시즌 개시 후 기준을 바꾸지 않는다 */
      badge="시즌 중 개정 없음"
      badgeTone="lime"
      intro={
        <p>
          <Clauses text={rules.preamble} />
        </p>
      }
      sections={sections}
    />
  );
}
