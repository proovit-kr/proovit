import Link from "next/link";

import type { AdminHeaderModel } from "@/lib/header-state";

import styles from "./AdminTop.module.css";
import { Badge } from "./Badge";
import { AdminTag, Avatar, Chip, LiveDot, Segs } from "./HeaderBits";
import { Logo } from "./NavBar";
import { SeasonSelect } from "./SeasonSelect";

/*
  운영자 헤더 — 시안 어드민 크롬(`.ad-top`). 「헤더 상태별 시안 v1.0」의 A1~A7.

  ver3 어드민 크롬(워드마크, ADMIN 태그, 시즌 셀렉트, 이메일 칩)에 가운데
  **지금 처리해야 할 대기열**을 시즌 상태별로 하나만 얹는다. 급한 상태
  (모집 중·심사 중·집계 중·종료)에서만 둘까지이고 레드·오렌지가 항상 우측이다.
  무엇을 그릴지는 `resolveAdminHeader`(header-state.ts)가 정한다.
*/

const Q: Record<AdminHeaderModel["queues"][number]["tone"], string> = {
  b: styles.qB,
  l: styles.qL,
  w: styles.qW,
  t: styles.qT,
  v: styles.qV,
  r: styles.qR,
};

/* 꼬리 글자색. `[data-num]`은 필의 톤을 따르므로 라벨만 물들인다(시안 A4-M) */
const TAIL: Record<AdminHeaderModel["queues"][number]["tone"], string> = {
  b: "var(--blue)",
  l: "var(--accent)",
  w: "var(--warn)",
  t: "var(--teal)",
  v: "var(--violet)",
  r: "var(--danger)",
};

export function AdminTop({ model }: { model: AdminHeaderModel }) {
  const [first, second] = model.queues;
  return (
    <div className={styles.top} data-variant={model.variant} data-probe="ad-top">
      <Logo className={styles.wm} />
      <AdminTag />
      <SeasonSelect seasons={model.seasons} className={styles.ssel} />
      {/* 배지는 ≤760에서 숨는다(시안 5장 — 대기열 한 줄만 남긴다) */}
      <span className={styles.bdWrap}>
        <Badge tone={model.badge.tone}>
          {model.badge.live ? <LiveDot tone={model.badge.live} size={6} /> : null}
          {model.badge.label}
        </Badge>
      </span>
      {model.queues.map((q, i) => (
        <Link key={i} href={q.href} className={`${styles.q} ${styles.desk} ${Q[q.tone]}`} data-probe="ad-q">
          <Segs segs={q.segs} />
        </Link>
      ))}
      {/*
        ≤760 — 대기열 둘을 한 필에 합친다. 첫 대기열의 톤과 행선지, 둘째는
        짧은 꼴로 꼬리에(시안 5장 「심사 대기 18건 · SLA 임박 3」).
      */}
      {first ? (
        <Link href={first.href} className={`${styles.q} ${styles.mob} ${Q[first.tone]}`} data-probe="ad-q">
          <span>
            <Segs segs={first.segs} />
          </span>
          {second?.short ? (
            <span style={{ color: TAIL[second.tone] }}>
              <Segs segs={second.short} />
            </span>
          ) : null}
        </Link>
      ) : null}
      <span className={styles.rgt}>
        <span className={styles.email}>
          <Chip>{model.email}</Chip>
        </span>
        <Avatar initial="A" admin />
      </span>
    </div>
  );
}
