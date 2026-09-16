/*
  상태별 헤더의 **판정**. 시안 「PROOVIT 헤더 상태별 시안 v1.0」
  (design/proovit_헤더_상태별_시안.html)의 6장 규칙표를 그대로 옮겼다.

  헤더는 셋이다 — 공개(.pub-head, P1~P11) · 참가자(.db-top, D1~D9) ·
  운영자(.ad-top, A1~A7). 화면은 여기서 내린 모델을 그리기만 하고 판정을
  다시 하지 않는다(dashboard-state.ts와 같은 원칙). 판별 순서는 시안대로
  **유저 역할 → 참가 상태 → 시즌 상태**이고 앞 조건이 뒤 조건을 덮는다.

  이 파일은 순수하다 — DB도 세션도 모른다. 시각도 `now`로 받는다. 그래서
  테스트가 시안의 조합기(MAP) 42칸을 그대로 돌릴 수 있다.

  ⚠️ 시안의 시즌 7단계와 우리 phase 6값은 1:1이 아니다.
    pre     ← pre_apply (draft는 공개 조회에서 이미 걸러진다)
    recruit ← recruiting
    stage · judge · verify ← racing  (게이트 심사·집계는 phase가 아니라
            **팀별 상태**다 — season-phase.ts의 `isGateReview` 삭제 주석 참조.
            공개 헤더는 셋이 같은 모양(P3=P4, P8)이라 갈라 볼 일이 없고,
            참가자·운영자 헤더는 entry.stage와 stages.closes_at으로 가른다)
    done    ← awarded
    arch    ← archived
*/

import {
  EntryStage,
  EntryStatus,
  SeasonPhase,
  StageKey,
} from "@/generated/prisma/enums";

// ═════════════════════════════════════════════════════════════
// 시각 표기. 전부 KST다 — 마감은 한국 시각으로 공지된다.
// ═════════════════════════════════════════════════════════════

const KST = "Asia/Seoul";

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: KST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

type Parts = { y: number; m: number; d: number; hh: number; mm: number };

function kst(date: Date): Parts {
  const p: Record<string, string> = {};
  for (const { type, value } of PARTS.formatToParts(date)) p[type] = value;
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    hh: Number(p.hour),
    mm: Number(p.minute),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 「09.28」 */
export function fmtMD(date: Date): string {
  const { m, d } = kst(date);
  return `${pad(m)}.${pad(d)}`;
}

/**
 * 「10.04 23:59」. 자정은 시안 표기대로 **전날 24:00**으로 적는다
 * (「집계 확정 11.01 24:00」) — 마감이 "11.02 00:00"이면 하루 앞선 것처럼 읽힌다.
 */
export function fmtMDHM(date: Date): string {
  const { hh, mm } = kst(date);
  if (hh === 0 && mm === 0) {
    return `${fmtMD(new Date(date.getTime() - 60_000))} 24:00`;
  }
  return `${fmtMD(date)} ${pad(hh)}:${pad(mm)}`;
}

/** 「23:59」 */
export function fmtHM(date: Date): string {
  const { hh, mm } = kst(date);
  if (hh === 0 && mm === 0) return "24:00";
  return `${pad(hh)}:${pad(mm)}`;
}

/** KST 달력일 차이. 오늘 마감이면 0, 내일이면 1 */
export function dayDiff(now: Date, target: Date): number {
  const a = kst(now), b = kst(target);
  const da = Date.UTC(a.y, a.m - 1, a.d), db = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((db - da) / 86_400_000);
}

/**
 * 「D-4」. 당일은 D-day, 지났으면 「지남」 — 앞에 「마감 10.04, 」가 붙는 자리라
 * 「마감」이라고 쓰면 「마감 10.04, 마감」이 된다. 미제출로 지나면 서버가 곧
 * D7로 넘기므로(h11) 오래 보이는 글자는 아니다.
 */
export function fmtDday(now: Date, target: Date): string {
  if (target.getTime() < now.getTime()) return "지남";
  const n = dayDiff(now, target);
  return n <= 0 ? "D-day" : `D-${n}`;
}

/**
 * 「31시간」. 1시간 미만이면 분으로(시안 D3 노트). 지났으면 「지연」 —
 * SLA를 넘긴 것을 숨기지 않는다.
 */
export function fmtHoursLeft(now: Date, target: Date): string {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return "지연";
  if (ms >= 3_600_000) return `${Math.ceil(ms / 3_600_000)}시간`;
  return `${Math.max(1, Math.ceil(ms / 60_000))}분`;
}

/**
 * 「시즌 1」 → 「시즌 2」. 시안은 「시즌 2 알림 받기」처럼 다음 시즌 이름을
 * 헤더 문구에 박는다. 제목에서 숫자를 못 찾으면 「다음 시즌」으로 쓴다 —
 * 숫자를 지어내지 않는다.
 */
export function nextSeasonLabel(title: string): string {
  const m = title.match(/(\d+)/);
  return m ? title.replace(m[1], String(Number(m[1]) + 1)) : "다음 시즌";
}

/**
 * 전환율(%) — 사전 신청 리드 ÷ 랜딩 방문자, 소수 첫째 자리(시안 A1 「4.2%」).
 * 방문자를 모르거나 0이면 null — 비우지, 0%로 적지 않는다.
 */
export function conversionRate(leads: number, visitors: number | null): number | null {
  if (visitors === null || visitors <= 0) return null;
  return Math.round((leads / visitors) * 1000) / 10;
}

/** 아바타 글자 — 이름 첫 글자(시안 규칙표 「아바타」) */
export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ?? "?";
}

