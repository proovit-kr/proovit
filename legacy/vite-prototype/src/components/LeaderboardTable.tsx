import { useNavigate } from 'react-router-dom';
import { useCountUp } from '@/hooks/useCountUp';
import type { Entry } from '@/types';
import { formatDelta, formatNumber, formatPct } from '@/utils/format';
import { PendingBadge, RevenueBadge, VerifiedBadge } from './Badge';
import { Sparkline } from './Sparkline';
import styles from './LeaderboardTable.module.css';

interface Props {
  entries: Entry[];
  /** 실시간 갱신된 점수 (없으면 entry.validUsers) */
  scores?: number[];
  rollIndex?: number;
}

const RANK_LABELS = ['1ST', '2ND', '3RD'];

/** 상위 3팀 카드 — 숫자 카운트업 + 스파크라인 드로우 */
export function LeaderboardTop3({ entries, scores, rollIndex = -1 }: Props) {
  const navigate = useNavigate();
  return (
    <div className={styles.top3}>
      {entries.slice(0, 3).map((entry, i) => (
        <Top3Card
          key={entry.id}
          entry={entry}
          index={i}
          score={scores?.[i] ?? entry.validUsers}
          rolling={rollIndex === i}
          onClick={() => navigate(`/projects/${entry.id}`)}
        />
      ))}
    </div>
  );
}

function Top3Card({
  entry,
  index,
  score,
  rolling,
  onClick,
}: {
  entry: Entry;
  index: number;
  score: number;
  rolling: boolean;
  onClick: () => void;
}) {
  const counted = useCountUp(score, 1400);
  return (
    <button
      type="button"
      className={[styles.card, index === 0 ? styles.cardFirst : ''].join(' ')}
      onClick={onClick}
    >
      <div className={styles.cardHead}>
        <div
          className={[
            styles.rankLabel,
            index === 0 ? styles.rankLabelFirst : '',
          ].join(' ')}
        >
          {RANK_LABELS[index]}
        </div>
        {entry.verification === 'VERIFIED' ? <VerifiedBadge /> : <PendingBadge />}
      </div>
      <div className={styles.cardName}>{entry.serviceName}</div>
      <div className={styles.cardTeam}>팀 {entry.teamName}</div>
      <div className={styles.cardBottom}>
        <div>
          <div
            className={styles.cardScore}
            style={rolling ? { transform: 'translateY(-4px)', opacity: 0.35 } : undefined}
          >
            {formatNumber(counted)}
          </div>
          <div className={styles.cardScoreLabel}>유효 가입자</div>
        </div>
        <Sparkline
          values={entry.spark}
          width={76}
          height={26}
          delaySec={0.15 + index * 0.18}
        />
      </div>
    </button>
  );
}

/** 전체 순위 테이블 */
export function LeaderboardTable({ entries, scores, rollIndex = -1 }: Props) {
  const navigate = useNavigate();
  return (
    <div className={styles.wrap}>
      <div className={styles.scroller}>
        <div className={styles.grid}>
          <div className={styles.head}>
            <div>순위</div>
            <div>서비스 · 팀</div>
            <div style={{ textAlign: 'right' }}>유효 가입자</div>
            <div style={{ textAlign: 'right' }}>주간 증가</div>
            <div style={{ textAlign: 'right' }}>재방문</div>
            <div>상태</div>
            <div />
          </div>
          {entries.map((entry, i) => {
            const down = entry.weeklyDeltaPct < 0;
            return (
              <button
                type="button"
                key={entry.id}
                className={styles.row}
                onClick={() => navigate(`/projects/${entry.id}`)}
              >
                <div
                  className={[styles.rank, i < 3 ? styles.rankTop : ''].join(' ')}
                >
                  {i + 1}
                </div>
                <div>
                  <div className={styles.name}>{entry.serviceName}</div>
                  <div className={styles.team}>팀 {entry.teamName}</div>
                </div>
                <div
                  className={[
                    styles.score,
                    rollIndex === i ? styles.rolling : '',
                  ].join(' ')}
                >
                  {formatNumber(scores?.[i] ?? entry.validUsers)}
                </div>
                <div className={[styles.delta, down ? styles.deltaDown : ''].join(' ')}>
                  {formatDelta(entry.weeklyDeltaPct)}
                </div>
                <div className={styles.retention}>{formatPct(entry.retentionPct)}</div>
                <div className={styles.tags}>
                  {entry.hasRevenue && <RevenueBadge />}
                  {entry.verification === 'VERIFIED' && <VerifiedBadge />}
                  {entry.verification === 'PENDING' && <PendingBadge />}
                </div>
                <div className={styles.tail}>
                  <Sparkline
                    values={entry.spark}
                    color={down ? 'var(--c-danger)' : 'var(--c-lime)'}
                    delaySec={0.1 + i * 0.08}
                  />
                  <span className={styles.arrow}>→</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
