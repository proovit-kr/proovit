import Link from "next/link";

import { toHeaderSeason } from "@/lib/header-state";
import { getCurrentSeason } from "@/lib/season";

import styles from "./Footer.module.css";

/*
  공개 푸터. **시즌 상태에 따라 둘 중 하나다**(2026-09-19 수연 지시).

    모집 전      사전 신청 푸터 — 노션 정본(아래 PreFooter)
    모집 중부터  시안 ver4 `.pub-foot` 그대로(아래 SeasonFooter)

  시즌은 여기서 직접 읽는다. 푸터를 쓰는 화면이 열 곳이 넘고 시즌을 받는
  방식이 제각각이라, 화면마다 넘기게 하면 하나씩 빠진다. `getCurrentSeason`은
  요청 안에서 한 번만 조회된다(season.ts의 `cache`).

  ⚠️ 서버 컴포넌트다. 클라이언트 컴포넌트(랜딩)는 import하지 말고 페이지에서
  `<Footer />`를 만들어 넘겨받는다.
*/
export async function Footer() {
  const season = await getCurrentSeason();
  const kind = season ? toHeaderSeason(season.phase) : "pre";
  return kind === "pre" ? <PreFooter /> : <SeasonFooter />;
}

/*
  시안 ver4 `.pub-foot` — 워드마크 · 문서 링크 다섯 · SNS 셋.

  「유효 이용자 기준」은 시안이 규칙 제4조로 보내는데, 우리 규칙서에서 그 정의는
  별표 1(지표 정의)이다.
*/
const CONTACT = "help@proovit.kr";
const INSTAGRAM = "https://www.instagram.com/proovit_kr/";

function SeasonFooter() {
  return (
    <footer className={styles.pubFoot}>
      <span className={styles.wm}>
        PROO<em className={styles.wmCheck}>✓</em>IT
      </span>
      <Link href="/rules">시즌 규칙</Link>
      <Link href="/rules#ru-4">유효 이용자 기준</Link>
      <Link href="/terms">이용약관</Link>
      <Link href="/privacy">개인정보처리방침</Link>
      <a href={`mailto:${CONTACT}`}>스폰서 문의</a>
      {/*
        계정이 없는 곳은 시안대로 링크 없는 예고로 둔다. 인스타그램은 계정이
        생겨 연결한다(2026-09-19 수연 지시).
      */}
      <span className={styles.sns}>
        <span className={styles.soon}>X</span>
        <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer">
          Instagram
        </a>
        <span className={styles.soon}>Discord</span>
      </span>
    </footer>
  );
}

/*
  사전 신청 푸터.

  ⚠️ **내용은 시안이 아니라 노션 정본을 따른다** (2026-08-30 팀장 지시).
  노션 「🚀 랜딩 게시용 최종본 (2026-08-31) › 사전신청 폼 문안·푸터」의
  「5. 푸터 표기」가 정본이다.

      PROOVIT | 운영자: 이윤서 | 문의: help@proovit.kr
      개인정보처리방침
      © 2026 PROOVIT

  같은 문서가 이유도 적어 두었다.
    - 개인정보처리방침은 「본문과 구분되는 방법(굵게 또는 별도 링크)으로
      첫 화면 하단에 지속 게재」한다 — 그래서 한 줄을 따로 쓰고 굵게 둔다.
    - 상호·사업자등록번호·주소·전화는 **적지 않는다.** 판매 개시 전이라
      신원표시 의무가 발동하지 않았다. 사업자등록이 끝나면 일괄 추가한다.

  ⚠️ **모양은 여전히 시안 `.pub-foot`이다.** 노션이 정한 것은 무엇을 적을지고,
  글자 크기·색·여백·경계선은 시안이 정본이다. 세 줄이라 방향만 세로로 둔다.
*/
const OPERATOR = "이윤서";

function PreFooter() {
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
