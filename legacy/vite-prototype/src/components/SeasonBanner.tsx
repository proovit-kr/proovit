import type { ReactNode } from 'react';
import { useCountdown } from '@/hooks/useCountdown';
import type { Season } from '@/types';
import { stageLabel } from '@/utils/stage';
import styles from './SeasonBanner.module.css';

interface Props {
  season: Season;
  /** 오른쪽 D-day 카운트다운 (예: 제출 마감) */
  countdown?: { label: string; targetIso: string };
  /** 오른쪽 보조 문구 (카운트다운이 없을 때) */
  note?: string;
  /** 배너 아래 영역 (스테이지 진행 바 등) */
  children?: ReactNode;
}

/** 시즌·스테이지 상태 배너 + 실시간 D-day */
export function SeasonBanner({ season, countdown, note, children }: Props) {
  const stageIdx = season.stages.findIndex((s) => s.key === season.currentStage);
  const stageName = stageLabel(season, season.currentStage);

  return (
    <div className={styles.banner}>
      <div className={styles.row}>
        <div className={styles.left}>
          <span className="dot" />
          SEASON {season.number} · 스테이지 {stageIdx + 1} {stageName}
        </div>
        {countdown ? (
          <CountdownLabel label={countdown.label} targetIso={countdown.targetIso} />
        ) : note ? (
          <div className={styles.note}>{note}</div>
        ) : null}
      </div>
      {children ? <div className={styles.extra}>{children}</div> : null}
    </div>
  );
}

export function CountdownLabel({ label, targetIso }: { label: string; targetIso: string }) {
  const cd = useCountdown(targetIso);
  return (
    <div className={styles.countdown}>
      {label} D-{cd.days} <span className={styles.clock}>{cd.clock}</span>
    </div>
  );
}
