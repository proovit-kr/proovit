import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Clauses } from "@/components/Clauses";
import {
  DocBlocks,
  DocPage,
  DocRowTable,
  Em,
  type DocSection,
} from "@/components/DocPage";
import { TERMS } from "@/content/terms";

/*
  이용약관 — 시안 `#scr-terms`.

  ⚠️ **시안이 주는 것은 레이아웃이고 문안의 정본은 `content/terms.ts`다.**
  시안 스스로 「장과 조 구조만 시안에 표시, 본문은 노션 정본(이용약관 v1.1)에서
  그대로 가져옴」이라고 적어 두었다 — 방침과 같고, 시안이 문안까지 들고 있는
  규칙 화면과 다르다.

  ⚠️ 정본이 아직 없으면 열지 않는다. 동의만 받아 두고 동의 대상이 없는 화면은
  안 하느니만 못하다 — 회원가입의 필수 동의가 이 문서를 가리킨다.
*/

export const metadata: Metadata = {
  title: "이용약관",
  description:
    "PROOVIT 서비스 이용 조건과 이용자·운영자의 권리와 의무를 정한 약관입니다.",
  alternates: { canonical: "/terms" },
};

export default async function Page() {
  if (!TERMS) notFound();
  const terms = TERMS;

  /* 약관은 장으로 묶인다. 시안의 앵커도 조가 아니라 장 단위다(tm-1 … tm-7) */
  const sections: DocSection[] = terms.chapters.map((c) => ({
    id: `tm-${c.no}`,
    num: c.label,
    title: c.title,
    tocLabel: `제${c.no}장 ${c.title}`,
    body: (
      <>
        {c.articles.map((a) => (
          <DocBlocks
            key={a.no}
            blocks={a.blocks}
            lead={
              <Em>
                제{a.no}조 {a.title}
              </Em>
            }
          />
        ))}
      </>
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
      badge="시즌 참가는 시즌 운영규칙이 우선"
      sections={sections}
    />
  );
}
