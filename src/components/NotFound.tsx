import type { ReactNode } from "react";

import { Card } from "@/components/Surface";

import styles from "./NotFound.module.css";

/*
  404 본문 — 시안 `design/proovit_404.html`의 `.nf`.

  왼쪽에 제목·한두 문장·텍스트 링크 하나, 오른쪽에 정적 플레이트(NOT FOUND,
  404). 시안의 두 화면(① 앱 경로 없음, ② 참가팀 주소 미연결)이 이 틀을
  같이 쓰고 글자만 다르다.
*/
export function NotFoundBody({
  title,
  children,
  go,
}: {
  title: string;
  /** 제목 아래 한두 문장. `<p>` 하나 */
  children: ReactNode;
  /** 텍스트 링크 하나. 버튼이 아니다 — v1.1 담백 패스가 CTA 버튼을 뺐다 */
  go: ReactNode;
}) {
  return (
    <div className={styles.nf}>
      <div className={styles.in}>
        <div className={styles.copy}>
          <h1>{title}</h1>
          {children}
          {go}
        </div>
        {/* 장식이다. 제목이 이미 같은 말을 하므로 읽어 주지 않는다 */}
        <Card className={styles.plate} aria-hidden="true">
          <div className={styles.cap}>NOT FOUND</div>
          <div className={styles.num}>404</div>
        </Card>
      </div>
    </div>
  );
}

/** 「홈으로 돌아가기」 링크에 붙일 클래스. next/link든 `<a>`든 쓰는 쪽이 고른다 */
export const goClass = styles.go;