// ═════════════════════════════════════════════════════════════
// 축 둘 — 시즌 상태와 유저 상태
// ═════════════════════════════════════════════════════════════

/** 시안 조합기의 SEASON 축. judge·verify는 공개 헤더에서 stage와 같다 */
export type HeaderSeason = "pre" | "recruit" | "stage" | "done" | "arch";

export function toHeaderSeason(phase: SeasonPhase): HeaderSeason {
  switch (phase) {
    case SeasonPhase.draft:
    case SeasonPhase.pre_apply:
      return "pre";
    case SeasonPhase.recruiting:
      return "recruit";
    case SeasonPhase.racing:
      return "stage";
    case SeasonPhase.awarded:
      return "done";
    case SeasonPhase.archived:
      return "arch";
  }
}

/** 시안 조합기의 USER 축 */
export type HeaderUser =
  | "guest"
  | "member"
  | "entrant"
  | "elim"
  | "dq"
  | "admin";

/**
 * 유저 축. 판별 순서가 곧 우선순위다 — 운영자면 참가 여부를 보지 않는다.
 * `withdrawn`(자진 포기)은 시안에 없어서 탈락과 같게 본다: 둘 다 경쟁에서
 * 빠졌고 관전만 남았다.
 */
export function toHeaderUser(viewer: {
  user: { roles: string[] } | null;
  entry: { status: EntryStatus } | null;
}): HeaderUser {
  if (!viewer.user) return "guest";
  if (viewer.user.roles.includes("admin")) return "admin";
  if (!viewer.entry) return "member";
  switch (viewer.entry.status) {
    case EntryStatus.active:
      return "entrant";
    case EntryStatus.disqualified:
      return "dq";
    case EntryStatus.eliminated:
    case EntryStatus.withdrawn:
      return "elim";
  }
}

/** 헤더가 유저에 대해 알아야 할 전부. 서버(header-read.ts)가 만들거나 `/api/v1/me`에서 만든다 */
export type HeaderViewer = {
  kind: Exclude<HeaderUser, "guest">;
  initial: string;
  unread: number;
};

/** `/api/v1/me` 응답에서 헤더 몫만 뽑는다. 비로그인이면 null */
export function viewerFromMe(data: {
  user: { nickname: string; roles: string[] } | null;
  entry: { status: EntryStatus } | null;
  unread?: number;
}): HeaderViewer | null {
  if (!data.user) return null;
  const kind = toHeaderUser({ user: data.user, entry: data.entry });
  if (kind === "guest") return null;
  return { kind, initial: initialOf(data.user.nickname), unread: data.unread ?? 0 };
}

// ═════════════════════════════════════════════════════════════
// 공개 헤더 — P1~P11
// ═════════════════════════════════════════════════════════════

export type PublicVariant =
  | "P1" | "P2" | "P3" | "P4" | "P5" | "P6"
  | "P7" | "P8" | "P9" | "P10" | "P11";

/** 시안 스크립트의 MAP.pub 그대로. 표가 바뀌면 여기만 고친다 */
const PUB_MAP: Record<HeaderUser, Record<HeaderSeason, PublicVariant>> = {
  guest: { pre: "P1", recruit: "P2", stage: "P3", done: "P5", arch: "P6" },
  member: { pre: "P1", recruit: "P7", stage: "P8", done: "P5", arch: "P6" },
  entrant: { pre: "P1", recruit: "P9", stage: "P9", done: "P9", arch: "P9" },
  elim: { pre: "P1", recruit: "P7", stage: "P10", done: "P10", arch: "P6" },
  dq: { pre: "P1", recruit: "P7", stage: "P10", done: "P10", arch: "P6" },
  admin: { pre: "P11", recruit: "P11", stage: "P11", done: "P11", arch: "P11" },
};

export type NavItem = {
  label: string;
  /** 없으면 예고(`.soon-nav`) — 링크도 포커스도 아니다 */
  href?: string;
  title?: string;
};

export type CtaVariant = "primary" | "outline" | "ghost" | "gray" | "violet";

export type HeaderAction = {
  kind:
    | "preregister"
    | "apply"
    | "leaderboard"
    | "result"
    | "notify"
    | "dashboard"
    | "admin";
  label: string;
  /** ≤760에서 쓰는 짧은 문구(시안 5장 「리더보드」). 없으면 label 그대로 */
  short?: string;
  href: string;
  variant: CtaVariant;
};

export type PublicHeaderModel = {
  variant: PublicVariant;
  nav: NavItem[];
  /** 「로그인」 텍스트 링크 */
  login: boolean;
  /** 왼쪽부터. P5만 둘(결과 보기 ghost + 알림 받기 primary) */
  actions: HeaderAction[];
  adminTag: boolean;
  bell: { dot: boolean } | null;
  avatar: { initial: string; admin: boolean } | null;
};

export type PublicHeaderInput = {
  season: {
    kind: HeaderSeason;
    /** 리더보드 정본 주소를 만들 슬러그 */
    slug: string;
    title: string;
    flags: { notifications: boolean };
  } | null;
  /** null이면 비로그인 */
  user: { kind: HeaderUser; initial: string; unread: number } | null;
};

