import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocPage, type DocSection } from "@/components/DocPage";
import { TERMS } from "@/content/terms";

/*
  이용약관 — 시안 `#scr-terms`.

  ⚠️ **아직 열리지 않는다.** `content/terms.ts`가 `null`이고, 그 이유가 그
  파일에 적혀 있다 — 팀장의 게시 계획이 이 문서를 「가입 오픈 시점에 게시」로
  두었고 게시용 클린본도 아직 없다.

  화면은 미리 만들어 둔다. 값이 들어오는 순간 여기서 열리고, 푸터 링크도
  함께 살아난다(Footer.tsx가 같은 값을 본다).
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
          <p key={a.no}>
            <span className="em">
              제{a.no}조 {a.title}
            </span>{" "}
            {a.blocks
              .map((b) => (b.kind === "para" ? b.text : ""))
              .filter(Boolean)
              .join(" ")}
          </p>
        ))}
      </>
    ),
  }));

  return (
    <DocPage
      title="PROOVIT 이용약관"
      chips={[terms.version, `시행 ${terms.effectiveDate}`]}
      badge="시즌 참가는 시즌 운영규칙이 우선"
      note="ℹ️ 서비스 초기화면과 연결화면에 게시하는 약관 전문이에요."
      sections={sections}
    />
  );
}
