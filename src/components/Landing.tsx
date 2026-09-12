"use client";

import { Children, cloneElement, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";

import { Badge } from "./Badge";
import { ClauseFit } from "./ClauseFit";
import { Clauses } from "./Clauses";
import { Card } from "./Surface";
import { Button } from "./Button";
import ConsentFields, {
  EMPTY_CONSENT,
  focusFirstMissingConsent,
  isConsentComplete,
  type ConsentState,
} from "./ConsentFields";
import { Input } from "./Field";
import { Footer } from "./Footer";
import { Glitch } from "./Glitch";
import { NavBar } from "./NavBar";
import { Toast, useToast } from "./Toast";
import Turnstile, { turnstileEnabled } from "./Turnstile";
import styles from "./Landing.module.css";

import {
  COMPARE,
  LANDING_BENEFITS,
  LANDING_CRITERIA,
  LANDING_FAQ,
  LANDING_SPEC,
  LANDING_WHY,
  MARQUEE,
  ROADMAP,
} from "@/content/landing";

/*
  랜딩 — 시안 v2.1의 「랜딩(배포본 정적 재현)」을 그대로 옮긴 것.

  구조는 시안 순서 그대로다:
    히어로(왼쪽 카피+폼 / 오른쪽 전광판) → 스탯 4칸 → 마퀴
    → 01 POSITION → 02 HOW IT WORKS → 03 BENEFITS
    → 04 WHY → 05 CRITERIA → 06 FAQ → 파이널

  시안은 정적 목업이라 숫자가 박혀 있다. 우리는 실제 값을 넣는다 — 사전 신청
  수는 DB 집계고, CTA 문구·행선지는 시즌 페이즈가 정한다.

  **없는 데이터를 지어내지 않는다.** 참가팀이 0이므로 전광판은 순위 대신
  「준비 중」을 보여준다(시안도 그렇게 그려 뒀다). 조작 불가능한 지표가 이
  서비스의 상품인데 랜딩에 허구의 실시간 숫자를 띄우면 그 주장이 무너진다.
*/

export interface LandingProps {
  seasonName: string;
  /** 시즌 슬러그. 리더보드·시즌 상세 주소가 전부 여기서 나온다. */
  seasonSlug: string;
  /** 헤더 메뉴를 내보이는가. 판정은 서버의 `navMenuVisible`이 한다 */
  showMenu: boolean;
  seasonTheme: string | null;
  /** 킥오프 시각(ISO). 미정이면 null. */
  startAt: string | null;
  /** 실제 사전 신청자 수 (DB 집계) */
  preRegisterCount: number;
}

/*
  ⚠️ **랜딩의 버튼 셋은 시즌 상태를 따르지 않는다.** 헤더(1439행)·히어로
  (1451행)·파이널(1566행) 모두 시안에 「사전 신청하기」 하나로 그려져 있고,
  분기가 없다. 셋 다 같은 폼을 향한다.

  상태별 셋(`only-pre`·`only-recruit`·`only-racing`)이 있는 곳은 **시즌 상세
  화면**(`#scr-season` 1712행)이다. 한때 그것을 랜딩으로 옮겨 놨었다 —
  2026-09-06에 되돌렸다. `resolveLandingCta`는 시즌 상세(§8)가 쓸 값이라
  season.ts에 그대로 둔다.
*/
const CTA_LABEL = "사전 신청하기";

const cx = (...v: (string | undefined | false)[]) =>
  v.filter(Boolean).join(" ");

/**
 * 스크롤 리빌. 요소가 뷰포트에 들어오면 `.in`을 붙이고 관찰을 끊는다.
 * 한 번 나타난 것을 다시 숨기지 않는다 — 위아래로 스크롤할 때마다 깜빡이면
 * 읽는 사람을 방해한다. 시안의 IntersectionObserver도 unobserve한다.
 */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    /*
      모션 감축은 여기서 안 본다 — CSS의 `@media (prefers-reduced-motion)`가
      `.rv`와 `.rm-stop`을 이미 보이는 상태로 못박는다. JS로 한 번 더 처리하면
      효과 안에서 동기 setState를 하게 되고, 그건 렌더를 한 번 더 돌린다.
    */
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, shown };
}

