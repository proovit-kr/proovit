import { useState } from 'react';
import {
  Badge,
  Button,
  Collapsible,
  Modal,
  ModalActions,
  ModalBody,
  ModalTitle,
  OpsNavBar,
} from '@/components';
import { JUDGING_ITEMS, JUDGING_PENDING_COUNT } from '@/mocks';
import { useAppStore } from '@/store/useAppStore';
import type { JudgingDecision } from '@/types';
import { stageLabel } from '@/utils/stage';
import admin from './admin.module.css';
import styles from './AdminJudgingPage.module.css';

const DECISION_LABEL: Record<JudgingDecision, string> = {
  PENDING: '대기',
  PASSED: '통과',
  HELD: '보류',
};

export default function AdminJudgingPage() {
  const { season, judging, decideJudging } = useAppStore();
  const [selected, setSelected] = useState(0);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [passModal, setPassModal] = useState(false);

  const item = judging[selected];
  // 초기 대기 12건에서, 이번 세션에 처리한 건수만큼 줄어든다
  const handledNow = judging.filter((row) => {
    const initial = JUDGING_ITEMS.find((i) => i.id === row.id);
    return initial?.decision === 'PENDING' && row.decision !== 'PENDING';
  }).length;
  const pendingCount = JUDGING_PENDING_COUNT - handledNow;

  const confirmPass = async () => {
    setPassModal(false);
    await decideJudging(item.id, 'PASSED');
  };

  const hold = async () => {
    if (!noteOpen) {
      setNoteOpen(true);
      return;
    }
    await decideJudging(item.id, 'HELD', note);
    setNoteOpen(false);
    setNote('');
  };

  return (
    <div className="page page--ops">
      <OpsNavBar />
      <main className={admin.main}>
        <div className={admin.chips}>
          <span className={admin.chip}>{season.title}</span>
          <span className={admin.chip}>
            스테이지 {stageLabel(season, season.currentStage)}
          </span>
          <span className={`${admin.chip} ${admin.chipLime}`}>대기 {pendingCount}건</span>
        </div>

        <div className={styles.layout}>
          <div className={admin.panel}>
            <div className={admin.panelHead}>제출 목록</div>
            {judging.map((row, i) => (
              <button
                key={row.id}
                className={[styles.item, i === selected ? styles.itemActive : ''].join(' ')}
                onClick={() => {
                  setSelected(i);
                  setNoteOpen(false);
                }}
              >
                <div>
                  <div className={styles.team}>{row.teamName}</div>
                  <div className={styles.service}>{row.serviceName}</div>
                </div>
                <Badge
                  tone={
                    row.decision === 'PASSED'
                      ? 'lime'
                      : row.decision === 'HELD'
                        ? 'warn'
                        : 'neutral'
                  }
                >
                  {DECISION_LABEL[row.decision]}
                </Badge>
              </button>
            ))}
          </div>

          <div className={`${admin.panel} ${admin.panelPad}`}>
            <h1 className={admin.title}>
              {item.teamName} — {item.serviceName}
            </h1>

            <div className={styles.metrics}>
              <div className={admin.metricCell}>
                <div className={admin.metricLabel}>사전 신청자</div>
                <div className={admin.metricValue}>{item.signups}</div>
              </div>
              <div className={admin.metricCell}>
                <div className={admin.metricLabel}>방문자</div>
                <div className={admin.metricValue}>{item.visitors}</div>
              </div>
              <div className={admin.metricCell}>
                <div className={admin.metricLabel}>전환율</div>
                <div className={`${admin.metricValue} ${admin.metricValueLime}`}>
                  {item.conversionPct}%
                </div>
              </div>
            </div>

            <div className={styles.evidenceRow}>
              <div className={`${admin.thumb} ${styles.evidenceThumb}`}>
                {item.evidenceName}
              </div>
              <div className={styles.evidenceHint}>클릭 시 원본 확대</div>
            </div>

            <div className={styles.ai}>
              <Collapsible title="AI 분석 리포트" ops>
                {item.aiReport.map((line) => (
                  <div key={line}>· {line}</div>
                ))}
                <div className={styles.aiScore}>
                  사업성 {item.aiScore}/100{' '}
                  <span className={styles.aiScoreNote}>· 참고용</span>
                </div>
              </Collapsible>
            </div>

            {noteOpen && (
              <textarea
                className={styles.note}
                rows={3}
                placeholder="보류 사유와 보완 요청 사항 입력"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            )}

            <div className={styles.actions}>
              <Button size="sm" onClick={() => setPassModal(true)}>
                통과
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void hold()}>
                {noteOpen ? '보류 처리' : '보류 + 피드백'}
              </Button>
              {noteOpen && (
                <Button variant="quiet" size="sm" onClick={() => setNoteOpen(false)}>
                  취소
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>

      <Modal open={passModal} onClose={() => setPassModal(false)} ops>
        <ModalTitle>통과 처리 확인</ModalTitle>
        <ModalBody>
          통과 처리 시 해당 팀의 다음 스테이지 잠금 해제 및 결과 메일 발송
        </ModalBody>
        <ModalActions>
          <Button size="sm" onClick={() => void confirmPass()}>
            통과 처리
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setPassModal(false)}>
            취소
          </Button>
        </ModalActions>
      </Modal>
    </div>
  );
}
