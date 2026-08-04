import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AnchorButton,
  Badge,
  Button,
  Footer,
  JourneyTrack,
  NavBar,
  PendingBadge,
  Toast,
  useToast,
  VerifiedBadge,
} from '@/components';
import { useCountUp } from '@/hooks/useCountUp';
import { ENTRY_JOURNEY } from '@/mocks';
import { useAppStore } from '@/store/useAppStore';
import { formatDelta, formatNumber } from '@/utils/format';
import styles from './EntryDetailPage.module.css';

export default function EntryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { season, entries } = useAppStore();
  const { message, show } = useToast(2600);

  const entry = entries.find((e) => e.id === id);
  const counted = useCountUp(entry?.validUsers ?? 0, 1400);

  if (!entry) {
    return (
      <div className="page">
        <NavBar />
        <main className={styles.main}>
          <h1 className={styles.name}>참가작을 찾을 수 없어요</h1>
          <p style={{ color: 'var(--c-text-dim)' }}>
            주소를 다시 확인해 주세요.{' '}
            <Link to="/leaderboard">리더보드로 돌아가기 →</Link>
          </p>
        </main>
        <Footer />
      </div>
    );
  }

  const copyEmbed = () => {
    const code = `<a href="https://proovit.kr/s${season.number}/${entry.id}"><img src="https://proovit.kr/badge/s${season.number}.svg" alt="PROOVIT ${season.title} 출품작"></a>`;
    void navigator.clipboard?.writeText(code);
    show('✓ 임베드 코드가 복사됐어요');
  };

  const down = entry.weeklyDeltaPct < 0;

  return (
    <div className="page">
      <NavBar />

      <main className={styles.main}>
        <Link to="/leaderboard" className="backLink">
          ← 리더보드로 돌아가기
        </Link>

        <div className={styles.grid}>
          <div className={styles.profile}>
            <div className={styles.profileHead}>
              <div className={styles.avatar}>{entry.avatarText}</div>
              <div style={{ minWidth: 0 }}>
                <div className={styles.nameRow}>
                  <h1 className={styles.name}>{entry.serviceName}</h1>
                  <Badge tone="limeOutline" pill>
                    {season.title} · 현재 {entry.rank}위
                  </Badge>
                </div>
                <p className={styles.tagline}>{entry.tagline}</p>
                <div className={styles.team}>
                  팀 <strong>{entry.teamName}</strong>
                </div>
              </div>
            </div>
            <div className={styles.visitRow}>
              <AnchorButton
                href={entry.serviceUrl || '#'}
                target="_blank"
                rel="noreferrer"
                size="lg"
              >
                서비스 방문
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <path
                    d="M4 2 H12 V10 M12 2 L3 11"
                    fill="none"
                    stroke="var(--c-bg)"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </AnchorButton>
            </div>
          </div>

          <div className={styles.side}>
            <div className="card">
              <div className={styles.metricHead}>
                <div className={styles.metaLabel}>METRICS</div>
                {entry.verification === 'VERIFIED' ? <VerifiedBadge /> : <PendingBadge />}
              </div>
              <div className={styles.metricBody}>
                <div>
                  <div className={styles.score}>{formatNumber(counted)}</div>
                  <div className={styles.scoreLabel}>유효 가입자</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className={[styles.delta, down ? styles.deltaDown : ''].join(' ')}>
                    {formatDelta(entry.weeklyDeltaPct)}
                  </div>
                  <div className={styles.deltaLabel}>주간 증가</div>
                </div>
              </div>
              <svg
                width="100%"
                height="44"
                viewBox="0 0 220 44"
                preserveAspectRatio="none"
                style={{ display: 'block', marginTop: 16 }}
                aria-hidden="true"
              >
                <polyline
                  points={entry.spark
                    .map(
                      (v, i) =>
                        `${(i * 220) / (entry.spark.length - 1)},${(v / 18) * 44}`,
                    )
                    .join(' ')}
                  fill="none"
                  stroke={down ? 'var(--c-danger)' : 'var(--c-lime)'}
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity="0.85"
                  style={{
                    strokeDasharray: 260,
                    strokeDashoffset: 260,
                    animation: 'drawLine 1.4s ease-out 0.3s forwards',
                  }}
                />
              </svg>
            </div>

            <div className="card">
              <div className={styles.metaLabel}>BADGE</div>
              <div className={styles.badgeChip}>
                <span className={styles.badgeLogo}>
                  PROO<span style={{ color: 'var(--c-lime)' }}>✓</span>IT
                </span>
                <span className={styles.badgeText}>{season.title} 출품작</span>
              </div>
              <Button variant="soft" block onClick={copyEmbed} style={{ marginTop: 14 }}>
                {message ? '복사됨 ✓' : '임베드 코드 복사'}
              </Button>
            </div>
          </div>
        </div>

        <div className={styles.journey}>
          <h2 className={styles.journeyTitle}>시즌 여정</h2>
          <JourneyTrack steps={ENTRY_JOURNEY} />
        </div>

        <div className={styles.cta}>
          <h2 className={styles.ctaTitle}>
            다음 시즌, 당신의 서비스가
            <br />이 자리에 올라올 차례예요
          </h2>
          <div className={styles.ctaBtn}>
            <Button
              size="lg"
              onClick={() =>
                navigate(season.status === 'RECRUITING' ? '/apply' : '/')
              }
            >
              {season.status === 'RECRUITING' ? '참가 신청하기' : '사전 신청하기'}
            </Button>
          </div>
        </div>
      </main>

      <Footer />
      <Toast message={message} />
    </div>
  );
}
