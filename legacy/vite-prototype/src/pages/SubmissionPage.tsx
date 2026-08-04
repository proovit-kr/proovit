import { useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Button, NavBar, Toast, useToast } from '@/components';
import { useCountdown } from '@/hooks/useCountdown';
import { MY_ENTRY_ID } from '@/mocks';
import { useAppStore } from '@/store/useAppStore';
import { formatConversion } from '@/utils/format';
import { deriveSubmissionStatus, isSubmittableStage } from '@/utils/stage';
import styles from './SubmissionPage.module.css';

export default function SubmissionPage() {
  const { stage } = useParams<{ stage: string }>();
  const { season, submissions, user, passedFirstReview, submitStage } = useAppStore();
  const { message, show } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const submission = submissions.find((s) => s.stage === stage);
  const [landingUrl, setLandingUrl] = useState(submission?.landingUrl ?? '');
  const [visitors, setVisitors] = useState(String(submission?.visitors ?? 492));
  const [signups, setSignups] = useState(String(submission?.signups ?? 61));
  const [summary, setSummary] = useState(submission?.researchSummary ?? '');
  const [fileName, setFileName] = useState(submission?.evidenceFileName ?? '');
  const [done, setDone] = useState(false);

  const cd = useCountdown(submission?.dueAt ?? season.applyCloseAt);

  if (!stage || !isSubmittableStage(stage) || !submission) {
    return <Navigate to="/dashboard" replace />;
  }

  const status = deriveSubmissionStatus(submission, season, passedFirstReview);
  const locked = status === 'LOCKED';

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitStage({
      entryId: user?.entryId ?? MY_ENTRY_ID,
      stage: submission.stage,
      landingUrl,
      visitors: Number(visitors) || 0,
      signups: Number(signups) || 0,
      researchSummary: summary,
      evidenceFileName: fileName || undefined,
    });
    setDone(true);
    show('✓ 제출 완료! 심사 결과는 대시보드에서 확인할 수 있어요');
  };

  const stageNo = season.stages.findIndex((s) => s.key === submission.stage) + 1;

  return (
    <div className="page">
      <NavBar />
      <main className={styles.main}>
        <Link to="/dashboard" className="backLink">
          ← 대시보드로 돌아가기
        </Link>

        <div className={styles.card}>
          <div className={styles.head}>
            <div>
              <div className={styles.stage}>{submission.stage}</div>
              <h1 className={styles.title}>
                스테이지 {stageNo} 제출 — {submission.title}
              </h1>
            </div>
            <div className={styles.deadline}>
              <span className="dot" style={{ width: 6, height: 6 }} />
              마감 D-{cd.days} {cd.clock}
            </div>
          </div>

          {locked ? (
            <div className={styles.locked}>
              아직 잠긴 스테이지예요.{' '}
              {submission.stage === 'S2'
                ? '1차 심사를 통과하면 열려요.'
                : '이전 스테이지 제출 후 열려요.'}{' '}
              (개발 툴바에서 스테이지·1차 심사 통과 여부를 바꾸면 확인할 수 있어요)
            </div>
          ) : (
            <form className={styles.form} onSubmit={onSubmit}>
              <div className="field">
                <label className="label" htmlFor="landing">
                  랜딩페이지 URL
                </label>
                <input
                  id="landing"
                  className="input input--mono"
                  type="url"
                  required
                  placeholder="https://"
                  value={landingUrl}
                  onChange={(e) => setLandingUrl(e.target.value)}
                />
              </div>

              <div className={styles.pair}>
                <div className="field">
                  <label className="label" htmlFor="visitors">
                    방문자 수
                  </label>
                  <input
                    id="visitors"
                    className="input input--mono"
                    type="number"
                    min={0}
                    required
                    value={visitors}
                    onChange={(e) => setVisitors(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor="signups">
                    사전 신청자 수
                  </label>
                  <input
                    id="signups"
                    className="input input--mono"
                    type="number"
                    min={0}
                    required
                    value={signups}
                    onChange={(e) => setSignups(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.conversion}>
                <span className={styles.conversionLabel}>
                  전환율 <span className={styles.conversionAuto}>(자동 계산)</span>
                </span>
                <span className={styles.conversionValue}>
                  {formatConversion(Number(visitors) || 0, Number(signups) || 0)}
                </span>
              </div>

              <div className="field">
                <label className="label" htmlFor="summary">
                  고객 조사 요약
                </label>
                <textarea
                  id="summary"
                  className="textarea"
                  required
                  rows={4}
                  placeholder="인터뷰·설문에서 확인한 핵심 니즈를 정리해 주세요"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                />
              </div>

              <button
                type="button"
                className={[styles.upload, fileName ? styles.uploadFilled : ''].join(' ')}
                onClick={() => fileRef.current?.click()}
              >
                {fileName ? (
                  <>
                    <div className={styles.uploadFile}>✓ {fileName}</div>
                    <div className={styles.uploadHint}>클릭하면 다른 파일로 교체돼요</div>
                  </>
                ) : (
                  <>
                    <div className={styles.uploadTitle}>증빙 스크린샷 업로드</div>
                    <div className={styles.uploadHint}>
                      애널리틱스 원본 화면 · 클릭해서 파일 선택
                    </div>
                  </>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
              />

              {done ? (
                <div className={styles.doneBox}>
                  <svg width="22" height="22" viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      d="M4 10.5 L8.5 15 L16 6"
                      fill="none"
                      stroke="var(--c-lime)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        strokeDasharray: 24,
                        strokeDashoffset: 24,
                        animation: 'drawLine 0.45s ease-out forwards',
                      }}
                    />
                  </svg>
                  <span className={styles.doneText}>제출이 완료됐어요</span>
                </div>
              ) : (
                <Button type="submit" block size="lg">
                  제출하기
                </Button>
              )}

              <p className="hint">마감 전까지 재제출 허용 · 제출 즉시 심사 대기열 등록</p>
            </form>
          )}
        </div>
      </main>
      <Toast message={message} />
    </div>
  );
}
