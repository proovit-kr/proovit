"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Accordion } from "./Accordion";
import { Button, LinkButton } from "./Button";
import { Footer } from "./Footer";
import { NavBar } from "./NavBar";
import { StageTrack } from "./StageProgress";
import { InfoStrip, StatCounter, type StatItem } from "./StatCounter";
import { Toast, useToast } from "./Toast";
import styles from "./Landing.module.css";

import {
  COMPARE,
  LANDING_BENEFITS,
  LANDING_CRITERIA,
  LANDING_FAQ,
  LANDING_WHY,
  SEASON_STAGES,
} from "@/content/landing";
import { useCountdown } from "@/hooks/useCountdown";
import { useInView } from "@/hooks/useInView";
import type { LandingCta } from "@/lib/season";

/*
  legacy/vite-prototype/src/pages/LandingPage.tsx 이식본.

  프로토타입과 달라진 점 세 가지 — 전부 "없는 데이터를 지어내지 않는다"는 이유다.
  ① LIVE LEADERBOARD: 참가팀이 0이므로 가짜 순위 대신 준비 중 상태를 보여준다.
     "조작 불가능한 검증 지표"가 이 서비스의 상품인데 랜딩에 허구의 실시간 숫자를
     띄우면 그 주장 자체가 무너진다.
  ② 티커: 실시간 소식 데이터가 없어 통째로 뺐다. legacy에 보존돼 있다.
  ③ 통계: 총 상금(목데이터 300만원)을 뺐다. 아직 확정된 금액이 아니다.
     남긴 값은 전부 문서로 확인되는 것들이고, 사전 신청 수는 실제 DB 집계다.
*/

function Fade({ children, className }: { children: ReactNode; className?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.12);
  return (
    <div
      ref={ref}
      className={[styles.fade, inView ? styles.fadeIn : "", className ?? ""].join(" ")}
    >
      {children}
    </div>
  );
}

