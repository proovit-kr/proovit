import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocPage, DocTable, type DocSection } from "@/components/DocPage";
import { PRIVACY_POLICY, type PolicyBlock } from "@/content/privacy";

/*
  개인정보처리방침 — 시안 `#scr-privacy`.

  **법이 요구하는 화면이다.** 이메일 수집이 시작되는 순간부터 게시 의무가
  생기고(법 제30조), 시행령 제31조 제2항이 「첫 화면 또는 첫 화면과의
  연결화면」에 두라고 한다 — 그래서 푸터에 고정 링크가 있다.

  ⚠️ 시안의 방침 화면은 **조를 줄여서 보여준다**(4조를 건너뛰고 8~10과
  12~18을 묶는다). 시안 스스로 「18개 조 구조를 보여 주고, 본문은 노션
  정본에서 그대로 가져와요」라고 적어 둔 대로다. 그러니 여기서 시안이 주는
  것은 **레이아웃**이고, 조의 목록과 본문은 `content/privacy.ts`가 정본이다.

  ⚠️ 시안의 `.doc-note` 문구는 옮기지 않았다. 「이 시안은 …을 보여 주고」로
  시작하는 뷰어 주석이라 제품 화면에서 할 말이 아니다. 상자는 남기고 첫
  문장(제품에 해당하는 부분)만 쓴다.
*/

export const metadata: Metadata = {
  title: "개인정보처리방침",
};

function Blocks({ blocks }: { blocks: PolicyBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === "para") return <p key={i}>{b.text}</p>;
        if (b.kind === "list") {
          const items = b.items.map((t, j) => <li key={j}>{t}</li>);
          return b.ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>;
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

export default async function Page() {
  /*
    정본에 빈칸이 남아 있으면 게재하지 않는다. 반쯤 채운 방침은 안 하느니만
    못하다 — 특히 제7조(국외 이전) 표가 비면 법 제28조의8 제1항 제3호의
    「방침 공개로 별도 동의를 갈음」 요건이 깨져서, 방침을 올려두고도 국외
    이전의 근거가 없는 상태가 된다.
  */
  if (!PRIVACY_POLICY) notFound();
  const policy = PRIVACY_POLICY;

  const sections: DocSection[] = [
    {
      id: "pv-0",
      num: "요약",
      title: "주요 개인정보 처리 표시",
      tocLabel: "요약 표시",
      body: (
        <DocTable
          head={policy.summary.head}
          rows={policy.summary.rows}
          note={policy.summary.note}
        />
      ),
    },
    ...policy.articles.map((a) => ({
      id: `pv-${a.no}`,
      num: String(a.no),
      title: a.title,
      tocLabel: `${a.no}. ${a.short ?? a.title}`,
      body: <Blocks blocks={a.blocks} />,
    })),
  ];

  return (
    <DocPage
      title="PROOVIT 개인정보처리방침"
      chips={[policy.version, `시행 ${policy.effectiveDate}`]}
      badge="계약과 다르면 정보주체에게 유리한 쪽 적용"
      note="ℹ️ 사전 신청, 회원가입, 참가 신청의 동의 문안이 참조하는 처리방침이에요."
      intro={<p>{policy.preamble}</p>}
      sections={sections}
    />
  );
}