/**
 * 내비는 **시즌만** 본다(규칙표 「공개 내비와 로그인」). 유저에 따라 갈리는
 * 것은 우측 액션뿐이다.
 *
 * ⚠️ **「시즌 아카이브」는 시안과 달리 그리지 않는다**(2026-09-16 수연 지시).
 * 시안은 모집 중부터 예고(`.soon-nav`)로 두고 종료 후 링크로 켜지만, 그 화면이
 * 보류(P2)라 갈 곳이 없다 — 눌러도 아무 데도 안 가는 항목은 예고로도 두지
 * 않는다. 아카이브 화면이 생기면 여기에 항목을 되살린다: 모집 중~종료는
 * 셋째 자리, 다음 시즌 사전 신청 기간(P6)은 리더보드 다음이다.
 * `seasons.feature_flags.archive`는 그때까지 헤더가 읽지 않는다.
 */
function publicNav(season: NonNullable<PublicHeaderInput["season"]>): NavItem[] {
  const home: NavItem = { href: "/", label: "리그 소개" };
  const board: NavItem = {
    href: `/seasons/${season.slug}/leaderboard`,
    label: "리더보드",
  };

  switch (season.kind) {
    case "pre":
      return [];
    case "recruit":
    case "stage":
    case "done":
      return [home, board];
    case "arch":
      /* 리그 소개는 랜딩 자체라 링크로 두지 않는다(P6 노트) */
      return [board];
  }
}

/** 사전신청 폼. 「시즌 2 알림 받기」도 같은 폼을 쓴다(시안 판단 필요 P5, 이메일 수집이 같다) */
const PREREGISTER = "/?preregister=1";

/**
 * 탈락 스트립을 닫은 표식. 값은 entry id — 팀이 바뀌면 다시 보인다.
 *
 * ✅ **쿠키로 확정**(2026-09-16 수연 결정). 시안 규칙표는 서버 저장을 적었지만
 * entries에 칸을 더하면 마이그레이션이 따라오고(운영 DB에 잘못 실린 전력이
 * 있다, AGENTS.md 「DB」) 스트립 하나가 질 위험이 아니다. 손해는 다른 기기에서
 * 한 번 더 보이는 것뿐이다.
 */
export const STRIP_COOKIE = "pv-strip-dismissed";

export function resolvePublicHeader(input: PublicHeaderInput): PublicHeaderModel {
  const { season, user } = input;

  /* 열린 시즌이 없다. 시드가 늘 하나를 보장하지만 방어한다 — 갈 곳은 홈뿐 */
  if (!season) {
    return {
      variant: "P1",
      nav: [],
      login: false,
      actions: [{ kind: "preregister", label: "홈", href: "/", variant: "primary" }],
      adminTag: false,
      bell: null,
      avatar: null,
    };
  }

  const userKind: HeaderUser = user?.kind ?? "guest";
  const variant = PUB_MAP[userKind][season.kind];
  const nav = publicNav(season);
  const board = `/seasons/${season.slug}/leaderboard`;
  const next = nextSeasonLabel(season.title);
  const avatar = user ? { initial: user.initial, admin: false } : null;

  switch (variant) {
    case "P1":
      return {
        variant, nav, login: false, adminTag: false, bell: null, avatar: null,
        actions: [{ kind: "preregister", label: "사전 신청하기", href: PREREGISTER, variant: "primary" }],
      };
    case "P2":
      return {
        variant, nav, login: true, adminTag: false, bell: null, avatar: null,
        actions: [{ kind: "apply", label: "참가 신청하기", href: "/apply", variant: "primary" }],
      };
    case "P3":
    case "P4":
      return {
        variant, nav, login: true, adminTag: false, bell: null, avatar: null,
        actions: [{ kind: "leaderboard", label: "리더보드 보기", short: "리더보드", href: board, variant: "outline" }],
      };
    case "P5":
      /*
        시안대로 아바타를 두지 않는다(season=done, user=guest | member 한 프레임).

        ⚠️ 로그인 링크는 **ver4를 따른다.** 헤더 시안 v1.0의 P5 프레임에는
        `.login-lnk`가 없는데 ver4는 `login:1`로 싣는다(`PUBHEAD.P5`). 겹치는
        자리는 ver4가 정본이고(2026-09-16 수연 결정), 기능으로 봐도 그쪽이 맞다 —
        시즌이 끝난 뒤 참가자가 제 대시보드로 가려면 로그인해야 하는데 이 상태에만
        공개 화면에서 로그인으로 가는 길이 없었다.
      */
      return {
        variant, nav, login: true, adminTag: false, bell: null, avatar: null,
        actions: [
          { kind: "result", label: "결과 보기", href: board, variant: "ghost" },
          { kind: "notify", label: `${next} 알림 받기`, href: PREREGISTER, variant: "primary" },
        ],
      };
    case "P6":
      return {
        variant, nav, login: false, adminTag: false, bell: null, avatar: null,
        actions: [{ kind: "preregister", label: `${next} 사전 신청하기`, href: PREREGISTER, variant: "primary" }],
      };
    case "P7":
      return {
        variant, nav, login: false, adminTag: false, bell: null, avatar,
        actions: [{ kind: "apply", label: "참가 신청하기", href: "/apply", variant: "primary" }],
      };
    case "P8":
      return {
        variant, nav, login: false, adminTag: false, bell: null, avatar,
        actions: [{ kind: "notify", label: `${next} 알림 받기`, href: PREREGISTER, variant: "outline" }],
      };
    case "P9":
      return {
        variant, nav, login: false, adminTag: false, avatar,
        /* 벨은 참가팀이 생긴 뒤부터. 인앱 알림이 꺼진 시즌이면 벨도 없다(판단 필요 「벨」) */
        bell: season.flags.notifications ? { dot: (user?.unread ?? 0) > 0 } : null,
        actions: [{ kind: "dashboard", label: "내 대시보드", href: "/dashboard", variant: "outline" }],
      };
    case "P10":
      return {
        variant, nav, login: false, adminTag: false, bell: null, avatar,
        actions: [{ kind: "dashboard", label: "내 대시보드", href: "/dashboard", variant: "gray" }],
      };
    case "P11":
      return {
        variant, nav, login: false, adminTag: true, bell: null,
        avatar: { initial: "A", admin: true },
        actions: [{ kind: "admin", label: "운영 콘솔", href: "/admin", variant: "violet" }],
      };
  }
}

