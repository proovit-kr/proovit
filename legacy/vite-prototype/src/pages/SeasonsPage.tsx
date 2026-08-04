import { Badge, Footer, InfoStrip, LinkButton, NavBar } from '@/components';
import { SEASONS } from '@/mocks';
import { useAppStore } from '@/store/useAppStore';
import type { Season, SeasonStatus } from '@/types';
import { formatKRW, formatNumber } from '@/utils/format';
import { stageIndex } from '@/utils/stage';
import styles from './SeasonsPage.module.css';

const STATUS_LABEL: Record<SeasonStatus, string> = {
  UPCOMING: '모집 예정',
  RECRUITING: '모집 중',
  IN_PROGRESS: '진행 중',
  ENDED: '종료',
};

export default function SeasonsPage() {
  const { season: liveSeason, entries } = useAppStore();

  // 현재 시즌은 스토어(개발 툴바 반영), 나머지는 목데이터 아카이브
  const seasons: Season[] = SEASONS.map((s) => (s.id === liveSeason.id ? liveSeason : s));
  const top3 = entries.slice(0, 3);

  return (
    <div className="page">
      <NavBar />
      <main className={styles.main}>
        <div className={styles.head}>
          <h1 className={styles.title}>시즌 아카이브</h1>
          <p className={styles.lead}>
            지나간 시즌의 기록과 지금 진행 중인 시즌을 한곳에서 볼 수 있어요.
          </p>
        </div>

        {seasons.map((season) => {
          const live = season.status !== 'ENDED';
          const currentIdx = stageIndex(season.currentStage);
          return (
            <section
              key={season.id}
              className={[styles.seasonCard, live ? styles.seasonCardLive : ''].join(' ')}
            >
              <div className={styles.seasonHead}>
                <h2 className={styles.seasonName}>
                  SEASON {season.number}
                  <span style={{ color: 'var(--c-text-faint)', fontWeight: 500 }}>—</span>
                  <span className={styles.theme}>{season.theme}</span>
                  <Badge tone={live ? 'lime' : 'neutral'} pill>
                    {live && <span className="dot" style={{ width: 5, height: 5 }} />}
                    {STATUS_LABEL[season.status]}
                  </Badge>
                </h2>
                <div className={styles.meta}>
                  참가 {season.teamCount}팀 · 생존 {season.survivingTeamCount}팀
                </div>
              </div>

              <InfoStrip
                items={[
                  { label: '총 상금', value: formatKRW(season.prizePoolKRW), accent: true },
                  { label: '팀 구성', value: season.teamSizeLabel },
                  { label: '참가비', value: '무료' },
                  { label: '사전 신청', value: `${formatNumber(season.preRegisterCount)}명` },
                ]}
              />

              <div className={styles.stages}>
                <div className={styles.stageRows}>
                  {season.stages.map((stage, i) => {
                    const done = season.status === 'ENDED' || i < currentIdx;
                    const active = season.status !== 'ENDED' && i === currentIdx;
                    return (
                      <div className={styles.stageRow} key={stage.key}>
                        <div
                          className={[
                            styles.stageLabel,
                            active ? styles.stageLabelOn : '',
                          ].join(' ')}
                        >
                          {stage.n}. {stage.label}
                        </div>
                        <div className={styles.stageRange}>{stage.range}</div>
                        <div
                          className={styles.stageStatus}
                          style={{
                            color: active
                              ? 'var(--c-lime)'
                              : done
                                ? 'var(--c-text-dim)'
                                : undefined,
                          }}
                        >
                          {done ? '완료 ✓' : active ? '진행 중' : '예정'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {live && (
                <div className={styles.winners}>
                  <div className={styles.winnersTitle}>현재 상위 3팀</div>
                  <div className={styles.winnerList}>
                    {top3.map((entry, i) => (
                      <div className={styles.winner} key={entry.id}>
                        <div>
                          <div className={styles.winnerRank}>{i + 1}위</div>
                          <div className={styles.winnerName}>{entry.serviceName}</div>
                        </div>
                        <div className={styles.winnerScore}>
                          {formatNumber(entry.validUsers)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className={styles.actions}>
                {live ? (
                  <>
                    <LinkButton to="/leaderboard">리더보드 보기</LinkButton>
                    {season.status === 'RECRUITING' && (
                      <LinkButton to="/apply" variant="ghost">
                        참가 신청하기
                      </LinkButton>
                    )}
                  </>
                ) : (
                  <LinkButton to="/leaderboard" variant="ghost">
                    최종 순위 보기
                  </LinkButton>
                )}
              </div>
            </section>
          );
        })}
      </main>
      <Footer />
    </div>
  );
}
