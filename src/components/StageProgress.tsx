// 프로토타입은 @/types의 SeasonStage를 썼다. 여기서는 표시용 타입만 필요하므로
// content의 SeasonStageInfo를 쓴다. stages가 DB로 옮겨가면 그때 Prisma 타입으로 바꾼다.
import type { CSSProperties } from 'react';

import type { SeasonStageInfo as SeasonStage } from '@/content/landing';
import styles from './StageProgress.module.css';

interface CompactProps {
  stages: SeasonStage[];
  /** 현재 스테이지 인덱스 */
  currentIndex: number;
}

/** 대시보드 배너 아래의 5단계 진행 바 */
export function StageProgress({ stages, currentIndex }: CompactProps) {
  return (
    <div className={styles.scroller}>
      <div className={`${styles.track} ${styles['track--compact']}`}>
        <div className={styles.line} />
        {stages.map((stage, i) => {
          const done = i < currentIndex;
          const current = i === currentIndex;
          return (
            <div className={styles.step} key={stage.key}>
              <div
                className={[
                  styles.dotSm,
                  done ? styles.done : '',
                  current ? styles.current : '',
                ].join(' ')}
              >
                {done ? '✓' : stage.n}
              </div>
              <div className={[styles.label, current ? styles.on : ''].join(' ')}>
                {stage.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface FullProps {
  stages: SeasonStage[];
  /** 0~1 스크롤 진행도 — 채워진 만큼 체크로 바뀐다 */
  fill: number;
}

const THRESHOLDS = [0.12, 0.32, 0.52, 0.72, 0.92];

/** 랜딩 "작동 방식" — 스크롤에 따라 트랙이 채워지는 5단계 */
export function StageTrack({ stages, fill }: FullProps) {
  return (
    <div className={styles.scroller}>
      <div className={`${styles.track} ${styles['track--full']}`}>
        <div className={`${styles.line} ${styles['line--full']}`}>
          {/* 축(가로/세로)은 CSS가 정한다 — 좁은 화면에서는 같은 값이 높이가 된다 */}
          <div
            className={styles.fill}
            style={{ '--fill': `${(fill * 100).toFixed(1)}%` } as CSSProperties}
          />
        </div>
        {stages.map((stage, i) => {
          const done = fill >= (THRESHOLDS[i] ?? 1);
          return (
            <div className={styles.step} key={stage.key}>
              <div className={[styles.dotLg, done ? styles.done : ''].join(' ')}>
                {done ? '✓' : stage.n}
              </div>
              <div className={styles.titleFull}>{stage.label}</div>
              <div className={styles.weekFull}>{stage.week}</div>
              <div className={styles.descFull}>{stage.description}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface JourneyStep {
  label: string;
  sub: string;
  done: boolean;
}

/** 참가작 상세의 "시즌 여정" */
export function JourneyTrack({ steps }: { steps: JourneyStep[] }) {
  const doneRatio =
    steps.length > 0 ? steps.filter((s) => s.done).length / steps.length : 0;
  return (
    <div className={styles.scroller}>
      <div className={`${styles.track} ${styles['track--journey']}`}>
        <div
          className={`${styles.line} ${styles['line--full']}`}
          style={{
            background: `linear-gradient(90deg, var(--c-lime) 0%, var(--c-lime) ${
              doneRatio * 100
            }%, rgba(255,255,255,0.14) ${doneRatio * 100}%, rgba(255,255,255,0.14) 100%)`,
          }}
        />
        {steps.map((step) => (
          <div className={styles.step} key={step.label}>
            <div
              className={[
                styles.dotLg,
                step.done ? styles.done : styles.current,
              ].join(' ')}
            >
              {step.done ? '✓' : <span className={styles.pulse} />}
            </div>
            <div
              className={styles.journeyLabel}
              style={{ color: step.done ? 'var(--c-text-strong)' : 'var(--c-lime)' }}
            >
              {step.label}
            </div>
            <div
              className={styles.journeySub}
              style={{ color: step.done ? 'var(--c-text-dim)' : 'var(--c-lime)' }}
            >
              {step.sub}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
