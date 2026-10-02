"use client";

import Link from "next/link";
import { Children, cloneElement, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";

import { Badge } from "./Badge";
import { ClauseFit } from "./ClauseFit";
import { Clauses } from "./Clauses";
import { Card } from "./Surface";
import { Button, LinkButton } from "./Button";
import ConsentFields, {
  EMPTY_CONSENT,
  focusFirstMissingConsent,
  isConsentComplete,
  type ConsentState,
} from "./ConsentFields";
import { Input } from "./Field";
import { Glitch } from "./Glitch";
import { useCountUp } from "@/hooks/useCountUp";
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
  SAMPLE_BOARD,
} from "@/content/landing";
import {
  fmtMD,
  fmtMDHM,
  nextSeasonLabel,
  type PublicHeaderInput,
} from "@/lib/header-state";

/*
  랜딩 — 시안 v2.1의 「랜딩(배포본 정적 재현)」을 그대로 옮긴 것.

  구조는 시안 순서 그대로다:
    히어로(왼쪽 카피+폼 / 오른쪽 전광판) → 스탯 4칸 → 마퀴
    → 01 POSITION → 02 HOW IT WORKS → 03 BENEFITS
    → 04 WHY → 05 CRITERIA → 06 FAQ → 파이널

  시안은 정적 목업이라 숫자가 박혀 있다. 우리는 실제 값을 넣는다 — 사전 신청
  수는 DB 집계고, CTA 문구·행선지는 시즌 페이즈가 정한다.

  **없는 데이터를 실제인 것처럼 지어내지 않는다.** 진행 중에 스냅샷 순위가 없는
  자리는 빈 슬롯으로 남긴다. 조작 불가능한 지표가 이 서비스의 상품인데 랜딩에
  허구의 실시간 숫자를 띄우면 그 주장이 무너진다.

  시즌이 열리기 전의 전광판만 예외다 — 빈 슬롯 대신 예시 순위를 그리고
  「예시」라고 밝힌다(`SAMPLE_BOARD`, 2026-10-02 수연 결정. 시안은 빈 슬롯이다).
*/

/** 진행 중·시즌 종료 전광판. `page.tsx`의 `loadLive`가 채운다 */
export interface LandingLive {
  /** 지금 스테이지 — 배지 「s4 유저 유입」. 스테이지 행이 없으면 null */
  stage: { key: string; name: string } | null;
  /** 스냅샷 순위 상위 3팀. 집계 전이면 빈 배열. 종료면 최종 순위다 */
  top: { entryId: string; teamName: string; validVisitors: number }[];
  /** 참가팀 수(실격·포기 제외, 리더보드와 같은 기준) */
  teams: number;
  /** 집계 확정 = s5 마감(ISO). 종료 전광판 「11.01 24:00 집계 확정 기준」. 없으면 null */
  finalAt: string | null;
}

export interface LandingProps {
  seasonName: string;
  /**
   * 공개 헤더의 시즌 축(`publicHeaderSeason`). 유저 축은 헤더가 클라이언트에서
   * 채운다 — 이 페이지는 ISR이라 세션을 못 읽는다(NavBar.tsx 머리 주석).
   */
  headerSeason: PublicHeaderInput["season"];
  seasonTheme: string | null;
  /** 킥오프 시각(ISO). 미정이면 null. */
  startAt: string | null;
  /** 실제 사전 신청자 수 (DB 집계) */
  preRegisterCount: number;
  /** 참가 신청 마감 = 레이스 전환 예정 시각(ISO). 일정 행이 없으면 null */
  recruitClosesAt: string | null;
  /** 시즌 종료 = 최종 결과 발표일(ISO). 운영 헤더 「시상 발표」와 같은 값. 미정이면 null */
  endsAt: string | null;
  /** 진행 중·시즌 종료에만 채운다. 그 밖의 상태에서는 null */
  live: LandingLive | null;
  /** 공개 푸터. 서버 컴포넌트라 여기서 import하지 못해 페이지가 만들어 넘긴다 */
  footer: ReactNode;
}

