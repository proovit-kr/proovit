"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { Accordion } from "./Accordion";
import { Button, LinkButton } from "./Button";
import ConsentFields, {
  EMPTY_CONSENT,
  focusFirstMissingConsent,
  isConsentComplete,
  type ConsentState,
} from "./ConsentFields";
import { Footer } from "./Footer";
import { NavBar } from "./NavBar";
import { StageTrack } from "./StageProgress";
import { InfoStrip, StatCounter, type StatItem } from "./StatCounter";
import { Toast, useToast } from "./Toast";
import Turnstile, { turnstileEnabled } from "./Turnstile";
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

/*
  섹션 머리. 번호 + 라벨을 괘선 위에 얹는 편집물 장치다.
  제목만 반복해서 쌓는 것보다 페이지에 뼈대가 생긴다.
*/
function SectionHead({
  no,
  label,
  title,
  lead,
}: {
  no: string;
  label: string;
  title: ReactNode;
  lead?: string;
}) {
  return (
    <>
      <div className={styles.eyebrow}>
        <span className={styles.eyebrowNo}>{no}</span>
        <span>{label}</span>
        <span className={styles.eyebrowRule} />
      </div>
      <h2 className={styles.headTitle}>{title}</h2>
      {lead ? <p className={styles.headLead}>{lead}</p> : <div className={styles.headGap} />}
    </>
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

/*
  킥오프 카운트다운.

  히어로 우측은 첫 화면에서 가장 눈이 가는 자리인데, 지금은 빈 리더보드 골격이
  들어가 있어 "아직 아무것도 없다"를 강조하고 있다. 킥오프 시각이 정해져 있는
  동안에는 남은 시간을 대신 세운다 — 사전 신청을 받아야 하는 구간이 정확히
  그 구간이기 때문이다.

  숫자를 라임으로 칠하지 않는 이유는 §7이다. 히어로에는 이미 라임 CTA가 있고
  한 화면에 라임을 두 번 세게 쓰지 않는다. 크기와 흰색으로 무게를 준다.
*/
function KickoffPanel({
  kickoff,
  seasonName,
}: {
  kickoff: ReturnType<typeof useCountdown>;
  seasonName: string;
}) {
  /*
    카운트다운은 첫 렌더에 서버와 클라이언트의 값이 다를 수밖에 없다.
    마운트 전에는 자리만 잡아두고, 붙은 뒤에 실제 숫자를 넣는다.
    useEffect + setState 대신 useSyncExternalStore를 쓰는 이유는, 이 값이
    "렌더가 어디서 일어나는가"라는 외부 사실이지 상태 변화가 아니기 때문이다.
  */
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const cells: [string, number][] = [
    ["DAYS", kickoff.days],
    ["HOURS", kickoff.hours],
    ["MINS", kickoff.minutes],
    ["SECS", kickoff.seconds],
  ];

  return (
    <div className={styles.board}>
      <div className={styles.boardHead}>
        <div className={styles.boardTitle}>KICKOFF</div>
        <div className={styles.live} style={{ color: "var(--c-text-faint)" }}>
          {seasonName} 시작까지
        </div>
      </div>

      <div className={styles.countdown}>
        {cells.map(([label, value]) => (
          <div className={styles.countCell} key={label}>
            <div className={styles.countValue}>
              {mounted ? String(value).padStart(2, "0") : "--"}
            </div>
            <div className={styles.countLabel}>{label}</div>
          </div>
        ))}
      </div>

      <div className={styles.boardFoot}>
        사전 신청은 킥오프 전까지 받아요. 시작하면 이 자리에 리더보드가 올라와요.
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
  const [consent, setConsent] = useState<ConsentState>(EMPTY_CONSENT);
  const [botToken, setBotToken] = useState<string | null>(null);
  // 토큰은 1회용이다. 제출할 때마다 올려서 위젯을 새로 받게 한다.
  const [botReset, setBotReset] = useState(0);
  /*
    Turnstile을 `interaction-only`로 띄워서 평소엔 위젯이 화면에 없다.
    실패하면 제출 버튼만 조용히 잠기고 이유를 볼 곳이 없으므로 따로 붙인다.
  */
  const [botFailed, setBotFailed] = useState(false);
  /*
    필수 동의 없이 제출을 눌러봤다. 눌러보기 전에는 켜지 않는다 —
    아직 아무것도 안 한 사람에게 경고부터 띄우는 화면이 되면 안 된다.
  */
  const [showMissingConsent, setShowMissingConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  // CTA를 눌렀을 때 입력란 테두리를 한 번 짚어주는 신호. 애니메이션이 끝나면 스스로 꺼진다.
  const [ping, setPing] = useState(false);

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
      /*
        진행도를 뷰포트 높이만으로 재면 트랙이 길어질수록 어긋난다.
        좁은 화면에서 트랙이 세로로 서면서 높이가 화면보다 커졌고, 그러면
        섹션 머리가 화면에 들어오자마자 다섯 칸이 전부 체크로 바뀌어서
        정작 3~5번을 보기도 전에 채움이 끝나 있었다.

        요소 자신의 높이를 span에 넣어, 위가 화면 85% 지점에 닿을 때 0,
        아래가 40% 지점을 지날 때 1이 되게 한다. 세로든 가로든 같은 식이 통한다.
      */
      const travelled = vh * 0.85 - rect.top;
      const span = rect.height + vh * 0.45;
      setTrackFill(Math.max(0, Math.min(1, travelled / span)));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY - 84,
      // 이동 거리가 짧을 때 순간이동하면 화면이 바뀐 줄 모른다. 움직임 자체가 응답이다.
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };

  /*
    사전신청 CTA. 히어로 안의 큰 버튼과 헤더의 작은 버튼이 같이 쓴다.

    헤더 버튼은 폼이 이미 화면에 보이는 상태에서 눌리는 경우가 많아서,
    스크롤만으로는 거의 아무 일도 일어나지 않아 무응답으로 느껴진다.
    그래서 세 가지를 함께 한다 — 스크롤 · 입력란 포커스 · 테두리 한 번 짚기.
  */
  const runCta = () => {
    if (cta.kind !== "PREREGISTER") return;
    scrollTo("hero");
    /*
      preventScroll이 없으면 브라우저가 포커스 대상으로 즉시 튀어
      방금 시작한 부드러운 스크롤과 충돌한다.
      포커스를 타이머로 미루지 않는 이유는, 클릭 직후에 커서가 보여야
      "눌렸다"는 신호가 되기 때문이다.
    */
    emailRef.current?.focus({ preventScroll: true });
    // 이미 포커스가 있던 경우엔 포커스만으로는 변화가 없다. 그때를 위한 신호다.
    setPing(true);
  };

  /*
    다른 화면에서 "사전 신청하러 가기"로 넘어온 경우 — 지금은 /apply의 모집 전
    안내가 유일하다. 그쪽에서 이미 의사를 밝히고 온 사람이라, 도착해서 폼을
    다시 찾게 하면 한 번 더 일을 시키는 셈이다. 같은 화면 안에서 CTA를 누른
    것과 똑같이 대접한다 — 스크롤 · 포커스 · 테두리 짚기.

    앵커를 입력란 자신(#preregister)에 두는 이유는 JS 없이도 최소한 그 자리로
    가게 하려는 것이다. 아래 효과는 그 위에 얹는 개선이다.

    처리한 뒤 해시를 지운다. 남겨두면 새로고침·뒤로가기마다 포커스가 다시 튀어,
    페이지 위쪽을 읽으려던 사람을 계속 아래로 끌어내린다.
  */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("preregister")) return;
    // 주소를 되돌려 새로고침·뒤로가기마다 화면이 다시 튀지 않게 한다.
    history.replaceState(null, "", window.location.pathname);

    const el = emailRef.current;
    if (!el) return;
    el.scrollIntoView({
      /*
        고정 헤더에 가리지 않으려고 top이 아니라 center로 놓는다.
        헤더 높이를 상수로 빼서 더하는 방법도 있지만, 그 값이 바뀔 때마다
        여기가 같이 틀어진다. 중앙은 헤더 높이를 몰라도 성립한다.
      */
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    el.focus({ preventScroll: true });
    // 이미 포커스가 있던 경우를 위한 신호. runCta와 같은 이유다.
    setPing(true);
    // 최초 도착 1회만 — 이후 상태가 바뀌어도 다시 실행하지 않는다.
  }, []);

  const onPreRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;

    /*
      버튼을 `disabled`로 잠그지 않고 여기서 막는다. disabled인 버튼은 클릭
      이벤트 자체가 발생하지 않아서, 눌러도 아무 일이 없고 왜 안 되는지
      알려줄 수 없다. 눌리게 두고 이유를 말해주는 쪽이 맞다.
      미동의 접수는 서버(`/api/leads`)가 한 번 더 막으므로 방어선은 그대로다.
    */
    if (!isConsentComplete(consent)) {
      setShowMissingConsent(true);
      focusFirstMissingConsent(consent);
      return;
    }
    if (turnstileEnabled && !botToken) {
      show(
        botFailed
          ? "사람 확인에 실패했어요. 새로고침 후 다시 시도해주세요."
          : "사람 확인 중이에요. 잠시 후 다시 눌러주세요.",
      );
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          privacyConsent: consent.privacy,
          ageConfirmed: consent.age,
          marketingOptIn: consent.marketing,
          turnstileToken: botToken ?? undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        show(body?.message ?? "신청에 실패했어요. 잠시 후 다시 시도해주세요.");
        // 실패해도 토큰은 이미 소모됐다. 새로 받지 않으면 다시 눌러도 계속 막힌다.
        setBotReset((n) => n + 1);
        return;
      }
      setEmail("");
      // 동의도 함께 비운다. 남겨두면 다음 사람이 체크된 화면을 보게 되고,
      // 그건 "자유로운 의사에 따른 결정"(D1 ①)이 아니다.
      setConsent(EMPTY_CONSENT);
      setBotReset((n) => n + 1);
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
      <NavBar
        cta={{
          href: CTA_HREF[cta.kind],
          label: ctaLabel,
          // 사전신청은 이 페이지 안에서 처리한다. 나머지는 실제 라우트 이동이다.
          onClick: isScrollCta ? runCta : undefined,
        }}
      />

      <section id="hero" className={styles.hero}>
        <div>
          <div className={styles.pill}>
            <span className="dot" style={{ width: 7, height: 7 }} />
            {seasonName.toUpperCase()}
            {/*
              초 단위 시계는 우측 카운트다운 패널이 이미 보여준다.
              한 화면에서 두 개가 같이 돌아가면 서로 시선을 뺏는다. 여기는 D-N까지만.
            */}
            {startAt ? <> · 킥오프 D-{kickoff.days}</> : <> · 일정 확정 중</>}
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
              className={`input ${styles.emailInput} ${ping ? styles.emailInputPing : ""}`}
              onAnimationEnd={() => setPing(false)}
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
              /*
                미동의 상태에서도 버튼은 눌린다. 잠그면 이유를 말할 자리가
                없어지기 때문이다(onPreRegister 참고). 대신 `aria-disabled`로
                "지금은 진행할 수 없는 상태"임을 보조기기에 알리고,
                흐리게 칠해 눌러도 바로 안 될 것처럼 보이지는 않게 한다.

                `pending`만 진짜 `disabled`다 — 전송 중 두 번 눌리면 안 된다.
              */
              disabled={pending}
              aria-disabled={
                !isConsentComplete(consent) ||
                // 키가 없으면 토큰을 요구하지 않는다 — 도입 전에는 지금과 똑같이 동작한다
                (turnstileEnabled && !botToken)
              }
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

            <ConsentFields
              value={consent}
              onChange={(next) => {
                setConsent(next);
                // 다 채우면 안내를 스스로 거둔다. 고쳤는데도 빨간 줄이 남으면 안 된다
                if (isConsentComplete(next)) setShowMissingConsent(false);
              }}
              disabled={pending}
              showMissing={showMissingConsent}
            />
            {/*
              부모(.emailForm)가 flex-wrap이라 감싸지 않으면 위젯이 입력칸 옆에
              끼어 눌린다. 키가 없는 지금은 아무것도 안 그려져서 티가 안 나므로
              여기서 미리 잡아둔다.
            */}
            <div style={{ flex: "1 0 100%" }}>
              <Turnstile
                onToken={(token) => {
                  setBotToken(token);
                  if (token) setBotFailed(false);
                }}
                onError={() => setBotFailed(true)}
                resetSignal={botReset}
              />
              {botFailed ? (
                <p className={styles.formError} role="alert">
                  사람 확인에 실패했어요. 새로고침 후 다시 시도해 주세요.
                </p>
              ) : null}
            </div>
          </form>
        </div>

        {/* 킥오프가 잡혀 있으면 남은 시간을, 아직이면 리더보드 자리를 보여준다 */}
        {startAt ? (
          <KickoffPanel kickoff={kickoff} seasonName={seasonName} />
        ) : (
          <BoardPlaceholder />
        )}
      </section>

      <section className={styles.section} style={{ paddingBottom: "var(--s-6)" }}>
        <StatCounter items={stats} />
      </section>

      <section className={`${styles.section} ${styles.sectionTight}`}>
        <Fade>
          <SectionHead no="01" label="POSITION" title="하루짜리 해커톤이 아니에요" />
          <CompareBlock />
        </Fade>
      </section>

      <section id="how" className={`${styles.section} ${styles.sectionWide}`} ref={howRef}>
        <SectionHead
          no="02"
          label="HOW IT WORKS"
          title="작동 방식"
          lead="다섯 개의 체크포인트. 트랙은 하나예요."
        />
        <StageTrack stages={SEASON_STAGES} fill={trackFill} />
      </section>

      <section className={styles.section}>
        <Fade>
          <SectionHead no="03" label="BENEFITS" title="참가하면 이런 걸 받아요" />
          <div className={styles.benefitList}>
            {LANDING_BENEFITS.map((b, i) => (
              <div className={styles.benefit} key={b.title}>
                {/* 원형 체크 대신 번호. 항목 수가 적을 때 체크 아이콘은 장식으로만 남는다 */}
                <span className={styles.benefitMark}>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <strong className={styles.benefitTitle}>{b.title}</strong>
                  <p className={styles.benefitDesc}>{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Fade>
      </section>

      <section className={`${styles.section} ${styles.sectionWide}`}>
        <Fade>
          <SectionHead
            no="04"
            label="WHY"
            title={
              <>
                왜 PROO<span style={{ color: "var(--c-lime)" }}>✓</span>IT인가
              </>
            }
          />
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

      <section className={`${styles.section} ${styles.sectionTight}`}>
        <Fade>
          <SectionHead
            no="05"
            label="CRITERIA"
            title="심사 기준 공개"
            lead="기준은 처음부터 전부 공개돼요. 숨겨진 점수는 없어요."
          />
          <div className={styles.twoCol}>
            {LANDING_CRITERIA.map((c) => (
              <div className={styles.criteriaCard} key={c.round}>
                <div className={styles.criteriaHead}>
                  <span className={styles.criteriaRound}>{c.round}</span>
                  <h3 className={styles.criteriaTitle}>{c.title}</h3>
                </div>
                <div className={styles.criteriaList}>
                  {c.items.map((item) => (
                    <div className={styles.criteriaItem} key={item}>
                      <span style={{ color: "var(--c-text-ghost)" }}>—</span>
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

      <section id="faq" className={styles.section}>
        <Fade>
          <SectionHead no="06" label="FAQ" title="자주 묻는 질문" />
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