function CompareBlock() {
  const { ref, inView } = useInView<HTMLDivElement>(0.28);
  return (
    <div className={styles.twoCol} ref={ref}>
      <div className={[styles.compareCard, inView ? styles.compareCardOn : ""].join(" ")}>
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
          inView ? styles.compareCardUsOn : "",
        ].join(" ")}
      >
        <div className={`${styles.compareLabel} ${styles.compareLabelUs}`}>PROOVIT</div>
        <div className={styles.compareList}>
          {COMPARE.proovit.map((item) => (
            <div className={[styles.compareItem, styles.compareItemUs].join(" ")} key={item}>
              <span className={styles.check}>✓</span>
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 참가팀이 아직 없을 때의 리더보드 자리. 프레임은 유지하고 숫자만 비운다. */
function BoardPlaceholder() {
  return (
    <div className={styles.board}>
      <div className={styles.boardHead}>
        <div className={styles.boardTitle}>LIVE LEADERBOARD</div>
        <div className={styles.live} style={{ color: "var(--c-text-faint)" }}>
          준비 중
        </div>
      </div>
      {[1, 2, 3].map((rank) => (
        <div className={styles.boardRow} key={rank}>
          <div className={styles.boardRank}>{rank}</div>
          <div>
            <div className={styles.boardName} style={{ color: "var(--c-text-ghost)" }}>
              ─
            </div>
          </div>
          <div />
          <div className={styles.boardScore} style={{ color: "var(--c-text-ghost)" }}>
            ─
          </div>
        </div>
      ))}
      <div className={styles.boardFoot}>
        시즌 1이 시작되면 참가팀의 유효 이용자 수가 여기에 실시간으로 표시돼요.
      </div>
    </div>
  );
}

export interface LandingProps {
  seasonName: string;
  seasonTheme: string | null;
  /** 킥오프 시각(ISO). 미정이면 null이고 카운트다운을 숨긴다. */
  startAt: string | null;
  cta: LandingCta;
  /** 실제 사전 신청자 수 (DB 집계) */
  preRegisterCount: number;
}

const CTA_LABEL: Record<LandingCta["kind"], string> = {
  PREREGISTER: "사전 신청하기",
  APPLY: "참가 신청하기",
  LEADERBOARD: "리더보드 보기",
  CLOSED: "지난 시즌 보기",
};

const CTA_HREF: Record<LandingCta["kind"], string> = {
  PREREGISTER: "#hero",
  APPLY: "/apply",
  LEADERBOARD: "/leaderboard",
  CLOSED: "/seasons",
};

export function Landing({
  seasonName,
  seasonTheme,
  startAt,
  cta,
  preRegisterCount,
}: LandingProps) {
  const { message, show } = useToast();
  const kickoff = useCountdown(startAt ?? "");

  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  // 낙관적으로 올려 보여준다. 새로고침하면 서버 값으로 정정된다.
  const [count, setCount] = useState(preRegisterCount);

  // "작동 방식" 트랙 — 스크롤 진행도
  const howRef = useRef<HTMLDivElement>(null);
  const [trackFill, setTrackFill] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const el = howRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      setTrackFill(Math.max(0, Math.min(1, (vh * 0.8 - rect.top) / (vh * 0.55))));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (id: string, focusEmail = false) => {
    const el = document.getElementById(id);
    if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 84 });
    if (focusEmail) window.setTimeout(() => emailRef.current?.focus(), 500);
  };

  const runCta = () => {
    if (cta.kind === "PREREGISTER") scrollTo("hero", true);
  };

  const onPreRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        show(body?.message ?? "신청에 실패했어요. 잠시 후 다시 시도해주세요.");
        return;
      }
      setEmail("");
      setCount((n) => n + 1);
      setSubmitted(true);
      show("✓ 사전 신청 완료! 시즌 소식을 보내드릴게요.");
      window.setTimeout(() => setSubmitted(false), 2800);
    } catch {
      show("네트워크 오류예요. 연결을 확인해주세요.");
    } finally {
      setPending(false);
    }
  };

  const stats: StatItem[] = [
    { label: "모집 규모", text: "20~40팀" },
    { label: "팀 구성", text: "1~2인" },
    { label: "참가비", text: "₩0" },
    { label: "사전 신청", value: count, format: (v) => `${v}명` },
  ];

  const ctaLabel = CTA_LABEL[cta.kind];
  const isScrollCta = cta.kind === "PREREGISTER";

  return (
    <div className="page">
      <NavBar cta={{ href: CTA_HREF[cta.kind], label: ctaLabel }} />

      <section id="hero" className={styles.hero}>
        <div>
          <div className={styles.pill}>
            <span className="dot" style={{ width: 7, height: 7 }} />
            {seasonName.toUpperCase()}
            {startAt ? (
              <>
                {" "}
                · 킥오프 D-{kickoff.days}
                <span className={styles.pillClock}>{kickoff.clock}</span>
              </>
            ) : (
              <> · 일정 확정 중</>
            )}
          </div>
          <h1 className={styles.title}>
            말이 아니라,
            <br />
            지표로 증명하라
          </h1>
          <p className={styles.lead}>
            아이디어를 실제 유저와 매출 데이터로 바꾸는 AI 빌드 리그예요. 코딩 경험이
            없어도 괜찮아요.
          </p>
          <div className={styles.ctaRow}>
            {isScrollCta ? (
              <Button size="lg" onClick={runCta}>
                {ctaLabel}
              </Button>
            ) : (
              <LinkButton size="lg" href={CTA_HREF[cta.kind]}>
                {ctaLabel}
              </LinkButton>
            )}
            <Button size="lg" variant="ghost" onClick={() => scrollTo("how")}>
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
              disabled={pending}
            />
            <Button
              type="submit"
              variant="soft"
              size="lg"
              style={{ minWidth: 118 }}
              disabled={pending}
            >
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
                      animation: "drawLine 0.45s ease-out forwards",
                    }}
                  />
                </svg>
              ) : pending ? (
                "보내는 중…"
              ) : (
                "시즌 소식 받기"
              )}
            </Button>
          </form>
        </div>

        <BoardPlaceholder />
      </section>

      <section className={styles.section} style={{ paddingBottom: "var(--s-6)" }}>
        <StatCounter items={stats} />
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
        <p className="sectionLead">다섯 개의 체크포인트. 트랙은 하나예요.</p>
        <StageTrack stages={SEASON_STAGES} fill={trackFill} />
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
            왜 PROO<span style={{ color: "var(--c-lime)" }}>✓</span>IT인가
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
                      <span style={{ color: "var(--c-lime)" }}>·</span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Fade>
      </section>

      <section id="season" className={styles.section}>
        <Fade>
          <InfoStrip
            items={[
              { label: "팀 구성", value: "1~2인" },
              { label: "참가비", value: "무료", accent: true },
              { label: "진행 방식", value: "100% 온라인" },
              { label: "시즌 테마", value: seasonTheme ?? "자유 주제" },
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
          <span style={{ color: "var(--c-lime)" }}>증명의 무대</span>를 팝니다.
        </h2>
        <div className={styles.declareCta}>
          {isScrollCta ? (
            <Button size="lg" onClick={runCta}>
              {ctaLabel}
            </Button>
          ) : (
            <LinkButton size="lg" href={CTA_HREF[cta.kind]}>
              {ctaLabel}
            </LinkButton>
          )}
        </div>
      </section>

      <Footer />
      <Toast message={message} />
    </div>
  );
}
