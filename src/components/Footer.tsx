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
          ⚠️ 개인정보처리방침 링크가 빠져 있다. 시행령 제31조 제2항이 요구하는
          "첫 화면과의 연결화면"인데, `/privacy` 라우트가 시안 v2.1 화면
          레지스트리에 없어 함께 지웠다. 방침 본문(content/privacy.ts)은
          아직 null이라 지금 당장 게재 의무가 걸리지는 않지만,
          **본문이 확정되기 전에 시안에 방침 화면을 넣어야 한다.**
        */}
      </div>
      <div className={styles.social}>
        <a href="#x">X</a>
        <a href="#instagram">Instagram</a>
        <a href="#discord">Discord</a>
      </div>
    </footer>
  );
}