// ═════════════════════════════════════════════════════════════
// 참가자 대시보드 헤더 — D1~D9
// ═════════════════════════════════════════════════════════════

export type DashboardVariant =
  | "D1" | "D2" | "D3" | "D4" | "D5" | "D6" | "D7" | "D8" | "D9";

/** 시안 `.db-ban` 색 변형 */
export type BannerTone =
  | "base" | "urgent" | "judge" | "verify" | "elim" | "dq" | "done" | "arch" | "next";

/** 시안 `.go` 색 — 라임(기본)·바이올렛·레드·회색 */
export type GoTone = "lime" | "violet" | "red" | "gray";

/** 글자 조각. 시안이 `<b>`·`.num`으로 강조하는 자리를 그대로 옮긴다 */
export type Seg = {
  text: string;
  strong?: boolean;
  /** JetBrains Mono — 숫자·날짜·시각만 */
  num?: boolean;
  /** `--faint` 라벨(운영자 대기열의 「전환율」「마감」 같은 것) */
  faint?: boolean;
  accent?: boolean;
};

export type StageInfo = {
  key: StageKey;
  name: string;
  isGate: boolean;
  opensAt: Date | null;
  closesAt: Date | null;
};

export type DashboardHeaderInput = {
  now: Date;
  season: {
    title: string;
    slug: string;
    phase: SeasonPhase;
    startsAt: Date | null;
    /** 시상 발표 시각으로 쓴다(D3 게이트 2 「발표 11.03 내」) */
    endsAt: Date | null;
    flags: { notifications: boolean };
  };
  team: { name: string; members: number };
  entry: { stage: EntryStage; status: EntryStatus };
  onboardingComplete: boolean;
  stages: StageInfo[];
  /** 게이트 제출 시각(s2·s5). SLA 기산점 */
  gateSubmittedAt: Date | null;
  /** 심사 회신 SLA. 심사 기준서 v0.3의 48시간 */
  reviewSlaHours: number;
  finalRank: number | null;
  /**
   * 탈락 사유(스트립 문구용). 멈춘 게이트와 제출 여부 — 「s2 게이트 미제출로」
   * 와 「s2 게이트 미통과로」를 가른다. 게이트에서 떨어진 것이 아니면 null —
   * 그러면 사유 절 없이 사실만 적는다
   */
  elimination: { gate: StageKey; submitted: boolean } | null;
  /** 실격 제재. 소명 기한과 접수 여부 */
  sanction: {
    reason: string | null;
    appealDeadlineAt: Date | null;
    appealedAt: Date | null;
  } | null;
  unread: number;
  initial: string;
  /** 다음 시즌. 아카이브 헤더의 우측 CTA와 D9가 본다 */
  nextSeason: { label: string; startsAt: Date | null; recruiting: boolean } | null;
  /** 탈락 스트립을 닫았는가 */
  stripDismissed: boolean;
};

export type DashboardBanner = {
  tone: BannerTone;
  live?: "violet" | "teal";
  lock?: boolean;
  /** 🏆는 시안이 종료 상태에만 허용한 유일한 이모지다 */
  stage: string;
  time: Seg[];
  /** ≤760에서 쓰는 짧은 시간 값(시안 5장 「D-1 23:59」). 없으면 time 그대로 */
  timeShort?: Seg[];
  go: {
    label: string;
    /** ≤760에서 쓰는 두 글자 문구(시안 5장 「제출」) */
    short?: string;
    href: string;
    tone: GoTone;
  } | null;
};

export type DashboardStrip = {
  tone: "gray" | "red";
  live: boolean;
  text: Seg[];
  link: { label: string; href: string };
  dismissible: boolean;
};

export type DashboardHeaderModel = {
  variant: DashboardVariant;
  team: { name: string; members: number; chip: Seg[] | null };
  banner: DashboardBanner;
  strip: DashboardStrip | null;
  bell: { dot: boolean; red: boolean } | null;
  /** D6의 우측 CTA(시즌 2 참가하기 / 알림 받기) */
  action: HeaderAction | null;
  avatar: { initial: string };
};

/** entry.stage(마지막으로 완료한 단계) → 지금 제출할 스테이지 */
const WORKING_STAGE: Partial<Record<EntryStage, StageKey>> = {
  applied: StageKey.s1,
  s1: StageKey.s2,
  s3: StageKey.s3,
  s4: StageKey.s4,
};