/**
 * 시안 RVMAP의 한 줄에 해당한다. 방향과 순번 지연을 쓰는 쪽이 정한다.
 *
 * ⚠️ **감싸지 않고 자식에 직접 붙인다.** 시안은 `.rv`를 카드·제목·항목
 * 자체에 얹는다(`['#scr-landing .ld-3 .card','up',100]`). 래퍼를 하나 끼우면
 * 그 래퍼가 그리드 아이템이 되고 안의 카드는 늘어나지 않아서, 내용이 짧은
 * 카드만 키가 작아진다 — 실제로 03 BENEFITS의 2·3번 카드가 그랬다.
 */
function Reveal({
  dir = "up",
  index = 0,
  step = 0,
  children,
}: {
  dir?: "up" | "left" | "right";
  index?: number;
  step?: number;
  children: ReactElement<{ className?: string; style?: CSSProperties }>;
}) {
  const { ref, shown } = useReveal<HTMLElement>();
  const child = Children.only(children);
  return cloneElement(child, {
    ref,
    className: cx(
      styles.rv,
      dir === "left" ? styles.rvL : dir === "right" ? styles.rvR : "",
      shown && styles.in,
      child.props.className,
    ),
    style: {
      ...child.props.style,
      "--d": `${Math.min(index * step, 440)}ms`,
    } as CSSProperties,
  } as Record<string, unknown>);
}

/** 섹션 머리 — 번호·라벨 · 제목 · (있으면) 부제 */
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
      <Reveal>
        <div className={styles.eyebrow}>
          <b>{no}</b>
          {label}
        </div>
      </Reveal>
      <Reveal index={1} step={70}>
        <h2 className={styles.secTitle}>{title}</h2>
      </Reveal>
      {lead ? (
        <Reveal index={2} step={70}>
          <p className={styles.secLead}>
            <Clauses text={lead} />
          </p>
        </Reveal>
      ) : null}
    </>
  );
}