/*
  시즌 상태별 랜딩. 시안 ver4 `#scr-landing`의 STATE 넷(`only-*`)을 따른다 —
  배지·CTA 두 버튼·안내 문장·사전 신청 폼·전광판 캡션·파이널 CTA가 갈린다.
  (ver3까지는 분기가 없어 「사전 신청하기」 하나였다.)

  ⚠️ 버튼 문구는 「사전 신청」·「참가 신청」이다. 시안은 「~하기」인데 QA에서 뗐다
  (2026-10-02 동혁 제안, 수연 결정). 헤더(`header-state.ts`)·시즌 상세·참가 신청
  화면·대시보드의 같은 버튼도 함께 바꿨다 — 한 곳만 되돌리지 않는다.

  넷 다 옮겼다. 아카이브(`arch`)는 시안 랜딩에 상태가 없어 ① 모집 전으로 그려진다.

  ⚠️ **폼이 있는 두 상태(모집 전·종료)의 히어로에는 버튼 줄이 없다.** 시안은 여기에도
  CTA 둘을 두는데(「사전 신청」+「작동 방식 보기」, 「시즌 2 알림 받기」+「최종 결과 보기」),
  첫 버튼이 30px 아래의 폼으로 데려가는 버튼이라 맨 위에서 누르면 화면이 안 움직였고,
  첫 화면에 라임 버튼 셋(헤더·히어로·폼의 「신청」)이 같이 보였다. 첫 버튼을 빼고,
  둘째는 제목 첫 줄 오른쪽의 글자 링크로 옮겼다 — 폼의 오른쪽 끝에 맞춘다
  (2026-10-02 수연 결정, 자리·글자 링크·「트랙 보기」는 동혁 제안).
  헤더와 파이널의 같은 버튼은 그대로다. 폼이 화면을 벗어난 뒤 돌아갈 길이 그 둘이다.
*/

const NUM = new Intl.NumberFormat("ko-KR");

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

/**
 * 전광판 점수. 시안 모션 엔진의 `countUp` — 리빌될 때 0부터 750ms 동안
 * ease-out으로 올라간다. 시안은 두 자리 미만이거나 0이면 세지 않는다.
 * 문자열 하나로 만든다(숫자와 「명」을 나누면 텍스트 노드가 둘이 된다).
 */
