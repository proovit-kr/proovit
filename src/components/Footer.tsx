import Link from "next/link";

import styles from "./Footer.module.css";

/*
  공개 푸터 — 시안 `.pub-foot`.

  ⚠️ SNS 묶음을 항상 낸다. 시안은 랜딩·리더보드에는 넣고 참가작·시즌 상세에는
  빼는데, 같은 푸터가 화면마다 다를 이유를 시안이 말하지 않는다(v0.2에서 두
  화면을 먼저 만들고 나머지를 나중에 붙이며 생긴 차이로 읽힌다).
  넷 중 둘에 있는 쪽으로 통일했다.

  ⚠️ 개인정보처리방침 링크가 없다. 시행령 제31조 제2항이 요구하는 「첫 화면과의
  연결화면」인데, `/privacy`가 시안 화면 레지스트리에 없어 함께 지웠다.
  방침 본문(content/privacy.ts)이 확정되기 전에 시안에 화면이 들어와야 한다.
*/

/* 시안의 링크 셋. 아직 갈 곳이 정해진 것은 규칙뿐이다 */
const LINKS = [
  { href: "/rules", label: "시즌 규칙" },
  { href: "/rules#valid-users", label: "유효 이용자 기준" },
  { href: "/rules#sponsor", label: "스폰서 문의" },
];

const SNS = [
  { href: "https://x.com", label: "X" },
  { href: "https://instagram.com", label: "Instagram" },
  { href: "https://discord.com", label: "Discord" },
];

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
      <span className={styles.sns}>
        {SNS.map((s) => (
          <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer">
            {s.label}
          </a>
        ))}
      </span>
    </footer>
  );
}
