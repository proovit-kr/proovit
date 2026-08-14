import type { Metadata } from "next";

import { EmptyState } from "@/components/EmptyState";
import { SeasonPhase } from "@/generated/prisma/enums";
import { guardPage } from "@/lib/access";
import { loadAdminSeasons } from "@/lib/admin-read";

import { PhaseForm } from "./PhaseForm";

import styles from "./seasons.module.css";

/*
  시즌·페이즈 — PLN3 2장 「시즌 구조와 전환」.

  ⚠️ 페이즈 전환의 정본은 크론이다(ADR-010). 이 화면은 **예정과 실제를 나란히
  보여주고**, 앞당기거나 되돌리는 예외 경로를 준다. 두 칸의 차이가 곧
  "크론이 안 돌았는지, 사람이 앞당겼는지"의 답이다.

  ⚠️ 스테이지 일정(opens_at·closes_at)은 여기서 못 고친다. 시즌1 캘린더가 잠정이라
  아직 넣을 값이 없고, 값이 정해지면 시드나 마이그레이션으로 한 번에 넣는 편이
  안전하다 — 폼으로 한 칸씩 고치면 다섯 스테이지의 순서가 어긋난 채 저장될 수 있다.
*/

export const metadata: Metadata = {
  title: "시즌 관리",
  robots: { index: false, follow: false },
};

const WHEN = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function Page() {
  await guardPage("adminSeasons", "/admin/seasons");
  const seasons = await loadAdminSeasons();

  return (
    <section className={styles.root}>
      <header className={styles.head}>
        <h1 className={styles.title}>시즌</h1>
        <p className={styles.sub}>
          페이즈 전환은 크론이 일정표(season_schedules)를 읽어 자동으로 합니다.
          여기서 바꾸는 것은 앞당기거나 되돌리는 경우이고, 사유가 남습니다.
        </p>
      </header>

      {seasons.length === 0 ? (
        <EmptyState
          title="시즌이 없습니다"
          detail="시드(npm run db:seed)로 시즌1을 만들 수 있습니다."
        />
      ) : null}

      {seasons.map((season) => (
        <article key={season.id} className={styles.season}>
          <div className={styles.seasonHead}>
            <h2 className={styles.seasonTitle}>{season.title}</h2>
            <p className={styles.seasonMeta}>
              <span className={styles.phase}>{season.phase}</span>
              <span>{season.slug}</span>
              <span>참가 {season.entryCount}팀</span>
            </p>
          </div>

          <div className={styles.cols}>
            <div className={styles.col}>
              <h3 className={styles.colTitle}>스테이지</h3>
              <ul className={styles.rows}>
                {season.stages.map((stage) => (
                  <li key={stage.stageKey} className={styles.row}>
                    <span className={styles.rowKey}>
                      {stage.stageKey}
                      {stage.isGate ? (
                        <span className={styles.gate}>게이트</span>
                      ) : null}
                    </span>
                    <span className={styles.rowName}>{stage.name}</span>
                    <span className={styles.rowWhen}>
                      {stage.opensAt && stage.closesAt
                        ? `${WHEN.format(stage.opensAt)} ~ ${WHEN.format(stage.closesAt)}`
                        : "미정"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.col}>
              <h3 className={styles.colTitle}>전환 일정</h3>
              {season.schedules.length === 0 ? (
                <p className={styles.note}>
                  일정 행이 없습니다. 크론이 전환할 근거가 없으니 지금은 이
                  화면에서 수동으로만 바뀝니다.
                </p>
              ) : (
                <ul className={styles.rows}>
                  {season.schedules.map((schedule) => (
                    <li key={schedule.phase} className={styles.row}>
                      <span className={styles.rowKey}>{schedule.phase}</span>
                      <span className={styles.rowName}>
                        예정 {WHEN.format(schedule.startsAt)}
                      </span>
                      <span className={styles.rowWhen}>
                        {schedule.appliedAt
                          ? `전환 ${WHEN.format(schedule.appliedAt)}`
                          : "대기"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <PhaseForm
            seasonId={season.id}
            current={season.phase}
            phases={Object.values(SeasonPhase)}
          />
        </article>
      ))}
    </section>
  );
}
