import Link from "next/link";

import { TERMS } from "@/content/terms";

import styles from "./Footer.module.css";

/*
  공개 푸터 — 시안 `.pub-foot`.

  ver3부터 시안의 푸터는 스크립트가 그린다(`<footer data-foot>` + 3589행).
  값은 그 스크립트가 심는 마크업에서 옮겼다.

  ⚠️ SNS 묶음을 항상 낸다. 시안은 랜딩·리더보드에는 넣고 참가작·시즌 상세에는
  빼는데, 같은 푸터가 화면마다 다를 이유를 시안이 말하지 않는다(v0.2에서 두
  화면을 먼저 만들고 나머지를 나중에 붙이며 생긴 차이로 읽힌다).
  ver3에서 푸터가 스크립트 하나로 통일되면서 이 차이 자체가 사라졌다.

  개인정보처리방침 링크는 ver3에서 답이 왔다. 시행령 제31조 제2항이 요구하는
  「첫 화면과의 연결화면」인데 ver2 레지스트리에 `/privacy`가 없어 함께 지웠던
  자리다. ver3가 `scr-terms`·`scr-privacy` 두 화면을 넣으면서 링크도 들어왔다.
*/

/*
  ⚠️ **아직 게시하지 않기로 한 문서는 링크하지 않는다.** 시안에는 넷이
  있지만 지금 내보내는 것은 개인정보처리방침 하나다.

  팀장의 게시 판정표(노션 「🚀 랜딩 게시용 최종본 (2026-08-31)」)가 이렇게
  갈랐다.

    개인정보처리방침  게시 — 이메일 수집 시작 즉시 의무(법 제30조)
    이용약관          미게시 — 회원가입이 없어 이용계약 불성립
    시즌 운영 규칙    미게시 — 모집 오픈 시점에 약관과 함께

  「유효 이용자 기준」도 함께 뺀다. 시즌 규칙 문서 안의 한 조항이라 같은
  `/rules`로 가는데, 그 문서가 미게시이므로 링크만 남길 이유가 없다.

  값이 들어오면 링크가 저절로 살아난다 — 약관은 `content/terms.ts`가,
  규칙은 §9에서 같은 방식으로 붙는다.
*/
const LINKS = [
  ...(TERMS ? [{ href: "/terms", label: "이용약관" }] : []),
  { href: "/privacy", label: "개인정보처리방침" },
];

/*
  시안이 `mailto:`로 두는 유일한 링크다. ver2에서는 `href="#"`라 갈 곳이
  없어 규칙 화면의 앵커를 지어냈었는데, ver3가 주소를 줬다.
*/
const SPONSOR_MAIL = "mailto:help@proovit.kr";

/*
  아직 계정이 없는 채널들. ver3는 `<a>`가 아니라 `<span class="soon">`으로
  두고 CSS가 「준비 중」 칩을 붙인다 — 누를 수 없다는 것을 모양으로 말한다.
  ver2에서는 `href="#"`여서 x.com 같은 주소를 지어냈었다. 우리 계정이 아닌
  곳으로 보내던 것이라 함께 지운다.
*/
const SNS = ["X", "Instagram", "Discord"];

export function Footer() {
  return (
    <footer className={styles.foot}>
      <span className={styles.wm}>
        PROO<em className={styles.wmCheck}>✓</em>IT
      </span>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href}>
          {l.label}
        </Link>
      ))}
      <a href={SPONSOR_MAIL}>스폰서 문의</a>
      <span className={styles.sns}>
        {SNS.map((name) => (
          <span key={name} className={styles.soon}>
            {name}
          </span>
        ))}
      </span>
    </footer>
  );
}