/** 실격 사유 → 스트립 문구. 시안 예문 「레이스 지표 어뷰징 판정으로」 자리 */
const SANCTION_REASON: Record<string, string> = {
  bot_traffic: "레이스 지표 어뷰징 판정으로",
  multi_account: "다중 계정 판정으로",
  paid_signup: "유료 가입 유도 판정으로",
  evidence_forged: "증빙 위조 판정으로",
  undisclosed_ad: "광고 미표기 판정으로",
  attack_or_spam: "공격과 스팸 판정으로",
  false_representation: "허위 기재 판정으로",
};

export function resolveDashboardHeader(input: DashboardHeaderInput): DashboardHeaderModel {
  const { now, season, entry, team, stages, nextSeason } = input;
  const seasonKind = toHeaderSeason(season.phase);
  const bellOn = season.flags.notifications;
  const bell = bellOn ? { dot: input.unread > 0, red: false } : null;
  const avatar = { initial: input.initial };
  const base = { team: { ...team, chip: null }, strip: null, action: null, avatar };
  const board = `/seasons/${season.slug}/leaderboard`;
  const stageOf = (key: StageKey) => stages.find((s) => s.key === key) ?? null;

  // ── 생존 상태가 먼저다 ─────────────────────────────────────
  if (entry.status === EntryStatus.disqualified && seasonKind !== "arch") {
    const s = input.sanction;
    const reason = (s?.reason && SANCTION_REASON[s.reason]) ?? "규칙 위반 판정으로";
    const deadline = s?.appealDeadlineAt ?? null;
    const appealed = s?.appealedAt !== null && s?.appealedAt !== undefined;
    const text: Seg[] = [
      { text: `${reason} ` },
      { text: "실격 처리", strong: true },
      { text: "되었어요." },
    ];
    if (deadline && !appealed) {
      text.push({ text: " 소명은 " }, { text: fmtMDHM(deadline), num: true }, { text: "까지 가능해요." });
    }
    return {
      ...base,
      variant: "D8",
      strip: {
        tone: "red",
        live: true,
        text,
        link: { label: "소명 안내", href: "/dashboard/appeal" },
        dismissible: false,
      },
      banner: {
        tone: "dq",
        stage: "실격 처리",
        time: [{ text: appealed ? "검토 중" : deadline ? `소명 ${fmtDday(now, deadline)}` : "소명 가능" }],
        go: appealed
          ? { label: "소명 접수됨", href: "/dashboard/appeal", tone: "gray" }
          : { label: "소명하기", href: "/dashboard/appeal", tone: "red" },
      },
      bell: bellOn ? { dot: input.unread > 0, red: true } : null,
    };
  }

  const out = entry.status === EntryStatus.eliminated || entry.status === EntryStatus.withdrawn;
  if (out && seasonKind !== "arch") {
    /*
      사유 절은 아는 만큼만. 게이트(s2·s5)에서 떨어진 것이 아니면(운영자 수동
      탈락 같은 것) 어느 게이트라고 단정하지 않고 사실만 말한다 — 틀린 사유를
      띠에 박아 두는 것이 사유가 없는 것보다 나쁘다. (2026-09-16)
    */
    const e = input.elimination;
    const why =
      entry.status === EntryStatus.withdrawn ? "참가를 포기해 "
      : e ? `${e.gate} 게이트 ${e.submitted ? "미통과로" : "미제출로"} `
      : "";
    return {
      ...base,
      variant: "D7",
      strip: input.stripDismissed
        ? null
        : {
            tone: "gray",
            live: false,
            text: [
              ...(why ? [{ text: why }] : []),
              { text: `${season.title} 경쟁에서 제외`, strong: true },
              { text: "되었어요. 리더보드와 참가작은 계속 볼 수 있어요." },
            ],
            link: { label: "안내 보기", href: "/dashboard/judgments" },
            dismissible: true,
          },
      banner: {
        tone: "elim",
        stage: seasonKind === "done" ? `${season.title} 종료` : `${season.title} 진행 중`,
        time: [{ text: "관전 모드" }],
        go: { label: "리더보드 보기", href: board, tone: "gray" },
      },
      /* 벨 제거 — 이후 알림 대상이 없다(D7 노트) */
      bell: null,
    };
  }

  // ── 시즌이 끝났다 ──────────────────────────────────────────
  if (seasonKind === "arch") {
    if (entry.status === EntryStatus.active && nextSeason?.recruiting) {
      /* D9 — 다음 시즌 모집 중, 재도전 */
      return {
        ...base,
        variant: "D9",
        team: {
          ...team,
          chip: input.finalRank !== null
            ? [{ text: `${season.title}, ` }, { text: String(input.finalRank), num: true }, { text: "위" }]
            : null,
        },
        banner: {
          tone: "next",
          stage: `${nextSeason.label}, 모집 중`,
          time: nextSeason.startsAt ? [{ text: `개막 ${fmtMD(nextSeason.startsAt)}` }] : [{ text: "개막 일정 확정 중" }],
          go: { label: `${nextSeason.label} 참가 신청`, href: "/apply", tone: "lime" },
        },
        bell,
      };
    }
    const nextLabel = nextSeason?.label ?? nextSeasonLabel(season.title);
    return {
      ...base,
      variant: "D6",
      banner: {
        tone: "arch",
        lock: true,
        stage: `${season.title} 아카이브`,
        time: [{ text: "읽기 전용" }],
        go: null,
      },
      /* 아카이브 시즌에는 벨을 제거하고 다음 시즌 CTA를 둔다(D6 노트) */
      bell: null,
      action: nextSeason?.recruiting
        ? { kind: "apply", label: `${nextLabel} 참가하기`, href: "/apply", variant: "outline" }
        : { kind: "notify", label: `${nextLabel} 알림 받기`, href: PREREGISTER, variant: "outline" },
    };
  }

  if (seasonKind === "done") {
    return {
      ...base,
      variant: "D5",
      banner: {
        tone: "done",
        stage: `🏆 ${season.title} 종료`,
        time: input.finalRank !== null
          ? [{ text: "최종 " }, { text: String(input.finalRank), num: true }, { text: "위" }]
          : [{ text: "결과 발표" }],
        go: { label: "결과 보기", href: "/dashboard/judgments", tone: "lime" },
      },
      bell,
    };
  }

  // ── 모집 중 · 온보딩 ───────────────────────────────────────
  if (seasonKind === "pre" || seasonKind === "recruit") {
    return {
      ...base,
      variant: "D1",
      banner: {
        tone: "base",
        stage: `${season.title}, ${seasonKind === "pre" ? "모집 전" : "모집 중"}`,
        time: season.startsAt ? [{ text: `개막 ${fmtMD(season.startsAt)}` }] : [{ text: "개막 일정 확정 중" }],
        go: null,
      },
      bell,
    };
  }

  // ── 레이스(stage · judge · verify) — 팀별 상태로 가른다 ────
  if (entry.stage === EntryStage.applied && !input.onboardingComplete) {
    /* h1의 레이스 중 형태 — 제출 버튼은 없고 s1 마감만 알려 준다 */
    const s1 = stageOf(StageKey.s1);
    return {
      ...base,
      variant: "D1",
      banner: {
        tone: "base",
        stage: `${season.title}, 온보딩 중`,
        time: s1?.closesAt
          ? [{ text: `s1 마감 ${fmtMD(s1.closesAt)}` }]
          : season.startsAt
            ? [{ text: `개막 ${fmtMD(season.startsAt)}` }]
            : [{ text: "개막 일정 확정 중" }],
        go: null,
      },
      bell,
    };
  }

  if (entry.stage === EntryStage.completed) {
    /* 완주했는데 아직 시상 전 — 최종 심사 회신을 기다리는 모양(D3 게이트 2)과 같다 */
    return {
      ...base,
      variant: "D3",
      banner: {
        tone: "judge",
        live: "violet",
        stage: "s5 최종 심사 중",
        time: [{ text: season.endsAt ? `발표 ${fmtMD(season.endsAt)} 내` : "발표 대기" }],
        go: { label: "심사 결과", href: "/dashboard/judgments", tone: "violet" },
      },
      bell,
    };
  }

  if (entry.stage === EntryStage.s2 || entry.stage === EntryStage.s5) {
    /* 게이트 제출을 마쳤다 = 판정 대기(dashboard-state.ts의 byStage와 같은 읽기) */
    const gate2 = entry.stage === EntryStage.s5;
    const due = input.gateSubmittedAt
      ? new Date(input.gateSubmittedAt.getTime() + input.reviewSlaHours * 3_600_000)
      : null;
    return {
      ...base,
      variant: "D3",
      banner: {
        tone: "judge",
        live: "violet",
        stage: gate2 ? "s5 최종 심사 중" : "s2 1차 심사 중",
        time: gate2
          ? [{ text: season.endsAt ? `발표 ${fmtMD(season.endsAt)} 내` : "발표 대기" }]
          : due
            ? [{ text: `회신까지 ${fmtHoursLeft(now, due)}` }]
            : [{ text: `회신까지 ${input.reviewSlaHours}시간 내` }],
        go: { label: "심사 결과", href: "/dashboard/judgments", tone: "violet" },
      },
      bell,
    };
  }

  /*
    s5 창이 열렸으면 집계 확정 대기(D4). s5는 리버스 프록시 집계가 자동
    제출되므로 버튼이 「제출」이 아니라 「자동 제출 확인」이다.
  */
  const s5 = stageOf(StageKey.s5);
  if (
    entry.stage === EntryStage.s4 &&
    s5?.opensAt && s5.opensAt.getTime() <= now.getTime() &&
    (!s5.closesAt || s5.closesAt.getTime() > now.getTime())
  ) {
    return {
      ...base,
      variant: "D4",
      banner: {
        tone: "verify",
        live: "teal",
        stage: `s5 ${s5.name}`,
        time: s5.closesAt ? [{ text: `집계 확정 ${fmtMDHM(s5.closesAt)}` }] : [{ text: "집계 중" }],
        go: { label: "자동 제출 확인", href: "/dashboard/submit/s5", tone: "lime" },
      },
      bell,
    };
  }

  /* D2 — 제출 가능. D-1 이하이면 긴급형 */
  const key = WORKING_STAGE[entry.stage] ?? StageKey.s1;
  const stage = stageOf(key);
  const closes = stage?.closesAt ?? null;
  const urgent = closes !== null && closes.getTime() >= now.getTime() && dayDiff(now, closes) <= 1;
  const dday = closes ? (urgent ? `${fmtDday(now, closes)} ${fmtHM(closes)}` : fmtDday(now, closes)) : null;
  const time: Seg[] = closes && dday
    ? [{ text: `마감 ${fmtMD(closes)}, ${dday}` }]
    : [{ text: "마감 일정 확정 중" }];
  return {
    ...base,
    variant: "D2",
    banner: {
      tone: urgent ? "urgent" : "base",
      stage: `${key} ${stage?.name ?? ""}`.trim(),
      time,
      timeShort: dday ? [{ text: dday }] : undefined,
      go: {
        label: urgent ? "지금 제출하기" : "제출 바로가기",
        short: "제출",
        href: `/dashboard/submit/${key}`,
        tone: "lime",
      },
    },
    bell,
  };
}

