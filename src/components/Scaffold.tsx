import type { ReactNode } from "react";

import styles from "./Scaffold.module.css";

/*
  아직 안 만든 화면의 자리표시.

  라우트를 먼저 다 깔아두는 이유는 셋이다.
  ① 접근 제어(canAccess)를 화면마다 붙여봐야 판정표가 실제로 맞는지 알 수 있다.
  ② 네비게이션·링크를 미리 이어두면 나중에 화면을 채울 때 동선을 다시 안 짠다.
  ③ 못 채운 화면이 404가 아니라 「준비 중」으로 서 있으면, 8/17 회의에서
     무엇이 남았는지를 화면으로 보여줄 수 있다.

  ⚠️ 이 컴포넌트는 **가짜 데이터를 그리지 않는다**(CLAUDE.md 규칙 1).
  숫자·순위·차트 자리에 그럴듯한 값을 넣어두면 그게 스크린샷으로 돌아다니고,
  "조작 불가능한 지표"를 파는 서비스가 자기 화면부터 지어낸 셈이 된다.
  여기 있는 것은 목적과 만들 것의 목록뿐이다.
*/

type Props = {
  /** 화면 이름. PLN3 2장 카탈로그의 「화면」 열 */
  title: string;
  /** 이 화면이 왜 있는가. PLN3의 「목적」 열 */
  purpose: string;
  /** 들어갈 것들. PLN3의 「핵심 요소」 열 */
  elements: string[];
  /** 지금 못 만드는 이유가 있으면 밝힌다. 없으면 생략 */
  blockedBy?: string;
  /**
   * 접근 판정이 409로 막은 사유(canAccess). 페이즈·진도가 안 맞아 잠긴 경우다.
   * 401·403·404는 여기 오지 않는다 — assertAccess가 리다이렉트하거나 404를 낸다.
   */
  locked?: string;
  /** 화면 안에서 이어지는 곳 */
  children?: ReactNode;
};

export function Scaffold({
  title,
  purpose,
  elements,
  blockedBy,
  locked,
  children,
}: Props) {
  return (
    <section className={styles.root}>
      <header className={styles.head}>
        <p className={locked ? styles.badgeLocked : styles.badge}>
          {locked ? "지금은 열려 있지 않습니다" : "준비 중"}
        </p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.purpose}>{locked ?? purpose}</p>
      </header>

      <div className={styles.body}>
        <h2 className={styles.label}>들어갈 것</h2>
        <ul className={styles.list}>
          {elements.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        {blockedBy ? (
          <p className={styles.blocked}>
            <span className={styles.blockedLabel}>기다리는 것</span>
            {blockedBy}
          </p>
        ) : null}
      </div>

      {children}
    </section>
  );
}
