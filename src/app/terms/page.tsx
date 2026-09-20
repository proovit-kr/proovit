import { Fragment } from "react";
import type { Metadata } from "next";

import { ClauseParts, Clauses } from "@/components/Clauses";
import { DocPage, DocRowTable, Em, type DocSection } from "@/components/DocPage";
import { TERMS } from "@/content/terms";
import type { RuleLine } from "@/content/rules";
import { notFound } from "next/navigation";

/*
  이용약관 — 시안 `#scr-terms`.

  ⚠️ **여기는 요약 게시본이고 시안이 문안의 정본이다**(2026-09-21 수연 결정).
  규칙 화면과 같고, 「구조만 표시」인 방침과 다르다 — 어긋나는 시안 메모까지
  `content/terms.ts` 머리에 적어 두었다.

  ⚠️ **회원가입의 필수 동의가 이 문서를 가리킨다.** 동의할 대상이 화면에
  없으면 그 동의가 성립하지 않고, 정본 제3조 ①도 서비스 초기화면 또는
  연결화면 게시를 요구한다.
*/

export const metadata: Metadata = {
  title: "이용약관",
  description:
    "PROOVIT 서비스 이용 조건과 이용자·운영자의 권리와 의무를 정한 약관입니다.",
  alternates: { canonical: "/terms" },
};

/* 한 줄. 절은 `.em` 조각을 건너뛰어 묶인다 — 이유는 `Clauses.tsx`에 있다 */
function Line({ line }: { line: RuleLine }) {
  return (
    <ClauseParts
      parts={line.map((seg) =>
        typeof seg === "string"
          ? seg
          : { text: seg.em, node: <Em>{seg.em}</Em> },
      )}
    />
  );
}

export default async function Page() {
  if (!TERMS) notFound();
  const terms = TERMS;

  /* 약관은 장으로 묶인다. 시안의 앵커도 조가 아니라 장 단위다(tm-1 … tm-7) */
  const sections: DocSection[] = terms.chapters.map((c) => ({
    id: `tm-${c.no}`,
    num: c.label,
    title: c.title,
    tocLabel: `제${c.no}장 ${c.title}`,
    /* 시안은 한 장의 조를 `<br>`로 이어 한 단락에 넣는다 */
    body: (
      <p>
        {c.lines.map((line, i) => (
          <Fragment key={i}>
            {i > 0 ? <br /> : null}
            <Line line={line} />
          </Fragment>
        ))}
      </p>
    ),
  }));

  /* 부칙. 시안은 마지막 꼭지를 `tm-7`로 두고 `.n`에 「부칙」을 적는다 */
  sections.push({
    id: `tm-${terms.chapters.length + 1}`,
    num: "부칙",
    title: "운영자 정보",
    tocLabel: "운영자 정보",
    body: (
      <>
        <DocRowTable rows={terms.operatorInfo.rows} />
        <p>
          <Clauses text={terms.addendum} />
        </p>
      </>
    ),
  });

  return (
    <DocPage
      title="PROOVIT 이용약관"
      chips={[terms.version, `시행 ${terms.effectiveDate}`]}
      badge={terms.badge}
      sections={sections}
    />
  );
}
