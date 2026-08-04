import { useState } from 'react';
import { api } from '@/api';
import { Badge, Button, OpsNavBar } from '@/components';
import { METRICS_SUMMARY } from '@/mocks';
import { useAppStore } from '@/store/useAppStore';
import { formatDelta, formatNumber } from '@/utils/format';
import admin from './admin.module.css';
import styles from './AdminMetricsPage.module.css';

export default function AdminMetricsPage() {
  const { metrics, entries, confirmMetric } = useAppStore();
  const [tipId, setTipId] = useState<string | null>(null);
  const [zoomId, setZoomId] = useState<string | null>(null);

  const localConfirmed = metrics.filter((m) => m.status === 'CONFIRMED').length;
  const confirmedCount = METRICS_SUMMARY.confirmedBase + localConfirmed - 1;
  const pendingCount = METRICS_SUMMARY.weeklySubmitted - confirmedCount;

  const entryOf = (id: string) => entries.find((e) => e.id === id);

  const requestRaw = async (metricId: string) => {
    await api.requestRawEvidence(metricId);
    setTipId(metricId);
    window.setTimeout(() => setTipId((cur) => (cur === metricId ? null : cur)), 2400);
  };

  const zoomTeam = zoomId
    ? entryOf(metrics.find((m) => m.id === zoomId)?.entryId ?? '')?.teamName
    : '';

  return (
    <div className="page page--ops">
      <OpsNavBar />
      <main className={admin.main}>
        <div className={admin.chips}>
          <span className={admin.chip}>
            이번 주 제출 {METRICS_SUMMARY.weeklySubmitted}건
          </span>
          <span className={`${admin.chip} ${admin.chipLime}`}>확정 {confirmedCount}건</span>
          <span className={`${admin.chip} ${admin.chipWarn}`}>대기 {pendingCount}건</span>
        </div>

        <div className={admin.panel}>
          <div className={admin.scroller}>
            <div className={styles.grid}>
              <div className={styles.head}>
                <div>팀</div>
                <div>주차</div>
                <div style={{ textAlign: 'right' }}>유효 가입자</div>
                <div style={{ textAlign: 'right' }}>증가율</div>
                <div>증빙</div>
                <div>상태</div>
                <div>처리</div>
              </div>
              {metrics.map((metric) => {
                const entry = entryOf(metric.entryId);
                const confirmed = metric.status === 'CONFIRMED';
                return (
                  <div
                    key={metric.id}
                    className={[styles.row, confirmed ? styles.rowConfirmed : ''].join(' ')}
                  >
                    <div>
                      <div className={styles.team}>{entry?.teamName}</div>
                      <div className={styles.service}>{entry?.serviceName}</div>
                    </div>
                    <div className={styles.week}>{metric.week}</div>
                    <div className={styles.users}>{formatNumber(metric.validUsers)}</div>
                    <div
                      className={[
                        styles.delta,
                        metric.deltaPct < 0 ? styles.deltaDown : '',
                      ].join(' ')}
                    >
                      {formatDelta(metric.deltaPct)}
                    </div>
                    <div>
                      <button
                        className={`${admin.thumb} ${styles.evidence}`}
                        onClick={() => setZoomId(metric.id)}
                      >
                        {metric.evidenceName}
                      </button>
                    </div>
                    <div>
                      {confirmed ? (
                        <Badge tone="lime">✓ 확정됨</Badge>
                      ) : (
                        <Badge tone="neutral">대기</Badge>
                      )}
                    </div>
                    <div className={styles.actions}>
                      {confirmed ? (
                        <span className={styles.reflected}>리더보드에 반영됨</span>
                      ) : (
                        <>
                          <Button size="sm" onClick={() => void confirmMetric(metric.id)}>
                            확정
                          </Button>
                          <span className={styles.tipWrap}>
                            <button
                              className={styles.request}
                              onClick={() => void requestRaw(metric.id)}
                            >
                              원본 요청
                            </button>
                            {tipId === metric.id && (
                              <span className={styles.tip}>
                                GA4 뷰어 초대 요청 메일 발송
                              </span>
                            )}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {zoomId && (
        <div
          className={styles.zoomOverlay}
          onClick={() => setZoomId(null)}
          role="presentation"
        >
          <div className={styles.zoomBox}>
            <div className={styles.zoomTitle}>{zoomTeam} · GA4 증빙 원본</div>
            <div className={styles.zoomHint}>클릭하면 닫혀요</div>
          </div>
        </div>
      )}
    </div>
  );
}