// ═════════════════════════════════════════════════════════════
// 운영자 헤더 — A1~A7
// ═════════════════════════════════════════════════════════════

export type AdminVariant = "A1" | "A2" | "A3" | "A4" | "A5" | "A6" | "A7";

/** 시안 `.ad-q` 색 — b 블루 · l 라임 · w 오렌지 · t 틸 · v 바이올렛 · r 레드 */
export type QueueTone = "b" | "l" | "w" | "t" | "v" | "r";

/**
 * 대기열 필. `.ad-q`는 inline-flex(gap 8px)라 **조각 사이 공백을 넣지 않는다** —
 * 시안도 텍스트 노드와 span이 각각 플렉스 아이템이 되어 gap으로 벌어진다.
 * 공백만 든 조각은 빈 아이템이 되어 gap을 하나 더 먹는다.
 */
export type AdminQueue = {
  tone: QueueTone;
  href: string;
  segs: Seg[];
  /** ≤760에서 첫 대기열 필 꼬리에 붙는 짧은 꼴(시안 5장 「SLA 임박 3」). 둘째 대기열만 갖는다 */
  short?: Seg[];
};

export type AdminHeaderInput = {
  now: Date;
  season: {
    id: string;
    title: string;
    phase: SeasonPhase;
    startsAt: Date | null;
    endsAt: Date | null;
  } | null;
  /** 셀렉트에 올릴 시즌들. 최신순 */
  seasons: { id: string; title: string; phase: SeasonPhase }[];
  stages: StageInfo[];
  /** 참가 신청 마감(레이스 전환 예정 시각) */
  recruitDeadline: Date | null;
  queues: {
    leads: number;
    /** 랜딩 전환율(%). 방문 수가 없으면 null — 숫자를 지어내지 않는다 */
    leadsConversion: number | null;
    entries: number;
    onboardingIncomplete: number;
    /** 지금 스테이지의 대기 건수 */
    stagePending: number;
    reviewsPending: number;
    reviewsSlaUnder12h: number;
    metricsPending: number;
    abuseFlags: number;
    appealsPending: number;
    nextSeasonLeads: number | null;
  };
  nextSeason: { title: string; startsAt: Date | null } | null;
  email: string;
};

