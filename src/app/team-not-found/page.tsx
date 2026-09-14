import type { Metadata } from "next";

import { NotFoundBody, goClass } from "@/components/NotFound";
import { ROOT_DOMAIN } from "@/lib/measurement";

import styles from "./team-not-found.module.css";

/*
  참가팀 주소 404 — 시안 `design/proovit_404.html`의 ② 「참가팀 주소 미연결」.

  팀명.proovit.kr에 연결된 참가작이 없을 때 측정 프록시(Cloudflare Worker,
  ADR-006)가 돌려주는 페이지다. 프록시는 이 리포 밖에 있어서 이 화면은
  **프록시가 가져다 쓸 원본**이고, 개발 서버에서는 이 경로로 미리 본다.

  ⚠️ 링크가 전부 절대 주소다. 이 화면이 뜨는 곳은 proovit.kr이 아니라 팀
  주소라서, `/`로 적으면 팀 주소의 뿌리로 간다 — 곧 이 화면으로 되돌아온다.

  공개 크롬을 안 쓰는 이유는 team-not-found.module.css에 있다.
*/

const HOME = `https://${ROOT_DOMAIN}`;
const CONTACT = `help@${ROOT_DOMAIN}`;

export const metadata: Metadata = {
  title: "연결된 참가작이 없어요",
  /* 팀 주소에서 뜨는 화면이다. proovit.kr의 경로로 색인되면 안 된다 */
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <main className="page">
      <header className={styles.head}>
        <a className={styles.wm} href={HOME} aria-label="PROOVIT 홈">
          PROO<em className={styles.wmCheck}>✓</em>IT
        </a>
        <span className={styles.rgt}>
          <a href={HOME}>{ROOT_DOMAIN}</a>
        </span>
      </header>
      <NotFoundBody
        title="연결된 참가작이 없어요"
        go={
          <a href={HOME} className={goClass}>
            프루빗 홈으로
          </a>
        }
      >
        <p>
          이 팀 주소에 아직 배포 주소가 등록되지 않았거나, 시즌 종료로 연결이
          해제됐어요. 참가팀이라면 대시보드의{" "}
          <a href={`${HOME}/dashboard/measurement`}>측정 연동</a>에서 배포
          주소를 등록해 주세요.
        </p>
      </NotFoundBody>
      <footer className={styles.foot}>
        <span className={styles.wm}>
          PROO<em className={styles.wmCheck}>✓</em>IT
        </span>
        <span>참가팀 주소는 프루빗 시즌 참가작으로 연결돼요</span>
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </footer>
    </main>
  );
}
