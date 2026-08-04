import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Modal,
  NavBar,
  SeasonBanner,
  StageProgress,
  Tabs,
} from '@/components';
import { CREDIT_CODE, GOLDEN_PATH, MY_ENTRY_ID } from '@/mocks';
import { useAppStore } from '@/store/useAppStore';
import type { CreditOffer, StageSubmission, SubmissionStatus } from '@/types';
import { deriveSubmissionStatus, stageIndex } from '@/utils/stage';
import styles from './DashboardPage.module.css';

type TabKey = 'progress' | 'submissions' | 'benefits' | 'peers';

const TABS = [
  { key: 'progress' as const, label: '진행하기' },
  { key: 'submissions' as const, label: '제출 현황' },
  { key: 'benefits' as const, label: '혜택' },
  { key: 'peers' as const, label: '상호 테스터' },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const { season, submissions, offers, peerReviews, entries, user, passedFirstReview, claimCredit } =
    useAppStore();
  const [tab, setTab] = useState<TabKey>('progress');
  const [modalOffer, setModalOffer] = useState<CreditOffer | null>(null);
  const [copied, setCopied] = useState(false);

  const entryId = user?.entryId ?? MY_ENTRY_ID;
  const currentStageIdx = stageIndex(season.currentStage);
  const currentStage = season.stages[currentStageIdx];

  const derived = useMemo(
    () =>
      submissions.map((s) => ({
        ...s,
        status: deriveSubmissionStatus(s, season, passedFirstReview),
      })),
    [submissions, season, passedFirstReview],
  );

  const openSubmission =
    derived.find((s) => s.status === 'NOT_SUBMITTED') ?? derived[0];

  const doneCount = GOLDEN_PATH.steps.filter((s) => s.done).length;
  const percent = Math.round((doneCount / GOLDEN_PATH.steps.length) * 100);

  const openClaim = async (offer: CreditOffer) => {
    await claimCredit(offer.id);
    setCopied(false);
    setModalOffer(offer);
  };

  const copyCode = () => {
    void navigator.clipboard?.writeText(CREDIT_CODE);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const assigned = peerReviews.filter((r) => r.fromEntryId === entryId);
  const received = peerReviews.filter((r) => r.toEntryId === entryId && r.content);
  const entryOf = (id: string) => entries.find((e) => e.id === id);

  return (
    <div className="page">
      <NavBar />
      <SeasonBanner
        season={season}
        countdown={
          currentStage?.dueAt
            ? { label: '제출 마감', targetIso: currentStage.dueAt }
            : undefined
        }
        note={currentStage?.dueAt ? undefined : '제출 없는 스테이지예요'}
      >
        <StageProgress stages={season.stages} currentIndex={currentStageIdx} />
      </SeasonBanner>

      <main className={styles.main}>
        <Tabs items={TABS} value={tab} onChange={setTab} className={styles.tabs} />

        {tab === 'progress' && (
          <div className={styles.progressGrid}>
            <div className={styles.mainCol}>
              <div className={styles.goldenCard}>
                <div className={styles.goldenHead}>
                  <div>
                    <div className={styles.chapter}>{GOLDEN_PATH.chapter}</div>
                    <h2 className={styles.goldenTitle}>{GOLDEN_PATH.title}</h2>
                  </div>
                  <div>
                    <div className={styles.percent}>{percent}%</div>
                    <div className={styles.percentLabel}>진행률</div>
                  </div>
                </div>
                <div className={styles.bar}>
                  <div className={styles.barFill} style={{ width: `${percent}%` }} />
                </div>
                <div className={styles.steps}>
                  {GOLDEN_PATH.steps.map((step) => (
                    <div className={styles.step} key={step.n}>
                      <span
                        className={[
                          styles.stepMark,
                          step.done ? styles.stepMarkDone : '',
                        ].join(' ')}
                      >
                        {step.done ? '✓' : step.n}
                      </span>
                      <span
                        className={[
                          styles.stepLabel,
                          step.done ? styles.stepLabelDone : '',
                        ].join(' ')}
                      >
                        {step.label}
                      </span>
                      {step.kind === 'guide' && (
                        <a href="#guide" className={styles.stepLink}>
                          가이드 열기 →
                        </a>
                      )}
                      {step.kind === 'benefit' && (
                        <button
                          className={styles.stepLink}
                          onClick={() => setTab('benefits')}
                        >
                          혜택 탭 →
                        </button>
                      )}
                      {step.kind === 'submit' && (
                        <Button
                          size="sm"
                          onClick={() =>
                            navigate(
                              `/dashboard/submissions/${openSubmission?.stage ?? 'S1'}`,
                            )
                          }
                        >
                          제출하기
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {!passedFirstReview && (
                <div className={styles.lockedChapter}>
                  <span style={{ fontSize: 20 }}>🔒</span>
                  <div>
                    <div className={styles.lockedTitle}>{GOLDEN_PATH.lockedChapter.title}</div>
                    <div className={styles.lockedHint}>{GOLDEN_PATH.lockedChapter.hint}</div>
                  </div>
                </div>
              )}
            </div>

            <div className={styles.sideCol}>
              <div className="card">
                <div className={styles.panelLabel}>제출 현황</div>
                <div className={styles.panelRow}>
                  <div className={styles.panelName}>
                    {openSubmission?.stage} {openSubmission?.title}
                  </div>
                  <SubmissionBadge status={openSubmission?.status ?? 'LOCKED'} />
                </div>
                <Button
                  block
                  style={{ marginTop: 16 }}
                  disabled={openSubmission?.status === 'LOCKED'}
                  onClick={() =>
                    navigate(`/dashboard/submissions/${openSubmission?.stage ?? 'S1'}`)
                  }
                >
                  제출하기
                </Button>
              </div>

              <div className="card">
                <div className={styles.panelLabel}>혜택</div>
                {offers.slice(0, 1).map((offer) => (
                  <div className={styles.divider} key={offer.id}>
                    <div className={styles.panelRow}>
                      <div className={styles.panelName} style={{ fontSize: 14 }}>
                        {offer.title}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-lime)' }}>
                        발급 가능
                      </span>
                    </div>
                    <Button
                      variant="soft"
                      block
                      style={{ marginTop: 10 }}
                      onClick={() => void openClaim(offer)}
                    >
                      발급받기
                    </Button>
                  </div>
                ))}
                {offers.slice(1, 2).map((offer) => (
                  <div className={styles.lockedOffer} key={offer.id}>
                    <div className={styles.lockedOfferName}>{offer.title}</div>
                    <div className={styles.lockedOfferHint}>{offer.unlockHint}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'submissions' && (
          <div className={styles.cards}>
            {derived.map((submission) => (
              <SubmissionCard
                key={submission.id}
                submission={submission}
                onSubmit={() => navigate(`/dashboard/submissions/${submission.stage}`)}
              />
            ))}
          </div>
        )}

        {tab === 'benefits' && (
          <div>
            <div className={styles.cards}>
              {offers.map((offer) => (
                <div
                  key={offer.id}
                  className={[
                    styles.offerCard,
                    offer.status === 'AVAILABLE' ? styles.offerAvailable : '',
                    offer.status === 'LOCKED' ? styles.offerLocked : '',
                    offer.status === 'NEGOTIATING' ? styles.offerNegotiating : '',
                  ].join(' ')}
                >
                  <div className={styles.subHead}>
                    <div
                      className={[
                        styles.offerLabel,
                        offer.status === 'AVAILABLE' ? styles.offerLabelOn : '',
                      ].join(' ')}
                    >
                      CREDIT
                    </div>
                    {offer.status === 'AVAILABLE' && <Badge tone="lime">발급 가능</Badge>}
                    {offer.status === 'LOCKED' && (
                      <span className={styles.lockedOfferHint}>🔒 잠김</span>
                    )}
                    {offer.status === 'NEGOTIATING' && <Badge tone="neutral">협의 중</Badge>}
                  </div>
                  <h3
                    className={[
                      styles.offerTitle,
                      offer.status === 'AVAILABLE' ? '' : styles.offerTitleOff,
                    ].join(' ')}
                  >
                    {offer.title}
                  </h3>
                  <p className={styles.offerDesc}>{offer.description}</p>
                  {offer.status === 'AVAILABLE' && (
                    <Button
                      block
                      style={{ marginTop: 18 }}
                      onClick={() => void openClaim(offer)}
                    >
                      발급받기
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <p className={styles.offerFoot}>스테이지를 통과할수록 혜택이 열려요.</p>
          </div>
        )}

        {tab === 'peers' && (
          <div className={styles.peer}>
            <h2 className={styles.peerTitle}>이번 주 배정</h2>
            <p className={styles.peerLead}>
              배정 서비스 테스트 및 피드백 작성 의무 · 매주 월요일 갱신
            </p>
            <div className={styles.peerList}>
              {assigned.map((review) => {
                const target = entryOf(review.toEntryId);
                const active = review.status === 'ASSIGNED';
                return (
                  <div
                    key={review.id}
                    className={[
                      styles.peerItem,
                      active ? styles.peerItemActive : '',
                    ].join(' ')}
                  >
                    <div>
                      <div className={styles.peerName}>{target?.serviceName}</div>
                      <div className={styles.peerTeam}>팀 {target?.teamName}</div>
                    </div>
                    {active ? (
                      <div className={styles.peerActions}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/projects/${review.toEntryId}`)}
                        >
                          서비스 열기
                        </Button>
                        <Button size="sm">피드백 작성하기</Button>
                      </div>
                    ) : (
                      <span className={styles.peerDone}>✓ 완료</span>
                    )}
                  </div>
                );
              })}
            </div>

            <h2 className={styles.feedbackTitle}>
              내 서비스가 받은 피드백{' '}
              <span className={styles.feedbackCount}>{received.length}</span>건
            </h2>
            <div className={styles.peerList}>
              {received.map((review) => {
                const from = entryOf(review.fromEntryId);
                const date = review.createdAt
                  ? new Date(review.createdAt)
                  : null;
                return (
                  <div className={styles.feedbackCard} key={review.id}>
                    <div className={styles.feedbackHead}>
                      <div className={styles.feedbackFrom}>
                        {from?.serviceName} · 팀 {from?.teamName}
                      </div>
                      <div className={styles.feedbackDate}>
                        {date ? `${date.getMonth() + 1}/${date.getDate()}` : ''}
                      </div>
                    </div>
                    <p className={styles.feedbackBody}>{review.content}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <Modal open={!!modalOffer} onClose={() => setModalOffer(null)}>
        <div className={styles.modalMark}>✓</div>
        <h3 className={styles.modalTitle}>{modalOffer?.title} 코드가 발급됐어요</h3>
        <p className={styles.modalDesc}>
          아래 코드를 AI 빌더 결제 페이지에 입력하면 1개월 Pro가 적용돼요.
        </p>
        <div className={styles.codeRow}>
          <div className={styles.code}>{CREDIT_CODE}</div>
          <Button onClick={copyCode}>{copied ? '복사됨 ✓' : '복사'}</Button>
        </div>
        <Button variant="quiet" block style={{ marginTop: 16 }} onClick={() => setModalOffer(null)}>
          닫기
        </Button>
      </Modal>
    </div>
  );
}

function SubmissionBadge({ status }: { status: SubmissionStatus }) {
  if (status === 'SUBMITTED') return <Badge tone="lime">심사 대기</Badge>;
  if (status === 'PASSED') return <Badge tone="lime">✓ 통과</Badge>;
  if (status === 'HELD') return <Badge tone="warn">보류</Badge>;
  if (status === 'LOCKED') return <Badge tone="neutral">🔒 잠김</Badge>;
  return <Badge tone="warn">미제출</Badge>;
}

function SubmissionCard({
  submission,
  onSubmit,
}: {
  submission: StageSubmission;
  onSubmit: () => void;
}) {
  const locked = submission.status === 'LOCKED';
  return (
    <div
      className={[
        styles.subCard,
        locked ? styles.subCardLocked : styles.subCardOpen,
      ].join(' ')}
    >
      <div className={styles.subHead}>
        <div
          className={[styles.subStage, locked ? styles.subStageLocked : ''].join(' ')}
        >
          {submission.stage}
        </div>
        <SubmissionBadge status={submission.status} />
      </div>
      <h3 className={[styles.subTitle, locked ? styles.subTitleLocked : ''].join(' ')}>
        {submission.title}
      </h3>
      <p className={styles.subDesc}>
        {locked
          ? submission.stage === 'S2'
            ? '1차 심사 통과 시 열려요.'
            : '이전 스테이지 제출 후 열려요.'
          : submission.requirement}
      </p>
      <div className={[styles.subDue, locked ? styles.subDueLocked : ''].join(' ')}>
        {submission.dueLabel}
      </div>
      {!locked && (
        <div className={styles.subBtn}>
          <Button block onClick={onSubmit}>
            {submission.status === 'SUBMITTED' ? '다시 제출하기' : '제출하기'}
          </Button>
        </div>
      )}
    </div>
  );
}