export type AdminHeaderModel = {
  variant: AdminVariant;
  seasons: { id: string; label: string; selected: boolean }[];
  badge: { tone: "lime" | "blue" | "violet" | "teal" | "gray"; live?: "lime" | "violet"; label: string };
  /** 기본 1개, 급한 상태에서만 2개. 레드·오렌지가 항상 우측 */
  queues: AdminQueue[];
  email: string;
};

const RECRUIT_TARGET = "20~40";

/** 스테이지별 대기열 이름(A3 노트) */
const STAGE_QUEUE: Record<StageKey, { label: string; tone: QueueTone; href: string }> = {
  s1: { label: "제출 확인 대기", tone: "l", href: "/admin/entries" },
  s2: { label: "랜딩 제출 대기", tone: "l", href: "/admin/judging" },
  s3: { label: "배포 URL 검증 대기", tone: "t", href: "/admin/entries" },
  s4: { label: "주간 지표 제출 대기", tone: "l", href: "/admin/metrics" },
  s5: { label: "지표 검토 대기", tone: "t", href: "/admin/metrics" },
};

/**
 * 지금 어느 스테이지가 돌고 있나 — 창이 열린 것 중 마지막. 아직 하나도
 * 안 열렸으면 첫 스테이지.
 */
export function currentStage(stages: StageInfo[], now: Date): StageInfo | null {
  const opened = stages.filter((s) => s.opensAt && s.opensAt.getTime() <= now.getTime());
  return opened.at(-1) ?? stages[0] ?? null;
}

