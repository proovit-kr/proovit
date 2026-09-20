import { Fragment } from "react";
import type { Metadata } from "next";

import { ClauseParts, Clauses } from "@/components/Clauses";
import { DocPage, Em, type DocSection } from "@/components/DocPage";
import { SEASON_RULES, type RuleBlock, type RuleLine } from "@/content/rules";

/*
  시즌 운영규칙 — 시안 `#scr-rules`.

  ⚠️ **참가 신청의 필수 동의가 「이용약관 및 시즌 운영규칙 동의」다.** 동의할 대상이
  화면에 없으면 그 동의가 성립하지 않는다. 정본 제3조 ①도 "웹사이트 게시로 효력을
  가짐"이라고 정하므로, 이 페이지가 곧 효력 발생 지점이다.

  ⚠️ **여기는 요약 게시본이고 시안이 문안의 정본이다**(2026-09-21 수연 결정).
  방침·약관과 다른 점은 `content/rules.ts` 머리에 적어 두었다 — 개발이 문구를
  고치지 않는 것은 셋 다 같다.
*/

export const metadata: Metadata = {
  title: "시즌 운영규칙",
  description:
    "PROOVIT 시즌의 참가 자격, 일정과 게이트, 심사 기준, 지표 검증, 실격 기준, 소명과 이의신청을 정한 규칙입니다.",
  /* 참가 전에 읽고 판단하는 문서라 검색에 잡혀야 한다 */
  robots: { index: true, follow: true },
  alternates: { canonical: "/rules" },
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

function Blocks({ blocks }: { blocks: RuleBlock[] }) {
  return (
    <>
      {blocks.map((b, i) =>
        b.kind === "list" ? (
          <ol key={i}>
            {b.items.map((item) => (
              <li key={item}>
                <Clauses text={item} />
              </li>
            ))}
          </ol>
        ) : (
          /* 시안은 여러 줄을 `<br>`로 한 단락 안에 넣는다(3. 심사 기준) */
          <p key={i}>
            {b.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 ? <br /> : null}
                <Line line={line} />
              </Fragment>
            ))}
          </p>
        ),
      )}
    </>
  );
}

export default function Page() {
  const rules = SEASON_RULES;

  const sections: DocSection[] = rules.sections.map((s) => ({
    id: s.id,
    num: s.n,
    title: s.title,
    tocLabel: `${s.n}. ${s.title}`,
    body: <Blocks blocks={s.blocks} />,
  }));

  return (
    <DocPage
      title="시즌 운영규칙"
      chips={[rules.version, `시행 ${rules.effectiveDate}`]}
      badge={rules.badge}
      badgeTone="lime"
      sections={sections}
    />
  );
}
