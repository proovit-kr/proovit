import Link from "next/link";

import type { DashboardHeaderModel } from "@/lib/header-state";

import { Badge } from "./Badge";
import { LinkButton } from "./Button";
import styles from "./DashboardTop.module.css";
import { Avatar, Bell, LiveDot, Segs } from "./HeaderBits";
import { Icon } from "./Icon";
import { Logo } from "./NavBar";
import { StripDismiss } from "./StripDismiss";

/*
  참가자 대시보드 헤더 — 시안 `.db-top`. 「헤더 상태별 시안 v1.0」의 D1~D9.

  배너 필(`.db-ban`)은 스테이지명 · 시간 값 · 행동 버튼 세 칸 구조를 유지하고
  색만 바뀐다. 실격과 탈락은 헤더 **위**에 스트립을 더해 어느 화면에서도 상태가
  잊히지 않게 한다. 무엇을 그릴지는 `resolveDashboardHeader`(header-state.ts)가
  정하고 여기서는 그리기만 한다.

  팀명과 인원은 ver3에 없던 요소다(시안 D1 노트, 팀 합의는 「판단 필요」).
*/

const TONE: Record<DashboardHeaderModel["banner"]["tone"], string> = {
  base: "",
  urgent: styles.urgent,
  judge: styles.judge,
  verify: styles.verify,
  elim: styles.elim,
  dq: styles.dq,
  done: styles.done,
  arch: styles.arch,
  next: styles.next,
};

const GO: Record<NonNullable<DashboardHeaderModel["banner"]["go"]>["tone"], string> = {
  lime: "",
  violet: styles.goV,
  red: styles.goR,
  gray: styles.goG,
};

export function DashboardTop({
  model,
  entryId,
}: {
  model: DashboardHeaderModel;
  /** 탈락 스트립을 닫을 때 쿠키에 적는 값 */
  entryId: string;
}) {
  const { banner, strip, team } = model;

  return (
    <>
      {strip ? (
        <div
          className={[styles.strip, strip.tone === "red" ? styles.stripR : styles.stripG].join(" ")}
          role={strip.tone === "red" ? "alert" : "status"}
          data-probe="strip"
        >
          {strip.live ? <LiveDot tone="red" /> : null}
          <span>
            <Segs segs={strip.text} />
          </span>
          <Link href={strip.link.href}>{strip.link.label}</Link>
          {strip.dismissible ? <StripDismiss entryId={entryId} /> : null}
        </div>
      ) : null}

      <div className={styles.top} data-variant={model.variant} data-probe="db-top">
        <Logo className={styles.wm} />

        <span className={styles.team}>
          <b>{team.name}</b> {team.members}인
          {team.chip ? (
            <Badge tone="gray" className={styles.chip}>
              <Segs segs={team.chip} />
            </Badge>
          ) : null}
        </span>

        <span className={[styles.ban, TONE[banner.tone]].filter(Boolean).join(" ")} data-probe="db-ban">
          {banner.live ? <LiveDot tone={banner.live} /> : null}
          {banner.lock ? <Icon name="lock" className={styles.lock} /> : null}
          <span className={styles.stg}>{banner.stage}</span>
          <span className={styles.tm}>
            {banner.timeShort ? (
              <>
                <span className={styles.full}>
                  <Segs segs={banner.time} />
                </span>
                <span className={styles.short}>
                  <Segs segs={banner.timeShort} />
                </span>
              </>
            ) : (
              <Segs segs={banner.time} />
            )}
          </span>
          {banner.go ? (
            <Link href={banner.go.href} className={[styles.go, GO[banner.go.tone]].filter(Boolean).join(" ")}>
              {banner.go.short ? (
                <>
                  <span className={styles.full}>{banner.go.label}</span>
                  <span className={styles.short}>{banner.go.short}</span>
                </>
              ) : (
                banner.go.label
              )}
            </Link>
          ) : null}
        </span>

        <span className={styles.rgt}>
          {model.action ? (
            <LinkButton href={model.action.href} variant={model.action.variant} size="sm">
              {model.action.label}
            </LinkButton>
          ) : null}
          {model.bell ? <Bell dot={model.bell.dot} red={model.bell.red} /> : null}
          <Avatar initial={model.avatar.initial} />
        </span>
      </div>
    </>
  );
}