export function resolveAdminHeader(input: AdminHeaderInput): AdminHeaderModel {
  const { now, season, queues, stages } = input;
  const seasons = input.seasons.map((s) => ({
    id: s.id,
    label:
      s.phase === SeasonPhase.archived ? `${s.title} (아카이브)`
      : s.phase === SeasonPhase.draft ? `${s.title} (준비 중)`
      : s.title,
    selected: s.id === season?.id,
  }));
  const n = (v: number) => ({ text: String(v), num: true });

  if (!season) {
    return { variant: "A1", seasons, badge: { tone: "gray", label: "시즌 없음" }, queues: [], email: input.email };
  }

  const kind = toHeaderSeason(season.phase);

  switch (kind) {
    case "pre": {
      const segs: Seg[] = [{ text: "사전 신청 리드 " }, n(queues.leads), { text: "명" }];
      if (queues.leadsConversion !== null) {
        segs.push({ text: "전환율", faint: true }, { text: `${queues.leadsConversion}%`, num: true });
      }
      return {
        variant: "A1", seasons, email: input.email,
        badge: { tone: "blue", label: "모집 전" },
        queues: [{ tone: "b", href: "/admin/leads", segs }],
      };
    }
    case "recruit": {
      const segs: Seg[] = [
        { text: "신청 " }, n(queues.entries), { text: "팀 " },
        { text: `목표 ${RECRUIT_TARGET}`, faint: true },
      ];
      if (input.recruitDeadline) {
        segs.push({ text: "마감", faint: true }, { text: fmtMD(input.recruitDeadline), num: true });
      }
      const list: AdminQueue[] = [{ tone: "l", href: "/admin/entries", segs }];
      if (queues.onboardingIncomplete > 0) {
        list.push({ tone: "w", href: "/admin/entries", segs: [{ text: "온보딩 미완료 " }, n(queues.onboardingIncomplete), { text: "팀" }], short: [{ text: "온보딩 미완 " }, n(queues.onboardingIncomplete)] });
      }
      return { variant: "A2", seasons, email: input.email, badge: { tone: "lime", label: "모집 중" }, queues: list };
    }
    case "stage": {
      const stage = currentStage(stages, now);
      const closed = stage?.closesAt ? stage.closesAt.getTime() <= now.getTime() : false;

      /* 게이트 창이 닫혔고 판정이 남았다 = 심사 중(A4) */
      if (stage?.isGate && closed && queues.reviewsPending > 0) {
        const gateNo = stage.key === StageKey.s5 ? 2 : 1;
        const list: AdminQueue[] = [
          { tone: "v", href: "/admin/judging", segs: [{ text: "심사 대기 " }, n(queues.reviewsPending), { text: "건" }] },
        ];
        if (queues.reviewsSlaUnder12h > 0) {
          list.push({ tone: "r", href: "/admin/judging", segs: [{ text: "SLA 12시간 미만 " }, n(queues.reviewsSlaUnder12h), { text: "건" }], short: [{ text: "SLA 임박 " }, n(queues.reviewsSlaUnder12h)] });
        }
        return {
          variant: "A4", seasons, email: input.email,
          badge: { tone: "violet", live: "violet", label: `게이트 ${gateNo} 심사 중` },
          queues: list,
        };
      }

      /*
        s5는 리버스 프록시 집계라 창이 열린 동안이 곧 「집계 확정 중」이고(A5,
        참가자 쪽 D4와 같은 구간), 닫힌 뒤 판정이 남으면 위의 게이트 2 심사(A4)다.
      */
      if (stage?.key === StageKey.s5) {
        const segs: Seg[] = [{ text: "지표 검토 대기 " }, n(queues.metricsPending), { text: "팀" }];
        if (stage.closesAt) segs.push({ text: "확정", faint: true }, { text: fmtMDHM(stage.closesAt), num: true });
        const list: AdminQueue[] = [{ tone: "t", href: "/admin/metrics", segs }];
        if (queues.abuseFlags > 0) {
          list.push({ tone: "w", href: "/admin/abuse", segs: [{ text: "어뷰징 플래그 " }, n(queues.abuseFlags), { text: "건" }], short: [{ text: "플래그 " }, n(queues.abuseFlags)] });
        }
        return { variant: "A5", seasons, email: input.email, badge: { tone: "teal", label: "집계 확정 중" }, queues: list };
      }

      const q = stage ? STAGE_QUEUE[stage.key] : STAGE_QUEUE.s1;
      return {
        variant: "A3", seasons, email: input.email,
        badge: { tone: "lime", live: "lime", label: stage ? `${stage.key} ${stage.name}` : "레이스" },
        queues: [{ tone: q.tone, href: q.href, segs: [{ text: `${q.label} ` }, n(queues.stagePending), { text: "건" }] }],
      };
    }
    case "done": {
      const segs: Seg[] = [{ text: "시상 발표 " }];
      if (season.endsAt) segs.push({ text: fmtMD(season.endsAt), num: true });
      segs.push({ text: "최종 순위", faint: true }, { text: "확정됨", accent: true });
      const list: AdminQueue[] = [{ tone: "l", href: "/admin/awards", segs }];
      if (queues.appealsPending > 0) {
        list.push({ tone: "v", href: "/admin/judging", segs: [{ text: "소명 검토 " }, n(queues.appealsPending), { text: "건" }], short: [{ text: "소명 " }, n(queues.appealsPending)] });
      }
      return { variant: "A6", seasons, email: input.email, badge: { tone: "lime", label: "🏆 시즌 종료" }, queues: list };
    }
    case "arch": {
      const next = input.nextSeason;
      /* 셀렉트 기본은 준비 중인 시즌(A7 노트). 아카이브 시즌은 골라야 보인다 */
      const nextId = input.seasons.find((s) => s.title === next?.title)?.id;
      if (nextId) for (const s of seasons) s.selected = s.id === nextId;
      const list: AdminQueue[] = [];
      if (next && queues.nextSeasonLeads !== null) {
        const segs: Seg[] = [{ text: `${next.title} 사전 신청 ` }, n(queues.nextSeasonLeads), { text: "명" }];
        if (next.startsAt) segs.push({ text: "개막", faint: true }, { text: fmtMD(next.startsAt), num: true });
        list.push({ tone: "b", href: "/admin/leads", segs });
      }
      return {
        variant: "A7", seasons, email: input.email,
        badge: next ? { tone: "gray", label: "준비 중" } : { tone: "gray", label: "아카이브" },
        queues: list,
      };
    }
  }
}