function LiveScore({ value, className }: { value: number; className: string }) {
  const { ref, shown } = useReveal<HTMLSpanElement>();
  const shownValue = useCountUp(value, 750, shown && value >= 10);
  return (
    <span ref={ref} className={className}>
      {`${NUM.format(shownValue)}명`}
    </span>
  );
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
  startAt,
  headerSeason,
  preRegisterCount,
  recruitClosesAt,
  endsAt,
  live,
  footer,
}: LandingProps) {
  const { message, show } = useToast();
  const recruiting = headerSeason?.kind === "recruit";
  const racing = headerSeason?.kind === "stage" && live !== null;
  const ended = headerSeason?.kind === "done" && live !== null;
  /* 「시즌 2」. 종료의 알림 받기·소식 받기가 다음 시즌을 부른다 */
  const nextSeason = nextSeasonLabel(seasonName);
  const board = headerSeason ? `/seasons/${headerSeason.slug}/leaderboard` : "/";
  /*
    ⚠️ 리더보드가 꺼진 동안에는 랜딩에서도 그리로 가는 길을 모두 지운다
    (2026-09-20 수연 지시). 진행 중 히어로·파이널 CTA는 「참가팀 로그인」 하나만
    남고(수연 결정), 전광판 안내와 히어로 안내에서도 그 절이 빠진다.
  */
  const boardOn = headerSeason?.flags.leaderboard ?? false;

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
    사전신청 CTA. 헤더의 작은 버튼과 파이널의 큰 버튼이 같이 쓴다.

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
    다른 화면에서 「사전 신청」 버튼으로 넘어온 경우 — 지금은 /apply의 모집 전
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

  /*
    참가 신청 마감. 저장된 값은 레이스로 넘어가는 시각(= 개막, 09.28 00:00)이라
    그대로 적으면 「09.28 마감」「09.27 24:00」이 된다. 시안처럼(「10.04 마감」
    「10.04 23:59」) 마지막으로 신청할 수 있는 1분으로 적는다. 시안의 10.04는
    s1 마감일이라 기획 순서 「모집 마감 → 개막」과 어긋난 시안 날짜다 — 표기
    방식만 따른다(2026-09-26 수연 결정).
  */
  const lastMinute = recruitClosesAt
    ? new Date(new Date(recruitClosesAt).getTime() - 60_000)
    : null;
  const badgeLabel = ended
    ? `${seasonName} 종료${endsAt ? `, ${fmtMD(new Date(endsAt))} 최종 결과 발표` : ""}`
    : racing
    ? `${seasonName} 진행 중${live.stage ? `, ${live.stage.key} ${live.stage.name}` : ""}`
    : recruiting
      ? `${seasonName} 참가 신청 접수 중${lastMinute ? `, ${fmtMD(lastMinute)} 마감` : ""}`
      : `${seasonName}, ${openingLabel}`;

  /* 시안의 스탯 4칸. 앞 셋은 고정값이고 마지막만 DB에서 온다 */
  const stats = [
    { value: "20~40", unit: "팀", label: "모집 규모" },
    { value: "1~2", unit: "인", label: "팀 구성" },
    { value: "₩0", unit: "", label: "참가비" },
    racing || ended
      ? { value: NUM.format(live.teams), unit: "팀", label: "참가팀" }
      : { value: NUM.format(count), unit: "명", label: "사전 신청" },
  ];

  /*
    전광판 세 자리. 막대는 1위 대비 비율이다(시안 731·455·298명 → 100·62·41%).
    진행 중·종료에 순위가 없는 자리는 빈 슬롯으로 둔다 — 셋이 안 차도 지어내지
    않는다. 시즌이 열리기 전에는 예시 순위를 그린다.
  */
  const top = racing || ended ? live.top : SAMPLE_BOARD;
  const lead = top[0]?.validVisitors ?? 0;

  /*
    제목 첫 줄 오른쪽의 글자 링크. 폼이 있는 두 상태에만 있다(머리 주석).
    화살표는 다른 화면으로 갈 때만 단다 — 「트랙 보기」는 같은 문서의 02로 내려갈 뿐이다
    (동혁 제안). 종료의 「최종 결과 보기」를 같은 링크로 옮기고 화살표를 붙인 것은
    그 규칙을 따른 것이다(내가 정함, 수연 확인 대기).
    종료는 리더보드가 꺼져 있으면 갈 곳이 없어 링크도 없다.
  */
  const titleLink = ended ? (
    boardOn ? (
      <Link href={board} className={styles.titleLink}>
        최종 결과 보기 →
      </Link>
    ) : null
  ) : racing || recruiting ? null : (
    <button type="button" className={styles.titleLink} onClick={() => scrollTo("how")}>
      트랙 보기
    </button>
  );
  const title = (
    <h1 className={styles.title}>
      말이 아니라,
      <br />
      <Glitch text="지표로 증명하라" />
    </h1>
  );

  return (
    <div className={`page ${styles.edges}`}>
      {/*
        이동 대신 폼으로 스크롤한다 — 같은 문서 안이라 주소만 갈면 아무 일도
        안 일어난 것처럼 보인다. `href`는 자바스크립트가 죽었을 때의 대비다.
      */}
      <NavBar glitchLogo season={headerSeason} onPreregister={runCta} />

      <div className={`${styles.ld} grow`}>
        {/* ═══════ 히어로 ═══════ */}
        <div className={styles.hero} id="hero">
          <div>
            <Reveal>
              {/* 종료는 회색이고 커서가 없다 — 더 쓰이는 중이 아니다 */}
              {ended ? (
                <Badge tone="gray">{badgeLabel}</Badge>
              ) : (
                <Badge tone="lime" className={styles.cur}>
                  {badgeLabel}
                </Badge>
              )}
            </Reveal>
            <Reveal index={1} step={70}>
              {titleLink ? (
                <div className={styles.titleRow}>
                  {title}
                  {titleLink}
                </div>
              ) : (
                title
              )}
            </Reveal>
            <Reveal index={2} step={70}>
              <p className={styles.sub}>
                <Clauses text="아이디어를 실제 유저와 매출 데이터로 바꾸는 AI 빌드 리그예요. 코딩 경험이 없어도 괜찮아요." />
              </p>
            </Reveal>
            {/* 버튼 줄은 폼이 없는 두 상태에만 있다 — 폼이 있으면 그 폼이 곧 CTA다(머리 주석) */}
            {racing ? (
              <Reveal index={3} step={70}>
                {/* 진행 중은 관전자가 주 대상이고, 두 번째 자리는 참가팀의 진입점이다 */}
                <div className={styles.ctas}>
                  {boardOn ? (
                    <LinkButton size="lg" className={styles.btnPrimary} href={board}>
                      리더보드 보기
                    </LinkButton>
                  ) : null}
                  {/* 안내 문장이 「로그인하면 대시보드로 이동」이라 행선지를 못박는다 */}
                  <LinkButton
                    size="lg"
                    variant={boardOn ? "outline" : undefined}
                    className={boardOn ? undefined : styles.btnPrimary}
                    href="/login?callbackUrl=/dashboard"
                  >
                    참가팀 로그인
                  </LinkButton>
                </div>
              </Reveal>
            ) : recruiting ? (
              <Reveal index={3} step={70}>
                {/* 참가 신청이 로그인을 거치므로 두 번째 자리가 로그인 진입점이다 */}
                <div className={styles.ctas}>
                  <LinkButton size="lg" className={styles.btnPrimary} href="/apply">
                    참가 신청
                  </LinkButton>
                  <LinkButton size="lg" variant="outline" href="/login">
                    로그인
                  </LinkButton>
                </div>
              </Reveal>
            ) : null}

            {racing ? (
              <Reveal index={4} step={70}>
                {/*
                  절 끊기를 쓴다 — 시안은 「처음 / 오셨다면」에서 나뉘는데, 「이동하고,」 뒤에서
                  나뉘게 했다(2026-09-19 수연 결정). 모집 중 안내는 시안 그대로다.
                */}
                <p className={styles.hint}>
                  <Clauses
                    text={`${lastMinute ? `참가 신청은 ${fmtMD(lastMinute)}에 마감됐어요. ` : ""}참가팀은 로그인하면 대시보드로 이동해요.${boardOn ? " 처음 오셨다면 리더보드에서 참가작을 둘러볼 수 있어요." : ""}`}
                  />
                </p>
              </Reveal>
            ) : recruiting ? (
              <Reveal index={4} step={70}>
                {/* 절 끊기(Clauses)를 안 쓴다. 시안과 같은 자리에서 줄이 나뉜다(2026-09-19, 수연이 맡겨 정함) */}
                <p className={styles.hint}>
                  참가 신청은 로그인 뒤 바로 이어져요. 계정이 없으면 소셜 로그인으로
                  10초면 만들어져요.
                  {lastMinute ? ` 마감은 ${fmtMDHM(lastMinute)}예요.` : null}
                </p>
              </Reveal>
            ) : (
            <Reveal index={3} step={70}>
              <form className={styles.form} onSubmit={onPreRegister} noValidate>
                <div className={styles.formHead}>
                  {ended ? `${nextSeason} 소식 받기` : "시즌 소식 받기"}
                </div>
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
            )}
          </div>

          {/* 라이브 전광판. 시즌이 열리기 전에는 예시 순위다 */}
          <Reveal dir="right">
            <div className={styles.live}>
              <div className={styles.liveCap}>
                <span className={styles.cur}>LIVE LEADERBOARD</span>
                {racing ? (
                  <Badge tone="lime">LIVE</Badge>
                ) : (
                  <Badge tone="gray">{ended ? "최종" : "예시"}</Badge>
                )}
              </div>
              {[0, 1, 2].map((i) => {
                const row = top[i];
                return row ? (
                  <div className={cx(styles.slot, styles.slotLive)} key={row.entryId}>
                    <span className={styles.slotRank}>{i + 1}</span>
                    <span className={styles.slotName}>{row.teamName}</span>
                    <span className={styles.slotBar}>
                      <i
                        style={{
                          width: `${lead ? Math.round((row.validVisitors / lead) * 100) : 0}%`,
                        }}
                      />
                    </span>
                    <LiveScore
                      value={row.validVisitors}
                      className={cx("score", styles.slotScore)}
                    />
                  </div>
                ) : (
                  <div className={styles.slot} key={i}>
                    <span className={styles.slotRank}>{i + 1}</span>
                    <span className={styles.slotBar} />
                    <span className={cx("score", styles.slotScore)}>─</span>
                  </div>
                );
              })}
              {ended ? (
                <p className={styles.liveNote}>
                  {`${live.finalAt ? `${fmtMDHM(new Date(live.finalAt))} 집계 확정 기준 ` : ""}최종 순위예요.`}
                </p>
              ) : racing ? (
                <p className={cx(styles.liveNote, boardOn && styles.liveNoteFitLive)}>
                  {/* 한 열로 좁아져 두 줄이 될 때 끝 세 어절이 함께 넘어가게 묶는다 */}
                  유효 이용자 기준, 15분마다 갱신돼요.
                  {boardOn ? (
                    <>
                      {" 전체 순위는 리더보드에서 "}
                      {"볼\u00a0수\u00a0있어요."}
                    </>
                  ) : null}
                </p>
              ) : (
                <p className={cx(styles.liveNote, styles.liveNoteFit)}>
                  {/*
                    칸이 좁으면 첫 문장 뒤에서 끊기고 둘째 문장이 상자째 다음 줄로 간다.
                    `Clauses`를 쓰지 않는다 — 한 줄에 못 들어가는 절은 `ClauseFit`이
                    상자를 벗겨서, 390에서 「…참가팀의 유효 / 이용자 수가…」로 갈라졌다.
                    상자 안에서는 「유효 이용자 수가」와 끝 세 어절이 붙어 다닌다.
                  */}
                  예시 화면이에요.{" "}
                  <span className={styles.liveNoteRest}>
                    {`${seasonName}이 시작되면 참가팀의 유효\u00a0이용자\u00a0수가 여기에\u00a0실시간으로\u00a0표시돼요.`}
                  </span>
                </p>
              )}
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
                  {/* 절 끊기(Clauses)를 안 쓴다. 카드가 한 줄씩 길어져 시안대로 자연 줄바꿈이다(2026-09-19 수연 결정) */}
                  <p>{b.desc}</p>
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
            {ended ? (
              <Button
                className={styles.btnPrimary}
                style={{ padding: "14px 30px", fontSize: 15 }}
                onClick={runCta}
              >
                {`${nextSeason} 알림 받기`}
              </Button>
            ) : racing ? (
              <LinkButton
                className={styles.btnPrimary}
                style={{ padding: "14px 30px", fontSize: 15 }}
                href={boardOn ? board : "/login?callbackUrl=/dashboard"}
              >
                {boardOn ? "리더보드 보기" : "참가팀 로그인"}
              </LinkButton>
            ) : recruiting ? (
              <LinkButton
                className={styles.btnPrimary}
                style={{ padding: "14px 30px", fontSize: 15 }}
                href="/apply"
              >
                참가 신청
              </LinkButton>
            ) : (
              <Button
                className={styles.btnPrimary}
                style={{ padding: "14px 30px", fontSize: 15 }}
                onClick={runCta}
              >
                사전 신청
              </Button>
            )}
          </Reveal>
        </div>
      </div>

      {footer}
      <Toast message={message} />
      <ClauseFit />
    </div>
  );
}
