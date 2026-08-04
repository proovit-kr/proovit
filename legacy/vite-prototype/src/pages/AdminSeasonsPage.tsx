import { useState } from 'react';
import {
  Badge,
  Button,
  Modal,
  ModalActions,
  ModalBody,
  ModalTitle,
  OpsNavBar,
} from '@/components';
import { useAppStore } from '@/store/useAppStore';
import { stageIndex } from '@/utils/stage';
import admin from './admin.module.css';
import styles from './AdminSeasonsPage.module.css';

const STATUS_TEXT = {
  UPCOMING: '모집 전',
  RECRUITING: '모집 중',
  IN_PROGRESS: '진행 중',
  ENDED: '종료',
} as const;

export default function AdminSeasonsPage() {
  const { season, advanceStage, closeRecruiting } = useAppStore();
  const [modal, setModal] = useState(false);

  const currentIdx = stageIndex(season.currentStage);
  const nextStage = season.stages[Math.min(currentIdx + 1, season.stages.length - 1)];
  const currentStage = season.stages[currentIdx];
  const isLast = currentIdx >= season.stages.length - 1;

  return (
    <div className="page page--ops">
      <OpsNavBar />
      <main className={`${admin.main} ${admin.mainNarrow}`}>
        <div className={styles.head}>
          <h1 className={admin.title}>시즌 관리</h1>
          <Button variant="ghost" size="sm">
            + 시즌 생성
          </Button>
        </div>

        <div className={`${admin.panel} ${admin.panelPad}`}>
          <div className={styles.cardHead}>
            <h2 className={styles.seasonName}>
              SEASON {season.number} <span className={styles.dash}>—</span>
              <span className={styles.theme}>{season.theme}</span>
              <Badge tone={season.status === 'ENDED' ? 'neutral' : 'lime'} pill>
                {season.status !== 'ENDED' && (
                  <span className="dot" style={{ width: 5, height: 5 }} />
                )}
                {STATUS_TEXT[season.status]}
              </Badge>
            </h2>
            <div className={styles.meta}>
              참가 {season.teamCount}팀 · 생존 {season.survivingTeamCount}팀
            </div>
          </div>

          <div className={styles.stages}>
            {season.stages.map((stage, i) => {
              const done = i < currentIdx;
              const active = i === currentIdx;
              return (
                <div className={styles.stageRow} key={stage.key}>
                  <span
                    className={[
                      styles.mark,
                      done ? styles.markDone : '',
                      active ? styles.markActive : '',
                    ].join(' ')}
                  >
                    {done ? '✓' : active ? <span className={styles.pulse} /> : stage.n}
                  </span>
                  <div
                    className={[
                      styles.label,
                      done ? styles.labelDone : '',
                      active ? styles.labelActive : '',
                    ].join(' ')}
                  >
                    {stage.label}
                  </div>
                  <div className={styles.range}>{stage.range}</div>
                  <div
                    className={[
                      styles.status,
                      done ? styles.statusDone : '',
                      active ? styles.statusActive : '',
                    ].join(' ')}
                  >
                    {done ? '완료 ✓' : active ? '진행 중' : '예정'}
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.actions}>
            <Button size="sm" disabled={isLast} onClick={() => setModal(true)}>
              다음 스테이지로 전환
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={season.status !== 'RECRUITING'}
              onClick={() => void closeRecruiting()}
            >
              모집 마감
            </Button>
          </div>
        </div>
      </main>

      <Modal open={modal} onClose={() => setModal(false)} ops>
        <ModalTitle>스테이지 전환 확인</ModalTitle>
        <ModalBody>
          전환 시 전 참가팀의 배너·진행 바·제출 폼이 일괄 갱신됨 · 되돌리기 불가
        </ModalBody>
        <div className={styles.transition}>
          {currentStage?.label} → {nextStage?.label}
        </div>
        <ModalActions>
          <Button
            size="sm"
            onClick={async () => {
              setModal(false);
              await advanceStage();
            }}
          >
            전환
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setModal(false)}>
            취소
          </Button>
        </ModalActions>
      </Modal>
    </div>
  );
}