export function Landing({
  seasonName,
  seasonSlug,
  startAt,
  showMenu,
  preRegisterCount,
}: LandingProps) {
  const { message, show } = useToast();

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
  const emailRef = useRef<HTMLInputElement>(null);
  // 낙관적으로 올려 보여준다. 새로고침하면 서버 값으로 정정된다.
  const [count, setCount] = useState(preRegisterCount);

  /* 로드맵은 화면에 들어올 때 선이 그어지고 정거장이 순서대로 올라온다 */
  const { ref: rmRef, shown: rmShown } = useReveal<HTMLDivElement>();

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
    그래서 스크롤과 포커스를 함께 한다.
  */
  const runCta = () => {
    scrollTo("hero");
    /*
      preventScroll이 없으면 브라우저가 포커스 대상으로 즉시 튀어
      방금 시작한 부드러운 스크롤과 충돌한다.
    */
    emailRef.current?.focus({ preventScroll: true });
  };

  /*
    다른 화면에서 「사전 신청하러 가기」로 넘어온 경우 — 지금은 /apply의 모집 전
    안내가 유일하다. 그쪽에서 이미 의사를 밝히고 온 사람이라, 도착해서 폼을
    다시 찾게 하면 한 번 더 일을 시키는 셈이다.

    처리한 뒤 주소를 되돌린다. 남겨두면 새로고침·뒤로가기마다 포커스가 다시
    튀어, 페이지 위쪽을 읽으려던 사람을 계속 아래로 끌어내린다.
  */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("preregister")) return;
    history.replaceState(null, "", window.location.pathname);

    const el = emailRef.current;
    if (!el) return;
    el.scrollIntoView({
      /*
        고정 헤더에 가리지 않으려고 top이 아니라 center로 놓는다.
        헤더 높이를 상수로 빼면 그 값이 바뀔 때마다 여기가 같이 틀어진다.
      */
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    el.focus({ preventScroll: true });
  }, []);

  const onPreRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;

    /*
      버튼을 `disabled`로 잠그지 않고 여기서 막는다. disabled인 버튼은 클릭
      이벤트 자체가 발생하지 않아서, 눌러도 아무 일이 없고 왜 안 되는지 알려줄
      수 없다. 미동의 접수는 서버(`/api/v1/leads`)가 한 번 더 막는다.
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
      const res = await fetch("/api/v1/leads", {
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
      /* 실패 문구는 봉투의 error.message에 있다(명세서 §0.2) */
      const body = (await res.json().catch(() => null)) as
        { ok: true } | { ok: false; error?: { message?: string } } | null;
      if (!body?.ok) {
        const msg =
          (body && "error" in body ? body.error?.message : null) ??
          "신청에 실패했어요. 잠시 후 다시 시도해주세요.";
        show(msg);
        // 실패해도 토큰은 이미 소모됐다. 새로 받지 않으면 다시 눌러도 계속 막힌다.
        setBotReset((n) => n + 1);
        return;
      }
      setEmail("");
      // 동의도 함께 비운다. 남겨두면 다음 사람이 체크된 화면을 보게 되고,
      // 그건 「자유로운 의사에 따른 결정」(D1 ①)이 아니다.
      setConsent(EMPTY_CONSENT);
      setBotReset((n) => n + 1);
      setCount((n) => n + 1);
      show("✓ 사전 신청 완료! 시즌 소식을 보내드릴게요.");
    } catch {
      show("네트워크 오류예요. 연결을 확인해주세요.");
    } finally {
      setPending(false);
    }
  };


  /*
    히어로 배지의 개막일. 시안은 「시즌 1, 2026.09.28 개막」이다.

    ⚠️ **「일정 확정 중」을 하드코딩하고 있었다.** `startAt`을 props로 받아
    놓고 쓰지 않아, 개막일이 DB에 들어와도 화면은 계속 미정이라고 말했다.
    ver1 피드백이 짚은 바로 그 손해다 — 없는 것을 약속하는 것과 반대로,
    **정해진 것을 안 정해진 것처럼 보이게 해서 신청을 미루게 만든다.**

    값이 정말 없을 때만 「일정 확정 중」으로 떨어진다.
  */
  const openingLabel = startAt
    ? `${new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .format(new Date(startAt))
        .replace(/\. /g, ".")
        .replace(/\.$/, "")} 개막`
    : "일정 확정 중";

  /* 시안의 스탯 4칸. 앞 셋은 고정값이고 마지막만 DB에서 온다 */
  const stats = [
    { value: "20~40", unit: "팀", label: "모집 규모" },
    { value: "1~2", unit: "인", label: "팀 구성" },
    { value: "₩0", unit: "", label: "참가비" },
    { value: count.toLocaleString("ko-KR"), unit: "명", label: "사전 신청" },
  ];

  return (
    <div className="page">
      {/*
        이동 대신 폼으로 스크롤한다 — 같은 문서 안이라 주소만 갈면 아무 일도
        안 일어난 것처럼 보인다. `href`는 자바스크립트가 죽었을 때의 대비다.
      */}
      <NavBar
        glitchLogo
        leaderboardHref={`/seasons/${seasonSlug}/leaderboard`}
        showMenu={showMenu}
        cta={{ href: "/?preregister=1", label: CTA_LABEL, onClick: runCta }}
      />

      <div className={`${styles.ld} grow`}>
        {/* ═══════ 히어로 ═══════ */}
        <div className={styles.hero} id="hero">
          <div>
            <Reveal>
              <Badge tone="lime" className={styles.cur}>
                {seasonName}, {openingLabel}
              </Badge>
            </Reveal>
            <Reveal index={1} step={70}>
              <h1 className={styles.title}>
                말이 아니라,
                <br />
                <Glitch text="지표로 증명하라" />
              </h1>
            </Reveal>
            <Reveal index={2} step={70}>
              <p className={styles.sub}>
                <Clauses text="아이디어를 실제 유저와 매출 데이터로 바꾸는 AI 빌드 리그예요. 코딩 경험이 없어도 괜찮아요." />
              </p>
            </Reveal>
            <Reveal index={3} step={70}>
              <div className={styles.ctas}>
                <Button size="lg" className={styles.btnPrimary} onClick={runCta}>
                  {CTA_LABEL}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => scrollTo("how")}
                >
                  작동 방식 보기
                </Button>
              </div>
            </Reveal>

            <Reveal index={4} step={70}>
              <form className={styles.form} onSubmit={onPreRegister} noValidate>
                <div className={styles.formHead}>시즌 소식 받기</div>
                {/*
                  ⚠️ ver3가 순서를 뒤집었다 — 동의가 이메일 **앞**이다.
                  ver2는 「이메일+신청 → 동의」였다. 무엇에 동의하는지 읽기 전에
                  주소부터 적게 하지 않겠다는 뜻으로 읽힌다. DOM 순서가 곧 탭
                  순서라 이 자리를 바꾸는 것은 모양이 아니라 흐름의 변경이다.
                */}
                <ConsentFields
                  selectAll
                  className={styles.formConsents}
                  value={consent}
                  onChange={setConsent}
                  disabled={pending}
                  showMissing={showMissingConsent}
                />
                <div className={styles.formRow}>
                  <Input
                    ref={emailRef}
                    id="preregister"
                    type="email"
                    placeholder="이메일 주소"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={pending}
                  />
                  <Button type="submit" disabled={pending}>
                    {pending ? "보내는 중" : "신청"}
                  </Button>
                </div>
                {turnstileEnabled ? (
                  <Turnstile
                    resetSignal={botReset}
                    onToken={setBotToken}
                    onError={() => setBotFailed(true)}
                  />
                ) : null}
              </form>
            </Reveal>
          </div>

          {/* 라이브 전광판. 참가팀이 0이라 순위 대신 「준비 중」이다 */}
          <Reveal dir="right">
            <div className={styles.live}>
              <div className={styles.liveCap}>
                <span className={styles.cur}>LIVE LEADERBOARD</span>
                <Badge tone="gray">준비 중</Badge>
              </div>
              {[1, 2, 3].map((rank) => (
                <div className={styles.slot} key={rank}>
                  <span className={styles.slotRank}>{rank}</span>
                  <span className={styles.slotBar} />
                  <span className={styles.slotScore}>─</span>
                </div>
              ))}
              <p className={styles.liveNote}>
                {seasonName}이 시작되면 참가팀의 유효 이용자 수가 여기에
                실시간으로 표시돼요.
              </p>
            </div>
          </Reveal>
        </div>

        {/* ═══════ 스탯 4칸 ═══════ */}
        <div className={styles.stats}>
          {stats.map((s, i) => (
            <Reveal key={s.label} index={i} step={80}>
              <div className={styles.stat}>
                <span className="score">
                  {s.value}
                  {s.unit ? (
                    <span style={{ fontSize: 16 }}>{s.unit}</span>
                  ) : null}
                </span>
                <small>{s.label}</small>
              </div>
            </Reveal>
          ))}
        </div>

        {/* ═══════ 마퀴 전광판 ═══════ */}
        <Reveal>
          <div className={styles.mq} aria-hidden="true">
            {/* 목록을 두 번 이어 붙인다 — translateX(-50%)로 이음매 없이 돈다 */}
            <div className={styles.mqTrack}>
              {[...MARQUEE, ...MARQUEE].map((text, i) => (
                <span key={i}>
                  {text === "PROO✓IT" ? (
                    <>
                      PROO<em>✓</em>IT
                    </>
                  ) : (
                    text
                  )}
                </span>
              ))}
            </div>
          </div>
        </Reveal>

        {/* ═══════ 01 POSITION ═══════ */}
        <div className={styles.sec}>
          <SectionHead
            no="01"
            label="POSITION"
            title="하루짜리 해커톤이 아니에요"
          />
          <div className={styles.cmp}>
            <Reveal dir="left">
              <Card className={styles.cmpCard} style={{ padding: 24 }}>
                <h3>기존 해커톤</h3>
                <ul>
                  {COMPARE.hackathon.map((item) => (
                    <li key={item}>
                      <b>-</b> {item}
                    </li>
                  ))}
                </ul>
              </Card>
            </Reveal>
            <Reveal dir="right" index={1} step={110}>
              <Card
                className={cx(styles.pv, styles.cmpCard)}
                style={{ padding: 24 }}
              >
                <h3>PROOVIT</h3>
                <ul>
                  {COMPARE.proovit.map((item) => (
                    <li key={item}>
                      <b>✓</b> {item}
                    </li>
                  ))}
                </ul>
              </Card>
            </Reveal>
          </div>
        </div>

        {/* ═══════ 02 HOW IT WORKS ═══════ */}
        <div className={styles.sec} id="how">
          <SectionHead
            no="02"
            label="HOW IT WORKS"
            title="작동 방식"
            lead="다섯 개의 체크포인트. 트랙은 하나예요."
          />
          <div className={styles.rmWrap}>
            <div ref={rmRef} className={cx(styles.rm, rmShown && styles.in)}>
              <div className={styles.rmLine} />
              <i className={styles.rmFill} />
              <span className={styles.rmRun} />
              <div className={styles.rmGrid}>
                {ROADMAP.map((stop, i) => (
                  <div
                    key={stop.key}
                    className={cx(styles.rmStop, stop.gate && styles.gate)}
                    style={{ "--i": i } as CSSProperties}
                  >
                    {/* 게이트 노드는 45도 돌아가므로 글자를 span으로 되돌린다 */}
                    <div className={styles.rmNode}>
                      {stop.gate ? <span>{stop.key}</span> : stop.key}
                    </div>
                    <div className={styles.rmT}>{stop.label}</div>
                    <div className={styles.rmW}>{stop.when}</div>
                    <p className={styles.rmD}>
                      <Clauses text={stop.desc} />
                    </p>
                  </div>
                ))}
              </div>
              <div className={styles.rmLegend}>
                <i />
                심사 게이트, 통과 시 다음 단계
              </div>
            </div>
          </div>
        </div>

        {/* ═══════ 03 BENEFITS ═══════ */}
        <div className={styles.sec}>
          <SectionHead
            no="03"
            label="BENEFITS"
            title="참가하면 이런 걸 받아요"
          />
          <div className={styles.three}>
            {LANDING_BENEFITS.map((b, i) => (
              <Reveal key={b.no} index={i} step={100}>
                <Card>
                  <span className={styles.threeNo}>{b.no}</span>
                  <h4>{b.title}</h4>
                  <p>
                    <Clauses text={b.desc} />
                  </p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>

        {/* ═══════ 04 WHY ═══════ */}
        <div className={styles.sec}>
          <SectionHead
            no="04"
            label="WHY"
            title={
              <>
                왜 PROO<span style={{ color: "var(--accent)" }}>✓</span>IT인가
              </>
            }
          />
          <div className={styles.three}>
            {LANDING_WHY.map((w, i) => (
              <Reveal key={w.no} index={i} step={100}>
                <Card>
                  <span className={styles.threeNo}>{w.no}</span>
                  <h4>{w.title}</h4>
                  <p>
                    <Clauses text={w.desc} />
                  </p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>

        {/* ═══════ 05 CRITERIA ═══════ */}
        <div className={styles.sec}>
          <SectionHead
            no="05"
            label="CRITERIA"
            title="심사 기준 공개"
            lead="평가 항목은 처음부터 공개돼요. 1차는 항목과 기준을, 2차는 산식과 배점까지 전부 공개해요."
          />
          <div className={styles.crit}>
            {LANDING_CRITERIA.map((c, i) => (
              <Reveal
                key={c.round}
                dir={i % 2 ? "right" : "left"}
                index={i}
                step={110}
              >
                <Card>
                  <div className={styles.critRound}>{c.round}</div>
                  <h4>{c.title}</h4>
                  <ul>
                    {c.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </Card>
              </Reveal>
            ))}
          </div>
          <div className={styles.spec}>
            {LANDING_SPEC.map((s, i) => (
              <Reveal key={s.label} index={i} step={70}>
                <div>
                  <small>{s.label}</small>
                  <b>{s.value}</b>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        {/* ═══════ 06 FAQ ═══════ */}
        <div className={styles.sec}>
          <SectionHead no="06" label="FAQ" title="자주 묻는 질문" />
          <div className={styles.faq}>
            {LANDING_FAQ.map((f, i) => (
              <Reveal key={f.q} index={i} step={60}>
                {/* 시안은 첫 항목만 펼쳐 둔다 — 여는 방법을 한 번 보여주는 것이다 */}
                <details open={i === 0}>
                  <summary>{f.q}</summary>
                  <p className={styles.a}>
                    <Clauses text={f.a} />
                  </p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>

        {/* ═══════ 파이널 ═══════ */}
        <div className={styles.fin}>
          <Reveal>
            <h2 className={styles.finTitle}>
              우리는 지식을 팔지 않습니다.
              <br />
              <Glitch text="증명의 무대를 팝니다." />
            </h2>
          </Reveal>
          <Reveal index={1} step={90}>
            <Button
              className={styles.btnPrimary}
              style={{ padding: "14px 30px", fontSize: 15 }}
              onClick={runCta}
            >
              {CTA_LABEL}
            </Button>
          </Reveal>
        </div>
      </div>

      <Footer />
      <Toast message={message} />
      <ClauseFit />
    </div>
  );
}
