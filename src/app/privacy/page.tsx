import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  DocBlocks,
  DocPage,
  DocRowTable,
  DocTable,
  type DocSection,
} from "@/components/DocPage";
import { privacyPolicyFor } from "@/content/privacy";
import { getCurrentSeason, isRecruitingOrLater } from "@/lib/season";

/*
  개인정보처리방침 — 시안 `#scr-privacy`.

  **법이 요구하는 화면이다.** 이메일 수집이 시작되는 순간부터 게시 의무가
  생기고(법 제30조), 시행령 제31조 제2항이 「첫 화면 또는 첫 화면과의
  연결화면」에 두라고 한다 — 그래서 푸터에 고정 링크가 있다.

  ⚠️ **방침이 둘이고 시즌 페이즈로 갈린다**(2026-09-21 수연 결정). 사전 신청
  구간에는 전문 18조를, 모집부터는 시안의 요약 게시본을 보여준다. 고르는 것은
  `privacyPolicyFor()`이고 근거는 `content/privacy.ts` 머리 주석에 있다.

  그래서 이 화면은 **두 모양을 다 그릴 수 있어야 한다.** 전문은 머리행이 있는
  요약표에 머리말이 앞서고, 게시본은 행머리 요약표로 시작해 여러 조를 한
  꼭지로 묶는다(「8~10」, 「12~18」). 시안이 주는 것은 레이아웃이고, 조의
  목록과 본문은 두 경우 모두 `content/privacy.ts`가 정본이다.

  ⚠️ 시안의 `.doc-note` 문구는 옮기지 않았다. 「이 시안은 …을 보여 주고」로
  시작하는 뷰어 주석이라 제품 화면에서 할 말이 아니다. 상자는 남기고 첫
  문장(제품에 해당하는 부분)만 쓴다.
*/

export const metadata: Metadata = {
  title: "개인정보처리방침",
  /* 없으면 루트의 리그 소개 문구가 그대로 붙는다 — 검색 결과에 그게 나온다 */
  description:
    "PROOVIT이 수집하는 개인정보의 항목과 이용 목적, 보관 기간, 제3자 제공과 이용자의 권리를 안내합니다.",
  alternates: { canonical: "/privacy" },
};

export default async function Page() {
  /*
    정본에 빈칸이 남아 있으면 게재하지 않는다. 반쯤 채운 방침은 안 하느니만
    못하다 — 특히 제7조(국외 이전) 표가 비면 법 제28조의8 제1항 제3호의
    「방침 공개로 별도 동의를 갈음」 요건이 깨져서, 방침을 올려두고도 국외
    이전의 근거가 없는 상태가 된다.
  */
  /*
    `getCurrentSeason()`은 `cache()`로 싸여 있어 `DocPage`가 부르는 것과 같은
    조회를 나눠 쓴다 — 이 줄이 쿼리를 하나 더 만들지 않는다.
  */
  const season = await getCurrentSeason();
  const policy = privacyPolicyFor(
    season ? isRecruitingOrLater(season.phase) : false,
  );
  if (!policy) notFound();

  const summary = policy.summary;

  const sections: DocSection[] = [
    {
      id: "pv-0",
      num: "요약",
      /*
        ⚠️ 시안 게시본은 이 자리를 「주요 개인정보 처리 **표시**」, 목차를
        「요약 표시」로 적는다. **전문과 같은 말을 쓴다**(2026-09-21 수연 지시) —
        같은 방침의 두 모양이라 꼭지 이름이 갈릴 이유가 없다.
      */
      title: "주요 개인정보 처리 항목",
      tocLabel: "요약",
      body:
        summary.kind === "table" ? (
          <DocTable
            head={summary.head}
            rows={summary.rows}
            note={summary.note}
          />
        ) : (
          <DocRowTable rows={summary.rows} />
        ),
    },
    ...policy.articles.map((a) => ({
      id: `pv-${a.no}`,
      /* 묶음 꼭지는 머리 글자만 범위를 보인다 — 앵커와 목차는 대표 번호다 */
      num: a.label ?? String(a.no),
      title: a.title,
      tocLabel: `${a.no}. ${a.short ?? a.title}`,
      body: <DocBlocks blocks={a.blocks} />,
    })),
  ];

  return (
    <DocPage
      title="PROOVIT 개인정보처리방침"
      /*
        ⚠️ 시안(1870줄)의 버전 칩과 배지를 **둘 다 일부러 뺐다**(칩은 2026-09-07,
        배지는 09-21 수연 지시). `doc.mjs` 대조에 두 건이 남는 것은 이 결정
        때문이지 이식 누락이 아니다 — 약관·규칙 화면과 같아졌다.

        버전 칩 v3.1은 노션 정본 문서의 판번호다. 게시본 제18조는 시행일을
        「최초 제정」과 같은 날로 말하므로, 대외 화면에 판번호가 붙으면 개정이
        여러 번 있었던 것처럼 읽힌다. 값은 `privacy.ts`의 `version`에 그대로
        두어 어느 정본을 옮겼는지는 코드에 남긴다.
      */
      chips={[`시행 ${policy.effectiveDate}`]}
      intro={policy.preamble ? <p>{policy.preamble}</p> : undefined}
      sections={sections}
    />
  );
}
