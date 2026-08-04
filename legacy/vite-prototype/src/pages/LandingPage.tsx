import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api';
import {
  Accordion,
  Badge,
  Button,
  Footer,
  InfoStrip,
  NavBar,
  Sparkline,
  StageTrack,
  StatCounter,
  Ticker,
  Toast,
  useToast,
  type StatItem,
} from '@/components';
import { useCountdown } from '@/hooks/useCountdown';
import { useCountUp } from '@/hooks/useCountUp';
import { useInView } from '@/hooks/useInView';
import { useLiveScores } from '@/hooks/useLiveScores';
import {
  COMPARE,
  LANDING_BENEFITS,
  LANDING_CRITERIA,
  LANDING_FAQ,
  LANDING_WHY,
} from '@/mocks';
import { useAppStore } from '@/store/useAppStore';
import type { Entry } from '@/types';
import { formatNumber } from '@/utils/format';
import styles from './LandingPage.module.css';

function Fade({ children, className }: { children: ReactNode; className?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.12);
  return (
    <div
      ref={ref}
      className={[styles.fade, inView ? styles.fadeIn : '', className ?? ''].join(' ')}
    >
      {children}
    </div>
  );
}

function BoardRow({
  entry,
  rank,
  score,
  rolling,
  delay,
}: {
  entry: Entry;
  rank: number;
  score: number;
  rolling: boolean;
  delay: number;
}) {
  const counted = useCountUp(score, 1500);
  return (
    <div className={styles.boardRow}>
      <div className={styles.boardRank}>{rank}</div>
      <div>
        <div className={styles.boardName}>{entry.serviceName}</div>
        <div style={{ marginTop: 4 }}>
          <Badge tone="lime">✓ 검증됨</Badge>
        </div>
      </div>
      <Sparkline values={entry.spark} delaySec={delay} />
      <div
        className={[styles.boardScore, rolling ? styles.boardScoreRoll : ''].join(' ')}
      >
        {formatNumber(counted)}
      </div>
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { season, entries, ticker } = useAppStore();
  const { message, show } = useToast();

  const kickoff = useCountdown(season.kickoffAt);
  const top3 = entries.slice(0, 3);
  const { scores, rollIndex } = useLiveScores(top3.map((e) => e.validUsers));

  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  // "작동 방식" 트랙 — 스크롤 진행도
  const howRef = useRef<HTMLDivElement>(null);
  const [trackFill, setTrackFill] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const el = howRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.max(0, Math.min(1, (vh * 0.8 - rect.top) / (vh * 0.55)));
      setTrackFill(p);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id: string, focusEmail = false) => {
    const el = document.getElementById(id);
    if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 84 });
    if (focusEmail) window.setTimeout(() => emailRef.current?.focus(), 500);
  };

  /** 시즌 상태에 따른 메인 CTA 분기 */
  const cta =
    season.status === 'RECRUITING'
      ? { label: '참가 신청하기', run: () => navigate('/apply') }
      : season.status === 'IN_PROGRESS' || season.status === 'ENDED'
        ? { label: '리더보드 보기', run: () => navigate('/leaderboard') }
        : { label: '사전 신청하기', run: () => scrollTo('hero', true) };

  const onPreRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.preRegister(email);
    setEmail('');
    setSubmitted(true);
    show('✓ 사전 신청 완료! 시즌 소식을 보내드릴게요.');
    window.setTimeout(() => setSubmitted(false), 2800);
  };

  const stats: StatItem[] = [
    {
      label: '총 상금',
      value: season.prizePoolKRW,
      format: (v) => `₩${v.toLocaleString('ko-KR')}`,
    },
    { label: '모집 규모', text: season.recruitLabel },
    { label: '참가비', text: '₩0' },
    { label: '사전 신청', value: season.preRegisterCount, format: (v) => `${v}명` },
  ];

  return (
    <div className="page">
      <NavBar />

      <section id="hero" className={styles.hero}>
        <div>
          <div className={styles.pill}>
            <span className="dot" style={{ width: 7, height: 7 }} />
            SEASON {season.number} · 킥오프 D-{kickoff.days}
            <span className={styles.pillClock}>{kickoff.clock}</span>
          </div>
          <h1 className={styles.title}>
            말이 아니라,
            <br />
            지표로 증명하라
          </h1>
          <p className={styles.lead}>
            아이디어를 6주 만에 실제 유저와 매출 데이터로 바꾸는 AI 빌드 리그예요. 코딩 경험이
            없어도 괜찮아요.
          </p>
          <div className={styles.ctaRow}>
            <Button size="lg" onClick={cta.run}>
              {cta.label}
            </Button>
            <Button size="lg" variant="ghost" onClick={() => scrollTo('how')}>
              작동 방식 보기
            </Button>
          </div>
          <form className={styles.emailForm} onSubmit={onPreRegister}>
            <input
              ref={emailRef}
              className={`input ${styles.emailInput}`}
              type="email"
              required
              placeholder="이메일 주소"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" variant="soft" size="lg" style={{ minWidth: 118 }}>
              {submitted ? (
                <svg width="20" height="20" viewBox="0 0 20 20" aria-label="완료">
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
              ) : (
                '시즌 소식 받기'
              )}
            </Button>
          </form>
        </div>

        <div className={styles.board}>
          <div className={styles.boardHead}>
            <div className={styles.boardTitle}>LIVE LEADERBOARD</div>
            <div className={styles.live}>
              <span className={styles.liveDot} />
              LIVE
            </div>
          </div>
          {top3.map((entry, i) => (
            <BoardRow
              key={entry.id}
              entry={entry}
              rank={i + 1}
              score={scores[i] ?? entry.validUsers}
              rolling={rollIndex === i}
              delay={0.2 + i * 0.18}
            />
          ))}
          <div className={styles.boardFoot}>단위: 유효 이용자 수</div>
        </div>
      </section>

      <section className={styles.section} style={{ paddingBottom: 'var(--s-6)' }}>
        <StatCounter items={stats} />
      </section>

      <section className={styles.section}>
        <Ticker items={ticker} />
      </section>

      <section className={styles.section}>
        <Fade>
          <h2 className="sectionTitle" style={{ marginBottom: 36 }}>
            하루짜리 해커톤이 아니에요
          </h2>
          <CompareBlock />
        </Fade>
      </section>

      <section id="how" className={styles.section} ref={howRef}>
        <h2 className="sectionTitle">작동 방식</h2>
        <p className="sectionLead">6주, 다섯 개의 체크포인트. 트랙은 하나예요.</p>
        <StageTrack stages={season.stages} fill={trackFill} />
      </section>

      <section className={`${styles.section} ${styles.sectionNarrow}`}>
        <Fade>
          <h2 className="sectionTitle" style={{ marginBottom: 32 }}>
            참가하면 이런 걸 받아요
          </h2>
          <div className={styles.benefitList}>
            {LANDING_BENEFITS.map((b) => (
              <div className={styles.benefit} key={b.title}>
                <span className={styles.benefitMark}>✓</span>
                <div>
                  <strong className={styles.benefitTitle}>{b.title}</strong>
                  <p className={styles.benefitDesc}>{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Fade>
      </section>

      <section className={styles.section}>
        <Fade>
          <h2 className="sectionTitle" style={{ marginBottom: 44 }}>
            왜 PROO<span style={{ color: 'var(--c-lime)' }}>✓</span>IT인가
          </h2>
          <div className={styles.whyGrid}>
            {LANDING_WHY.map((w) => (
              <div className={styles.whyCard} key={w.no}>
                <div className={styles.whyNo}>{w.no}</div>
                <h3 className={styles.whyTitle}>{w.title}</h3>
                <p className={styles.whyDesc}>{w.desc}</p>
              </div>
            ))}
          </div>
        </Fade>
      </section>

      <section className={styles.section}>
        <Fade>
          <h2 className="sectionTitle">심사 기준 공개</h2>
          <p className="sectionLead">기준은 처음부터 전부 공개돼요. 숨겨진 점수는 없어요.</p>
          <div className={styles.twoCol}>
            {LANDING_CRITERIA.map((c) => (
              <div className={styles.whyCard} key={c.round}>
                <div className={styles.criteriaHead}>
                  <span className={styles.criteriaRound}>{c.round}</span>
                  <h3 className={styles.criteriaTitle}>{c.title}</h3>
                </div>
                <div className={styles.criteriaList}>
                  {c.items.map((item) => (
                    <div className={styles.criteriaItem} key={item}>
                      <span style={{ color: 'var(--c-lime)' }}>·</span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20, fontSize: 14 }}>
            <a href="#valid-users">유효 이용자 기준 전문 보기 →</a>
          </div>
        </Fade>
      </section>

      <section id="season" className={styles.section}>
        <Fade>
          <InfoStrip
            items={[
              { label: '팀 구성', value: season.teamSizeLabel },
              { label: '참가비', value: '무료', accent: true },
              { label: '진행 방식', value: '100% 온라인' },
              { label: '시즌 테마', value: season.theme },
            ]}
          />
        </Fade>
      </section>

      <section id="faq" className={`${styles.section} ${styles.sectionNarrow}`}>
        <Fade>
          <h2 className="sectionTitle" style={{ marginBottom: 32 }}>
            자주 묻는 질문
          </h2>
          <Accordion items={LANDING_FAQ} />
        </Fade>
      </section>

      <section className={styles.declare}>
        <h2 className={styles.declareTitle}>
          우리는 지식을 팔지 않습니다.
          <br />
          <span style={{ color: 'var(--c-lime)' }}>증명의 무대</span>를 팝니다.
        </h2>
        <div className={styles.declareCta}>
          <Button size="lg" onClick={cta.run}>
            {cta.label}
          </Button>
        </div>
      </section>

      <Footer />
      <Toast message={message} />
    </div>
  );
}

function CompareBlock() {
  const { ref, inView } = useInView<HTMLDivElement>(0.28);
  return (
    <div className={styles.twoCol} ref={ref}>
      <div
        className={[styles.compareCard, inView ? styles.compareCardOn : ''].join(' ')}
      >
        <div className={styles.compareLabel}>기존 해커톤</div>
        <div className={styles.compareList}>
          {COMPARE.hackathon.map((item) => (
            <div className={styles.compareItem} key={item}>
              <span className={styles.dash}>—</span>
              {item}
            </div>
          ))}
        </div>
      </div>
      <div
        className={[
          styles.compareCard,
          styles.compareCardUs,
          inView ? styles.compareCardUsOn : '',
        ].join(' ')}
      >
        <div className={`${styles.compareLabel} ${styles.compareLabelUs}`}>PROOVIT</div>
        <div className={styles.compareList}>
          {COMPARE.proovit.map((item) => (
            <div
              className={[styles.compareItem, styles.compareItemUs].join(' ')}
              key={item}
            >
              <span className={styles.check}>✓</span>
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
