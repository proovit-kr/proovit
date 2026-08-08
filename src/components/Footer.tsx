import Link from 'next/link';

import { PRIVACY_POLICY } from '@/content/privacy';

import styles from './Footer.module.css';

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.brand}>
        PROO<span className={styles.check}>✓</span>IT
      </div>
      <div className={styles.links}>
        <a href="#rules">시즌 규칙</a>
        <a href="#valid-users">유효 이용자 기준</a>
        <a href="#sponsor">스폰서 문의</a>
        {/*
          시행령 제31조 제2항이 요구하는 "첫 화면과의 연결화면" 링크.
          법정 게재 문서라 다른 링크와 구분되게 굵게 둔다(표준 처리방침 작성지침).

          본문이 없으면 /privacy가 404라서 링크도 걸지 않는다 —
          이유는 content/privacy.ts 주석 참조.
        */}
        {PRIVACY_POLICY ? (
          <Link href="/privacy" className={styles.legal}>
            개인정보처리방침
          </Link>
        ) : null}
      </div>
      <div className={styles.social}>
        <a href="#x">X</a>
        <a href="#instagram">Instagram</a>
        <a href="#discord">Discord</a>
      </div>
    </footer>
  );
}
