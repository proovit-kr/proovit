import type { ReactNode } from "react";

import styles from "./EmptyState.module.css";

/*
  값이 아직 없는 화면.

  ⚠️ `Scaffold`(준비 중)와 다른 것이다. Scaffold는 **우리가 안 만든 화면**이고,
  이것은 **만들었는데 데이터가 없는 화면**이다. 둘을 한 컴포넌트로 합치면
  참가자가 "언제 생기는지"와 "아직 개발이 안 됐는지"를 구분할 수 없다.

  빈 상태에 가짜 예시를 넣지 않는다(CLAUDE.md 규칙 1). 대신 **언제 채워지는지**를
  말한다 — 그게 참가자가 여기서 얻어야 할 유일한 정보다.
*/

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  /** 언제·무엇을 하면 채워지는가 */
  detail: string;
  /** 지금 할 수 있는 일이 있으면 그 링크 */
  action?: ReactNode;
}) {
  return (
    <div className={styles.root}>
      <p className={styles.title}>{title}</p>
      <p className={styles.detail}>{detail}</p>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
