import type { Metadata } from "next";

import { EmptyState } from "@/components/EmptyState";
import { AbuseStatus } from "@/generated/prisma/enums";
import { guardPage } from "@/lib/access";
import { prisma } from "@/lib/prisma";

import { FlagActions } from "./FlagActions";

import styles from "./abuse.module.css";

/*
  어뷰징 검토 — PLN3 2장. 참가자 소명(`/dashboard/appeal`)의 짝이다.

  ⚠️ **판정이 지표를 직접 고치지 않는다.** 확정된 플래그가 집계에서 무엇을 빼는지는
  채점 시점에 이 표를 조인해 정한다(admin-store.resolveAbuseFlag 주석).

  ⚠️ 참가자 소명을 판정 화면에 함께 둔다. 다른 화면에 있으면 안 읽고 누르게 되고,
  규칙 제16조 ①이 요구하는 「적용 전 소명 기회」가 형식만 남는다.

  플래그를 만드는 쪽(엣지 탐지·운영자 수동 등록)은 아직 없다 — PLN8이 "조사·정의,
  구현은 시즌 중 필요 시"로 못박은 범위다. 이 화면은 만들어진 플래그를 처리한다.
*/

export const metadata: Metadata = {
  title: "어뷰징 검토",
  robots: { index: false, follow: false },
};

const WHEN = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const STATUS_LABEL: Record<string, string> = {
  [AbuseStatus.flagged]: "검토 대기",
  [AbuseStatus.appealed]: "소명 접수",
  [AbuseStatus.upheld]: "어뷰징 확정",
  [AbuseStatus.overturned]: "플래그 취소",
};

export default async function Page() {
  const { viewer } = await guardPage("adminAbuse", "/admin/abuse");

  const flags = viewer.season
    ? await prisma.abuseFlag.findMany({
        where: { entry: { seasonId: viewer.season.id } },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 200,
        select: {
          id: true,
          status: true,
          reason: true,
          botScore: true,
          adjustedVisitors: true,
          appealText: true,
          appealedAt: true,
          resolutionNote: true,
          createdAt: true,
          entry: {
            select: { id: true, ideaTitle: true, team: { select: { name: true } } },
          },
        },
      })
    : [];

  return (
    <section className={styles.root}>
      <header className={styles.head}>
        <h1 className={styles.title}>어뷰징 검토</h1>
        <p className={styles.sub}>
          확정하면 그 팀의 지표가 채점에서 조정되고 제재로 이어질 수 있습니다.
          확정·취소 모두 사유가 남고 감사 로그에 기록됩니다.
        </p>
      </header>

      {flags.length === 0 ? (
        <EmptyState
          title="검토할 플래그가 없습니다"
          detail="측정 파이프라인이 붙고 이상 트래픽이 잡히면 여기에 쌓입니다. 운영자가 직접 등록하는 화면은 아직 없습니다."
        />
      ) : (
        <ul className={styles.list}>
          {flags.map((flag) => (
            <li key={flag.id} className={styles.item}>
              <div className={styles.main}>
                <p className={styles.team}>
                  {flag.entry.team.name}
                  <span className={styles.idea}>{flag.entry.ideaTitle}</span>
                  <span className={styles.status} data-status={flag.status}>
                    {STATUS_LABEL[flag.status] ?? flag.status}
                  </span>
                </p>
                <p className={styles.facts}>
                  <span>{WHEN.format(flag.createdAt)}</span>
                  <span>{flag.reason ?? "사유 미기재"}</span>
                  {flag.botScore !== null ? (
                    <span>봇 스코어 {flag.botScore.toString()}</span>
                  ) : null}
                  {flag.adjustedVisitors !== null ? (
                    <span>조정 {flag.adjustedVisitors}</span>
                  ) : null}
                </p>

                {/* 소명은 판정 바로 옆에 둔다 — 다른 화면에 있으면 안 읽는다 */}
                {flag.appealText ? (
                  <blockquote className={styles.appeal}>
                    <p className={styles.appealWhen}>
                      {flag.appealedAt ? WHEN.format(flag.appealedAt) : null} 참가팀
                      소명
                    </p>
                    <p className={styles.appealText}>{flag.appealText}</p>
                  </blockquote>
                ) : null}

                {flag.resolutionNote ? (
                  <p className={styles.resolution}>
                    처리 사유 — {flag.resolutionNote}
                  </p>
                ) : null}
              </div>

              <FlagActions flagId={flag.id} status={flag.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
