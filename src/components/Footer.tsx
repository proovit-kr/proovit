import Link from "next/link";

import styles from "./Footer.module.css";

/*
  공개 푸터.

  ⚠️ **내용은 시안이 아니라 노션 정본을 따른다** (2026-08-30 팀장 지시).
  노션 「🚀 랜딩 게시용 최종본 (2026-08-31) › 사전신청 폼 문안·푸터」의
  「5. 푸터 표기」가 정본이다.

      PROOVIT | 운영자: 이윤서 | 문의: help@proovit.kr
      개인정보처리방침
      © 2026 PROOVIT

  시안 ver3의 푸터(시즌 규칙·유효 이용자 기준·이용약관·스폰서 문의 + SNS)는
  시즌이 실제로 도는 제품의 것이고, 지금 여는 것은 사전신청 랜딩이다.
  그 판정을 팀장이 내렸다.

  같은 문서가 이유도 적어 두었다.
    - 개인정보처리방침은 「본문과 구분되는 방법(굵게 또는 별도 링크)으로
      첫 화면 하단에 지속 게재」한다 — 그래서 한 줄을 따로 쓰고 굵게 둔다.
    - 상호·사업자등록번호·주소·전화는 **적지 않는다.** 판매 개시 전이라
      신원표시 의무가 발동하지 않았다. 사업자등록이 끝나면 일괄 추가한다.

  ⚠️ **모양은 여전히 시안 `.pub-foot`이다.** 노션이 정한 것은 무엇을 적을지고,
  글자 크기·색·여백·경계선은 시안이 정본이다. 세 줄이라 방향만 세로로 둔다.
*/

const OPERATOR = "이윤서";
const CONTACT = "help@proovit.kr";

export function Footer() {
  return (
    <footer className={styles.foot}>
      <span className={styles.line}>
        <span className={styles.wm}>
          PROO<em className={styles.wmCheck}>✓</em>IT
        </span>
        <span className={styles.sep} aria-hidden="true">
          |
        </span>
        <span>운영자: {OPERATOR}</span>
        <span className={styles.sep} aria-hidden="true">
          |
        </span>
        <span>
          문의: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
        </span>
      </span>

      {/* 법이 요구하는 연결화면. 본문과 구분되게 굵게 둔다 */}
      <Link href="/privacy" className={styles.privacy}>
        개인정보처리방침
      </Link>

      <span className={styles.copy}>© 2026 PROOVIT</span>
    </footer>
  );
}
