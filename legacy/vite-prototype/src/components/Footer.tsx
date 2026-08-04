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
      </div>
      <div className={styles.social}>
        <a href="#x">X</a>
        <a href="#instagram">Instagram</a>
        <a href="#discord">Discord</a>
      </div>
    </footer>
  );
}
