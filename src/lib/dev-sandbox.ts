import { createHash } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import {
  AbuseStatus,
  ChargeType,
  ConsentType,
  CreditClaimStatus,
  CreditDeliveredVia,
  CreditDelivery,
  CreditKind,
  CreditOfferStatus,
  CreditStatus,
  DeployStatus,
  EntryStage,
  EntryStatus,
  IntegrationStatus,
  InvitationStatus,
  JudgmentResult,
  MemberRole,
  MetricSource,
  NotifChannel,
  PaymentProvider,
  SanctionReason,
  SanctionStage,
  SanctionStatus,
  SeasonPhase,
  StageKey,
  SubmissionStatus,
  TransactionStatus,
} from "@/generated/prisma/enums";
import {
  ACCOUNT_PRIVACY_CONSENT_VERSION,
  ACCOUNT_TERMS_CONSENT_VERSION,
  APPLY_CONSENTS,
} from "@/content/consent";
import { NOTI_WELCOME } from "@/content/notifications";
import { stageAtLeast } from "@/lib/access-policy";
import { applyConsentRows } from "@/lib/apply-store";
import {
  CREDIT_CARDS,
  CREDIT_CARD_BY_KIND,
  type CreditsPane,
  type UnlockProgress,
  creditCardState,
  creditSeason,
  creditsPane,
  isUnlocked,
} from "@/lib/credits";
import { devNow, setDevToday } from "@/lib/dev-clock";
import { setDevHubKey } from "@/lib/dev-hub";
import { EVIDENCE_KINDS, buildEvidenceKey, kindOfName } from "@/lib/evidence";
import { evidenceStorage } from "@/lib/evidence-storage";
import {
  DEV_FILE_BYTES,
  SPEC_FILES,
  SPEC_S1,
  SPEC_S2_LEADS,
  SPEC_S2_VISITORS,
  SPEC_S4,
  SPEC_S4_SIGNUPS,
  SPEC_S4_VISITORS,
  SPEC_S4_WEEK1,
  SPEC_S5,
  specS2,
  specS3,
} from "@/lib/dev-submit-fixture";
import { seoulDateOnly } from "@/lib/measure";
import { endOfSeoulDay } from "@/lib/appeal";
import { type AppealPane, responseDeadline } from "@/lib/appeal-view";
import { type JudgmentsPane, paneOf as judgmentsPane } from "@/lib/judgments-view";
import { type MetricsPane as MyMetricsPane, metricsWindow } from "@/lib/metrics-view";
import { measurementState, type MeasurementState } from "@/lib/measurement";
import { paymentPane, type PaymentPane } from "@/lib/payment";
import { encryptSecret } from "@/lib/payment-crypto";
import { devToolsEnabled } from "@/lib/dev-env";
import { accountConsentRows } from "@/lib/account-consent";
import { prisma } from "@/lib/prisma";
import { INVITE_TTL_DAYS } from "@/lib/team";
import { generateCode } from "@/lib/team-store";

/*
  개발용 상태 토글의 **판정과 쓰기**. 화면은 components/DevBar가 그린다.

  시안의 화면마다 STATE 줄이 있는데(로그인/회원가입, 집계 전/레이스/종료 …),
  실제 앱에서 그 상태를 만들려면 DB를 손으로 고쳐야 한다. 화면을 훑어보는 동안
  터미널을 왕복하면 그 마찰 때문에 안 보고 넘어가는 상태가 생긴다. 이 파일이
  그 왕복을 없앤다.

  ══════════════════════════════════════════════════════════════
  ⚠️ 안전장치가 **둘**이고, 둘 다 통과해야 동작한다.
  ══════════════════════════════════════════════════════════════

    ① 운영 배포가 아닐 것 — 로컬 개발 서버와 Vercel 프리뷰(스테이징)만 (`dev-env.ts`)
    ② 붙어 있는 DB가 **dev 브랜치**일 것

  ②를 따로 두는 이유가 이 파일이 존재하는 계기다. 2026-08-27에 `prisma migrate
  deploy`와 `db:seed`를 그냥 돌려 **운영 DB의 기능 플래그를 켰다.** `.env`가 운영을
  가리키고 dev는 `.env.development.local`인데, Prisma CLI는 prisma.config.ts를 통해
  `.env`를 읽는다.

  ⚠️ `next dev`는 다르다 — Next가 `.env.development.local`을 **항상 먼저** 읽어서
  앱은 기본적으로 dev DB에 붙는다. 그래서 ②가 걸릴 일은 드물지만, 셸에서
  DATABASE_URL을 덮거나 그 파일을 지우면 그 순간 운영을 고치는 바가 뜬다.
  드문 경우를 막자고 두는 것이 가드다.

  scripts/make-demo-account.ts와 같은 방식으로 **엔드포인트 호스트**를 본다.
  브랜치 ID가 아니다 — Neon은 둘을 다른 이름으로 부르고 접속 주소에 들어가는
  것은 엔드포인트 쪽이다.
*/

const DEV_ENDPOINT = "ep-floral-truth-azjbh0bs";

export type SandboxDenial =
  | { ok: true }
  | { ok: false; reason: string };

/** 개발 도구를 열어도 되는가. 화면과 서버 액션이 **각각** 부른다 */
export function checkDevSandbox(): SandboxDenial {
  if (!devToolsEnabled) {
    return { ok: false, reason: "운영 배포에서는 열지 않습니다." };
  }

  const url = process.env.DATABASE_URL;
  if (!url) return { ok: false, reason: "DATABASE_URL이 없습니다." };

  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return { ok: false, reason: "DATABASE_URL을 읽을 수 없습니다." };
  }

  if (!host.startsWith(DEV_ENDPOINT)) {
    return {
      ok: false,
      reason:
        `운영 DB에 붙어 있습니다 (${host}). 개발 도구를 열지 않습니다. ` +
        "보통은 .env.development.local이 자동으로 실리는데, 셸의 DATABASE_URL이 " +
        "그걸 덮고 있는지 확인하세요.",
    };
  }

  return { ok: true };
}

/** 열려 있지 않은데 쓰기를 시도하면 던진다. 조용히 넘어가면 그게 제일 위험하다 */
export function assertSandbox(): void {
  const check = checkDevSandbox();
  if (!check.ok) throw new Error(`[dev-sandbox] 거부: ${check.reason}`);
}

// ═════════════════════════════════════════════════════════════
// 지금 무엇을 고를 수 있나
// ═════════════════════════════════════════════════════════════

export type SandboxTeam = {
  entryId: string;
  userId: string;
  teamName: string;
  ideaTitle: string;
  stage: EntryStage;
  status: EntryStatus;
  /* 아래 둘은 허브 줄이 「지금 어느 판인가」를 되짚는 데 쓴다 */
  solo: boolean;
  verified: boolean;
  /** 측정 연동 화면의 판(시안 ①②③). 행이 없으면 none — 「측정 연동」 줄이 되짚는다 */
  measurement: MeasurementState | "none";
  /** 결제 연동 화면의 판(시안 ①②③ + 확인 대기). 「결제 연동」 줄이 되짚는다 */
  payment: PaymentPane;
  /** 스테이지 제출 화면의 판. 「제출」 줄이 되짚는다 — 시안 목업이 심긴 판만 */
  submit: SubmitPane | null;
  /** 혜택과 크레딧 화면의 판(시안 ①~⑦). 「크레딧」 줄이 되짚는다 */
  credits: CreditsPane | null;
  /** 내 지표 화면의 판(시안 ①②). 「내 지표」 줄이 되짚는다 — s3 전이면 null */
  myMetrics: MyMetricsPane | null;
  /** 심사 결과 화면의 판(시안 ①~④). 「심사 결과」 줄이 되짚는다 — s2 전이면 null */
  judgments: JudgmentsPane | null;
  /** 소명 화면의 판(시안 ①②). 「소명」 줄이 되짚는다 — 소명할 것도 접수도 없으면 null */
  appeal: AppealPane | null;
  /** 알림센터 화면의 판(시안 ①②). 「알림센터」 줄이 되짚는다 — 목업도 환영 한 줄도 아니면 null */
  noti: NotiPane | null;
  /** 팀원 수. 「팀원」 줄이 1인·2인 중 어느 쪽이 눌렸는지 되짚는 데 쓴다 */
  members: number;
  /* 어느 팀·시즌의 기록인가 — 바가 판을 앉힐 기록을 고르는 데 쓴다 */
  teamId: string;
  seasonId: string;
  seasonCreatedAt: Date;
};

export type SandboxState = {
  teams: SandboxTeam[];
  season: {
    id: string;
    slug: string;
    phase: SeasonPhase;
    /** 리더보드가 지금 어느 상태로 보이는가 */
    metrics: MetricsFixture;
    /** 지금 스테이지 — 창이 열린 것 중 마지막(`currentStage`와 같은 정의). 하나도 안 열렸으면 null */
    stage: StageKey | null;
    /**
     * 다음 시즌이 깨어 있으면 그 페이즈, 아니면 null. h17(다음 시즌 참가)만
     * 깨운다 — 바의 시즌은 늘 시즌 1이므로 h17을 되짚는 데 이 값이 필요하다.
     */
    nextPhase: SeasonPhase | null;
  } | null;
};

/**
 * 팀 목록과 시즌 상태. 바는 로그인한 계정이 팀장인 팀을 이 목록에서 찾는다.
 *
 * **팀장이 있는 팀만** 준다. 진도·상태 줄이 제출물을 팀장 이름으로 만든다.
 */
export async function loadSandboxState(): Promise<SandboxState> {
  assertSandbox();

  const metricsWin = metricsWindow(seoulDateOnly(devNow()));
  const [entries, season] = await Promise.all([
    prisma.entry.findMany({
      orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        stage: true,
        status: true,
        ideaTitle: true,
        season: {
          select: {
            id: true,
            createdAt: true,
            phase: true,
            creditOffers: { select: { kind: true, status: true } },
          },
        },
        hostname: { select: { deployStatus: true, ownershipVerifiedAt: true } },
        chargeType: true,
        integration: { select: { status: true } },
        submissions: {
          select: {
            stageKey: true,
            week: true,
            status: true,
            /* 심사 결과 ①~④를 가르는 것 — 게이트의 최신 판정 */
            judgments: { orderBy: { judgedAt: "desc" }, take: 1, select: { result: true } },
          },
        },
        creditClaims: { select: { status: true, offer: { select: { kind: true } } } },
        awards: { where: { awardedAt: { not: null } }, take: 1, select: { id: true } },
        /* 소명 ①②를 가르는 것 — 접수 기록, 없으면 소명할 제재가 있는가 */
        appeals: { take: 1, select: { id: true } },
        sanctions: {
          where: { status: { not: SanctionStatus.withdrawn } },
          take: 1,
          select: { id: true },
        },
        /* 내 지표 ①②를 가르는 것 — 어제까지 14일에 집계 행이 있는가 */
        metricDaily: {
          where: { metricDate: { gte: metricsWin.chartFrom, lt: metricsWin.to } },
          take: 1,
          select: { id: true },
        },
        team: {
          select: {
            id: true,
            name: true,
            isSolo: true,
            members: {
              where: { role: "leader" },
              take: 1,
              select: { userId: true },
            },
            _count: { select: { members: true } },
          },
        },
      },
    }),
    /*
      ⚠️ **바의 시즌은 늘 시즌 1이다** — 가장 먼저 만들어진, 잠들지 않은 시즌.
      목 데이터는 시즌 1이 정본이고 시즌 2는 h17이 잠깐 깨우는 「다음 시즌」이다.
      최신 시즌을 집으면 h17을 누른 뒤 페이즈·참가팀 줄이 전부 시즌 2를 건드려
      dev DB가 시즌 2 기준으로 흘러간다(2026-09-21에 실제로 그랬다 — 「dev DB는
      시즌 1 기준으로 짜여져야 돼」).
    */
    prisma.season.findFirst({
      where: { phase: { not: SeasonPhase.draft } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        slug: true,
        phase: true,
        /*
          집계 상태를 여기서 같이 읽는다. findFirst를 따로 부르면 페이지를 그릴
          때마다 왕복이 한 번 더 는다 — 이 바는 **모든 화면**에 붙어 있다.
          최신 스냅샷 한 장만 있으면 되므로 orderBy + take 1이다.
        */
        snapshots: {
          orderBy: { snapshotDate: "desc" },
          take: 1,
          select: { isFinal: true },
        },
        stages: {
          orderBy: { stageKey: "asc" },
          select: { stageKey: true, opensAt: true },
        },
      },
    }),
  ]);
  const next = season
    ? await prisma.season.findFirst({
        where: {
          id: { not: season.id },
          phase: { not: SeasonPhase.draft },
        },
        orderBy: { createdAt: "asc" },
        select: { phase: true },
      })
    : null;
  const now = devNow().getTime();
  /* 알림센터 판 — 시안 목업의 첫 알림이 있으면 ①, 환영 알림뿐이면 ② */
  const notiRows = await prisma.notification.findMany({
    where: { userId: { in: entries.flatMap((e) => e.team.members.map((m) => m.userId)) } },
    select: { userId: true, type: true, title: true },
  });
  const notiPaneOf = (userId: string): NotiPane | null => {
    const mine = notiRows.filter((n) => n.userId === userId);
    if (mine.some((n) => n.title === SPEC_NOTI[0].title)) return "list";
    if (mine.length > 0 && mine.every((n) => n.type === NOTI_WELCOME.type)) return "empty";
    return null;
  };

  const teams: SandboxTeam[] = entries.flatMap((entry) => {
    const leader = entry.team.members[0];
    if (!leader) return [];
    return [
      {
        entryId: entry.id,
        userId: leader.userId,
        teamName: entry.team.name,
        ideaTitle: entry.ideaTitle,
        stage: entry.stage,
        status: entry.status,
        solo: entry.team.isSolo,
        members: entry.team._count.members,
        verified:
          entry.hostname?.deployStatus === DeployStatus.active &&
          entry.hostname.ownershipVerifiedAt !== null,
        measurement: entry.hostname
          ? measurementState({
              deployStatus: entry.hostname.deployStatus,
              verifiedAt: entry.hostname.ownershipVerifiedAt,
            })
          : "none",
        payment: paymentPane({
          chargeType: entry.chargeType,
          status: entry.integration?.status ?? null,
        }),
        submit: submitPane(entry.submissions),
        myMetrics: myMetricsPaneOf({
          stage: entry.stage,
          hasRows: entry.metricDaily.length > 0,
          verified: entry.hostname?.ownershipVerifiedAt != null,
        }),
        judgments: judgmentsPaneOf({
          stage: entry.stage,
          gate1: entry.submissions.find((x) => x.stageKey === StageKey.s2)?.judgments[0] ?? null,
          gate2: entry.submissions.find((x) => x.stageKey === StageKey.s5)?.judgments[0] ?? null,
        }),
        appeal: entry.appeals.length ? "sent" : entry.sanctions.length ? "write" : null,
        noti: notiPaneOf(leader.userId),
        credits: creditsPaneOf({
          phase: entry.season.phase,
          status: entry.status,
          stage: entry.stage,
          s1Submitted: entry.submissions.some(
            (s) => s.stageKey === StageKey.s1 && s.status !== SubmissionStatus.draft,
          ),
          deployVerified: entry.hostname?.ownershipVerifiedAt != null,
          awarded: entry.awards.length > 0,
          offers: entry.season.creditOffers,
          claims: entry.creditClaims,
        }),
        teamId: entry.team.id,
        seasonId: entry.season.id,
        seasonCreatedAt: entry.season.createdAt,
      },
    ];
  });

  return {
    teams,
    season: season
      ? {
          id: season.id,
          slug: season.slug,
          phase: season.phase,
          metrics: !season.snapshots[0]
            ? "none"
            : season.snapshots[0].isFinal
              ? "final"
              : "race",
          stage:
            season.stages
              .filter((s) => s.opensAt && s.opensAt.getTime() <= now)
              .at(-1)?.stageKey ?? null,
          nextPhase: next?.phase ?? null,
        }
      : null,
  };
}

// ═════════════════════════════════════════════════════════════
// 상태 바꾸기
// ═════════════════════════════════════════════════════════════

/*
  진도를 올릴 때 **제출물도 같이 만든다.**

  진도만 바꾸면 심사 결과·제출 폼·참가작 상세가 빈 화면이 된다. 그 빈 화면을
  보고 "아직 안 만들어졌나" 싶어 코드를 뒤지게 되는데, 실은 데이터가 없을 뿐이다.

  ⚠️ 여기서 만드는 제출물은 **가짜다.** dev 전용이라 허용하지만, 이 함수가
  운영에서 불리면 조작된 제출 기록이 생긴다 — assertSandbox가 그래서 맨 위에 있다.
  payload는 submission.ts의 스키마 모양을 따르되 내용은 "개발용"이라고 밝힌다.
*/
const STAGE_ORDER: EntryStage[] = [
  EntryStage.applied,
  EntryStage.s1,
  EntryStage.s2,
  EntryStage.s3,
  EntryStage.s4,
  EntryStage.s5,
  EntryStage.completed,
];

/** 이 진도까지 왔다면 어느 스테이지까지 냈어야 하는가 */
function submittedStages(stage: EntryStage): StageKey[] {
  const index = STAGE_ORDER.indexOf(stage);
  const keys: StageKey[] = [
    StageKey.s1,
    StageKey.s2,
    StageKey.s3,
    StageKey.s4,
    StageKey.s5,
  ];
  /*
    `entry.stage`는 **마지막으로 완료한 단계**다(access-policy 주석).
    s3이면 s1·s2·s3을 낸 상태다 — 인덱스가 그대로 개수가 된다.
  */
  return keys.slice(0, Math.max(0, index));
}

/*
  ⚠️ `host`를 받는 이유: **s2의 랜딩 주소는 팀마다 다르다.** 시안 h4가
  「랜딩 주소 little-potion.proovit.kr」을 그리는 자리라, 없으면 화면에 「—」가
  남는다. 팀의 측정 주소를 그대로 쓴다.
*/
function devPayload(key: StageKey, host: string | null): Prisma.InputJsonObject {
  switch (key) {
    case StageKey.s1:
      return {
        concept: "1인 카페 사장님을 위한 시그니처 레시피 구독",
        problemDoc:
          "화면 검토를 위해 개발 바가 만든 제출물입니다. 실제 참가자가 쓴 내용이 아닙니다.",
        coreFeature: "매주 레시피와 원가표 발송",
        notBuilding: ["재고 관리", "POS 연동"],
        riskiest: "구독료를 낼 의사가 있는가",
        guideChecks: [true, true, true],
      };
    case StageKey.s3:
      return {
        serviceUrl: "https://example.com",
        builder: "러버블",
        signupConnected: true,
        launchChecks: Array.from({ length: 10 }, () => true),
        aiFeature: false,
        aiChecks: Array.from({ length: 5 }, () => false),
      };
    case StageKey.s2:
      return {
        landingUrl: host ? `https://${host}` : "",
        channels: ["스레드"],
        postUrl: "https://example.com/dev-post",
        guideChecks: [true, true, true],
      };
    default:
      /* s4·s5는 아직 폼이 없다. 자리만 채워 「냈다」가 성립하게 한다 */
      return { note: "개발 바가 만든 제출물" };
  }
}

export async function setSandboxStage(args: {
  entryId: string;
  stage: EntryStage;
  userId: string;
}): Promise<void> {
  assertSandbox();
  const { entryId, stage, userId } = args;

  const needed = submittedStages(stage);
  const now = new Date();
  /* s2 제출의 랜딩 주소가 될 값 — 없으면 빈 칸으로 둔다(지어내지 않는다) */
  const site = await prisma.entry.findUnique({
    where: { id: entryId },
    select: { serviceUrl: true, hostname: { select: { hostname: true } } },
  });
  const host =
    site?.hostname?.hostname ??
    (site?.serviceUrl ? new URL(site.serviceUrl).host : null);

  await prisma.$transaction(async (tx) => {
    await tx.entry.update({ where: { id: entryId }, data: { stage } });

    /* 이 진도에 필요한 제출물을 채운다 */
    for (const stageKey of needed) {
      await tx.submission.upsert({
        where: {
          entryId_stageKey_week: { entryId, stageKey, week: 0 },
        },
        create: {
          entryId,
          stageKey,
          week: 0,
          status: SubmissionStatus.submitted,
          payload: devPayload(stageKey, host),
          submittedBy: userId,
          submittedAt: now,
        },
        update: {
          status: SubmissionStatus.submitted,
          submittedAt: now,
          /*
            ⚠️ payload도 다시 쓴다. 안 그러면 전에 만들어 둔 것이 남아
            s2의 랜딩 주소가 빈 채로 굳는다(2026-09-21).
          */
          payload: devPayload(stageKey, host),
        },
      });
    }

    /*
      뒤로 되돌릴 때는 넘치는 제출물을 **지운다.** 남겨두면 "s1인데 s3 제출이
      있는" 상태가 되어 화면이 실제로는 나올 수 없는 조합을 그린다.
    */
    /*
      ⚠️ **판정을 먼저 지운다.** `judgments.submission_id`가 이 행을 가리켜
      그냥 지우면 외래키에 걸린다(2026-09-21에 되돌리기가 그것으로 막혔다).
    */
    await tx.judgment.deleteMany({
      where: { submission: { entryId, stageKey: { notIn: needed } } },
    });
    await tx.submission.deleteMany({
      where: { entryId, stageKey: { notIn: needed } },
    });
  });
}

export async function setSandboxStatus(args: {
  entryId: string;
  status: EntryStatus;
}): Promise<void> {
  assertSandbox();
  await prisma.entry.update({
    where: { id: args.entryId },
    data: { status: args.status },
  });
}

export async function setSandboxPhase(args: {
  seasonId: string;
  phase: SeasonPhase;
}): Promise<void> {
  assertSandbox();
  await prisma.season.update({
    where: { id: args.seasonId },
    data: { phase: args.phase },
  });
  /* h17이 깨운 다음 시즌을 재운다 — 이 줄이 h17에서 나오는 길이기도 하다 */
  await sleepNextSeason(args.seasonId);

  /*
    **레이스를 벗어나면 가정한 오늘을 푼다**(2026-09-21 수연 지적).
    오늘을 옮기는 것은 스테이지 줄인데 그 줄은 레이스에서만 뜬다 — 나가면
    아무도 그 값을 보여주지 않으면서 판정만 계속 옮겨진 오늘을 본다.
    끄는 버튼을 따로 두는 대신 여기서 같이 푼다.
  */
  if (args.phase !== SeasonPhase.racing) setDevToday(null);

  /*
    **「시즌 종료」는 이 줄이 만든다**(2026-09-20 수연 지시). 집계 줄에서 그
    선택지를 뺐으므로, 페이즈를 종료로 옮길 때 마지막 스냅샷을 확정으로
    바꿔 주지 않으면 리더보드 ③(FINAL 배너)을 만들 길이 없다.

    되돌아올 때도 같다 — 종료에서 레이스로 옮기면 확정을 풀어야 한다.
    안 그러면 페이즈는 레이스인데 화면은 계속 ③을 그린다.

    ⚠️ `keepStageDates`를 준다. 페이즈 줄은 일정을 손대는 자리가 아니다.
  */
  const snapshot = await prisma.leaderboardSnapshot.findFirst({
    where: { seasonId: args.seasonId },
    orderBy: { snapshotDate: "desc" },
    select: { isFinal: true },
  });
  if (!snapshot) return;

  const want =
    args.phase === SeasonPhase.awarded
      ? "final"
      : args.phase === SeasonPhase.racing
        ? "race"
        : null;
  if (!want || snapshot.isFinal === (want === "final")) return;

  await setMetricsFixture({
    seasonId: args.seasonId,
    kind: want,
    keepStageDates: true,
  });
}

/*
  로그인한 계정이 이번 시즌 참가팀에 속했는가 — 헤더(P7 「참가팀 없음」과 D 계열)·
  대시보드·신청 화면이 이것으로 갈린다. 판정은 access.ts와 같다: 이 시즌에
  참가(entry)한 팀의 멤버인가.

  ⚠️ **「없음」은 아무것도 지우지 않는다.** 참가를 지우려면 제출물·지표·동의 등
  참가에 매달린 표를 전부 훑어 지워야 하고, 로그인한 계정이 시드 팀의 팀장이면
  그 팀의 데이터가 사라진다. 대신 그 계정의 멤버 자리를 **보관용 dev 계정**으로
  옮긴다. 팀·참가·팀원 수는 그대로라 다른 화면이 안 흔들리고, 「있음」을 누르면
  보관해 둔 자리를 그대로 돌려받는다.

  보관해 둔 것이 없으면 새로 만든다. 이미 팀장인 팀이 있으면 그 팀으로 참가한다
  — 팀은 시즌을 넘어 유지된다는 apply-store.ts의 규칙과 같다.
*/
const parkedEmail = (userId: string) => `devbar-parked-${userId}@example.com`;

/** 「팀원」 줄이 2인 팀을 만들 때 앉히는 개발용 팀원. 한 계정을 돌려 쓴다 */
const MATE_EMAIL = "devbar-mate@example.com";

/**
 * 개발용 팀원 계정 「지민」을 만든다. **계정 동의 행까지** 같이 — 없으면 이 계정으로
 * 들어가는 순간 동의 모달이 모든 화면을 덮어(ConsentGate) 개발 바까지 못 누른다.
 */
async function createMate(): Promise<{ id: string }> {
  const user = await prisma.user.create({
    data: {
      email: MATE_EMAIL,
      name: "지민",
      nickname: "지민",
      onboardedAt: new Date(),
    },
    select: { id: true },
  });
  await prisma.consent.createMany({
    data: accountConsentRows({
      userId: user.id,
      marketing: false,
      ipHash: null,
      userAgent: null,
    }),
  });
  return user;
}



/**
 * 팀원 수를 1인·2인으로 맞춘다 — 팀 관리 화면의 두 판(개인 참가·2인 팀)을
 * 보려고 쓴다.
 *
 * 2인은 개발용 팀원 계정을 `member`로 앉히고, 1인은 **팀장이 아닌 팀원을 전부
 * 뺀다**(개발용 계정이든 초대로 들어온 계정이든). 살아 있는 초대는 건드리지
 * 않는다 — 2인이 되면 팀 관리 화면이 초대 상자를 안 그리고, 다시 1인이 되면
 * 그 초대가 그대로 「초대 대기」로 돌아온다.
 *
 * `isSolo`는 손대지 않는다. 그 값은 「팀 구성 완료」 표시라 허브 판(h1 등)이
 * 읽는데, 이 줄은 인원만 바꾸는 줄이다.
 */
export async function setSandboxTeamSize(args: {
  teamId: string;
  size: 1 | 2;
}): Promise<void> {
  assertSandbox();
  const { teamId, size } = args;

  if (size === 1) {
    await prisma.teamMember.deleteMany({
      where: { teamId, role: { not: MemberRole.leader } },
    });
    return;
  }

  /*
    왕복을 아낀다(dev DB는 한 번에 ~80ms). 트랜잭션·upsert 사슬 대신 셋으로 —
    인원 확인, 개발용 계정 찾기(없을 때만 만들기), 자리 만들기(이미 있으면 무시).
  */
  const [count, found] = await Promise.all([
    prisma.teamMember.count({ where: { teamId } }),
    prisma.user.findUnique({ where: { email: MATE_EMAIL }, select: { id: true } }),
  ]);
  const mate = found ?? (await createMate());
  /*
    개발용 팀원은 한 계정이라 **한 팀에만** 앉힌다. 두 팀에 걸쳐 있으면
    그 계정으로 들어갔을 때 화면이 어느 팀을 잡을지 정해지지 않는다(2026-09-21에
    실제로 다른 사람이 만든 팀이 잡혔다). 마지막으로 2인을 누른 팀이 이긴다 —
    이 팀이 이미 2인이어도 다른 팀의 자리는 정리한다.
  */
  await prisma.teamMember.deleteMany({
    where: { userId: mate.id, role: MemberRole.member, teamId: { not: teamId } },
  });
  if (count >= 2) return;
  await prisma.teamMember.createMany({
    data: [{ teamId, userId: mate.id, role: MemberRole.member }],
    skipDuplicates: true,
  });
  /*
    코드로 합류한 모양을 남긴다 — 팀 관리 ①이 「팀을 완성한 코드」 상자를
    그리는데, 초대 행이 없으면 그 상자가 비어 시안과 다르게 보인다.
  */
  await prisma.teamInvitation.create({
    data: {
      teamId,
      inviteCode: generateCode(),
      status: InvitationStatus.accepted,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
    },
  });
}


export async function hasSandboxTeam(args: {
  userId: string;
  seasonId: string;
}): Promise<boolean> {
  assertSandbox();
  const found = await prisma.teamMember.findFirst({
    where: {
      userId: args.userId,
      team: { entries: { some: { seasonId: args.seasonId } } },
    },
    select: { id: true },
  });
  return !!found;
}

export async function setSandboxTeam(args: {
  userId: string;
  seasonId: string;
  on: boolean;
}): Promise<void> {
  assertSandbox();
  const { userId, seasonId, on } = args;
  const inSeason = { team: { entries: { some: { seasonId } } } };

  await prisma.$transaction(async (tx) => {
    const parked = await tx.user.upsert({
      where: { email: parkedEmail(userId) },
      update: {},
      create: {
        email: parkedEmail(userId),
        name: "보관",
        nickname: "보관",
        onboardedAt: new Date(),
      },
      select: { id: true },
    });

    if (!on) {
      await tx.teamMember.updateMany({
        where: { userId, ...inSeason },
        data: { userId: parked.id },
      });
      return;
    }

    if (await tx.teamMember.findFirst({ where: { userId, ...inSeason } })) return;

    /* 보관해 둔 자리부터 돌려준다 */
    const back = await tx.teamMember.updateMany({
      where: { userId: parked.id, ...inSeason },
      data: { userId },
    });
    if (back.count > 0) return;

    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { nickname: true },
    });
    const leading = await tx.teamMember.findFirst({
      where: { userId, role: MemberRole.leader },
      select: { teamId: true },
    });
    const teamId =
      leading?.teamId ??
      (
        await tx.team.create({
          data: {
            name: `${user.nickname}팀`.slice(0, 60),
            isSolo: true,
            members: { create: { userId, role: MemberRole.leader } },
          },
          select: { id: true },
        })
      ).id;

    const entry = await tx.entry.create({
      data: {
        seasonId,
        teamId,
        ideaTitle: "개발 바가 만든 참가작",
        appliedAt: new Date(),
      },
      select: { id: true },
    });

    /* 신청 화면이 남기는 참가 동의와 같은 행 — 버전도 진짜 값이다 */
    await tx.consent.createMany({
      data: applyConsentRows({
        userId,
        entryId: entry.id,
        consent: Object.fromEntries(APPLY_CONSENTS.map((c) => [c.key, true])),
        ipHash: null,
        userAgent: null,
      }),
    });
  });
}

// ═════════════════════════════════════════════════════════════
// 집계 데이터 — 리더보드 세 상태를 만든다
// ═════════════════════════════════════════════════════════════

/*
  시안 리더보드의 STATE 셋이다.

    none  집계 전     스냅샷도 일별 지표도 없음. 표는 뜨되 순위 칸이 비어 있다
    race  레이스 운영중 이틀치 스냅샷 + 14일 일별 지표. 순위와 전일 대비가 산다
    final 시즌 종료   위와 같고 마지막 스냅샷이 is_final. FINAL 배너가 뜬다

  ⚠️ **여기서 만드는 숫자는 가짜다.** 이 제품이 파는 것이 「조작 불가능한 지표」라
  가짜 지표를 만드는 함수는 그 자체로 위험하다. dev 전용이라 허용하되 셋을 지킨다.

    ① assertSandbox가 맨 위에 있다 — 운영 DB에서는 아예 안 돈다
    ② 값을 팀 순서로 **결정적으로** 만든다. 난수를 쓰면 새로 고칠 때마다 숫자가
       흔들려 화면을 비교할 수 없다
    ③ metric_daily.source를 manual로 남긴다. 화면이 「운영자 보정」으로 표시하므로
       스크린샷에 자동 집계인 것처럼 찍히지 않는다
*/
export type MetricsFixture = "none" | "race" | "final";

/**
 * 시안 리더보드(3533행 `TEAMS`)의 12팀. 순서가 곧 순위다.
 *
 * ⚠️ **화면이 이 값을 계산으로 만들어 낸다.** 롤업이 `metric_daily`를 합산해
 * 스냅샷을 다시 쓰므로(`lib/rollup.ts`), 여기 적은 누적·증감이 그대로 나오려면
 * 일별 지표가 그 합이 되어야 한다 — `specDaily()`가 그 일을 한다.
 *
 * 팀·참가작·주소를 dev DB에 심는 것은 `scripts/design-diff/spec-teams.mts`다.
 */
export const SPEC_TEAMS = [
  { team: "새벽창고", idea: "새벽 배송 재고 공유 보드", host: "dawn-depot", visitors: 1248, delta: 86 },
  /*
    참가작 상세(시안 1800행)의 목업이 이 팀이다. 한 줄 소개는 거기에만 있어서
    (`.pj-con`, 1817행) 이 자리에만 둔다 — 나머지 팀 소개는 시안에 없다.
  */
  {
    team: "리틀포션",
    idea: "1인 카페 시그니처 레시피 구독",
    summary:
      "1인 카페 사장님을 위한 시그니처 레시피 구독, 매주 신메뉴 레시피와 원가표를 받아 보세요.",
    host: "little-potion",
    visitors: 1102,
    delta: 64,
  },
  { team: "오늘의루틴", idea: "작심삼일 방지 인증 루틴", host: "todays-routine", visitors: 987, delta: 51 },
  { team: "밥값하는AI", idea: "점심 메뉴 사다리 정산 봇", host: "babgap-ai", visitors: 842, delta: 38 },
  { team: "골목마켓", idea: "동네 소상공인 공동구매", host: "golmok-market", visitors: 731, delta: 29 },
  { team: "페이지원", idea: "전자책 첫 장 미리보기 큐레이션", host: "page-one", visitors: 668, delta: 44 },
  { team: "두잇로그", idea: "사이드프로젝트 공개 회고 피드", host: "doit-log", visitors: 512, delta: 17 },
  { team: "모카브루", idea: "홈카페 원두 취향 매칭", host: "mocha-brew", visitors: 455, delta: 22 },
  { team: "러닝메이트", idea: "러닝 크루 즉석 매칭", host: "running-mate", visitors: 389, delta: 9 },
  { team: "시들지마", idea: "화분 급수 알림 위젯", host: "sidljima", visitors: 214, delta: 6 },
  { team: "북클럽라이트", idea: "3줄 독서 노트 공유", host: "bookclub-lite", visitors: 157, delta: 3 },
  /* 마지막 한 팀은 미배포다 — 「미배포」 배지와 「-」 증감이 그 자리에서 나온다 */
  { team: "혼밥연구소", idea: "1인분 장보기 리스트", host: "honbap-lab", visitors: 0, delta: 0 },
] as const;

/** 픽스처가 만드는 일별 지표의 날수. 화면은 전일까지만 공개한다 */
const DAYS = 14;

/**
 * 한 팀의 14일치 일별 유효 이용자.
 *
 * **마지막 날에 증감을 그대로 담고**, 앞 13일에 나머지를 완만히 늘어나는
 * 곡선으로 나눈다. 그래야 스냅샷 둘(어제·그제)의 차이가 시안의 「전일 대비」와
 * 정확히 같아진다 — 그제 스냅샷은 앞 13일 합, 어제 것은 14일 합이다.
 *
 * 반올림 오차는 13번째 날에 몰아 보정한다. 앞 13일의 합이 어긋나면 증감이
 * 1~2씩 흔들려서, 시안 값과 대조할 수 없게 된다.
 */
function specDaily(index: number): number[] | null {
  const spec = SPEC_TEAMS[index];
  if (!spec) return null;
  if (spec.visitors === 0) return Array<number>(DAYS).fill(0);

  const head = spec.visitors - spec.delta;
  const weights = Array.from({ length: DAYS - 1 }, (_, day) => 0.6 + day * 0.06);
  const sum = weights.reduce((a, b) => a + b, 0);
  const values = weights.map((w) => Math.max(1, Math.round((head * w) / sum)));
  values[values.length - 1] += head - values.reduce((a, b) => a + b, 0);
  return [...values, spec.delta];
}

/**
 * 팀 순서로 정해지는 값. 시안에 없는 자리(13번째 팀부터)는 옛 곡선을 쓴다 —
 * dev DB에 팀이 더 있어도 숫자가 비지 않게.
 */
function fixtureVisitors(index: number, day: number): number {
  const series = specDaily(index);
  if (series) return series[day] ?? 0;
  const base = 320 - index * 38;
  return Math.max(4, Math.round(base * (0.45 + day * 0.045)));
}

/*
  ⚠️ **픽스처가 스테이지 날짜도 함께 옮긴다.** 순위표만 채우면 트랙은 여전히
  시즌 시작 전(s1)을 가리켜서, 「레이스 운영중」을 골라도 레이스 중인 화면이
  아니다. §6 대조가 267건으로 벌어졌던 것이 그래서다(2026-09-06).

  시안이 그리는 순간은 **s4 진행 중, 1차 심사 통과**다(3354행: i<3 done,
  i===3 now). 그 순간을 여기서 만든다.

  주 단위(7일)와 「다음 스테이지 열리기 1분 전 마감」은 실제 캘린더 규칙 그대로다
  — 시즌 9/28~11/1을 5주로 끊은 것과 같은 모양이라, 옮겨도 구조는 안 망가진다.

  ⚠️ **「시즌 종료」는 예외다** — 시즌 자체의 일정을 쓴다(`scheduleStageDates`).
  2026-09-20까지는 종료도 s4를 진행 중으로 뒀는데, 시안이 세 상태에서 같은
  트랙을 그리기 때문이었다(`#lbTrack` 하나를 세 pane이 공유한다). 같은 날
  종료 트랙이 「스테이지 전부 통과 + 마지막 게이트가 현재」로 갈리면서 그
  이유가 없어졌다.

  ⚠️ 그리고 종료 화면에는 **지금 기준의 값이 하나도 없다** — 갱신 줄도
  내렸다. 그런데도 날짜를 지금 기준으로 옮기면 수연의 임시 일정(시즌 10.12~
  11.17)만 덮어써서, 확정일이 오늘로 보이고 다른 화면과 어긋난다
  (2026-09-20 수연 지적).
*/
const WEEK_MS = 7 * 86_400_000;
const MIN_MS = 60_000;

/**
 * 시즌이 제 일정대로 끝난 모양. 시작일에서 한 주씩 끊고 s5 마감만 시즌
 * 종료일에 맞춘다 — 수연의 임시 일정(s1 10.12 ~ s5 11.16 24:00)이 그 모양이다.
 * 시작일이 없으면 옮길 근거가 없으니 그대로 둔다.
 */
function scheduleStageDates(startsAt: Date | null, endsAt: Date | null) {
  if (!startsAt) return [];
  const KEYS = [StageKey.s1, StageKey.s2, StageKey.s3, StageKey.s4, StageKey.s5];
  return KEYS.map((stageKey, i) => {
    const opensAt = new Date(startsAt.getTime() + i * WEEK_MS);
    const last = i === KEYS.length - 1;
    return {
      stageKey,
      opensAt,
      /* 마감은 다음 스테이지가 열리기 1분 전, 마지막은 시즌 종료 시각 */
      closesAt: last
        ? (endsAt ?? new Date(opensAt.getTime() + WEEK_MS))
        : new Date(opensAt.getTime() + WEEK_MS - MIN_MS),
    };
  });
}

export async function setMetricsFixture(args: {
  seasonId: string;
  kind: MetricsFixture;
  /**
   * 스테이지 날짜를 옮기지 않는다. **스테이지 줄이 부를 때** 준다 —
   * 그쪽이 방금 날짜를 정해 놓았는데 여기서 다시 옮기면 고른 스테이지가
   * 다시 쓰지 않는다. 지금은 픽스처도 시즌 일정만 쓰므로 결과가 같지만,
   * 「스테이지 줄은 일정을 손대지 않는다」는 뜻을 남겨 둔다.
   */
  keepStageDates?: boolean;
}): Promise<void> {
  assertSandbox();
  const { seasonId, kind } = args;

  /*
    ⚠️ **왕복 횟수가 곧 체감 속도다.** Neon이 싱가포르에 있어 한 번 오가는 데
    80ms 안팎이다. 처음에는 조회·삭제·삽입을 순서대로 await 했더니 일곱 번을
    오가며 2.2초가 걸렸다. 지금은 조회 한 번, 쓰기 한 번이다.

    팀장을 entries 조회에 같이 담는 것도 같은 이유다 — team_members를 따로
    읽으면 그만큼 왕복이 는다.
  */
  const entries = await prisma.entry.findMany({
    where: { seasonId, status: EntryStatus.active },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      team: {
        select: {
          members: {
            where: { role: MemberRole.leader },
            take: 1,
            select: { userId: true },
          },
        },
      },
    },
  });

  const entryIds = entries.map((e) => e.id);

  /* 언제나 먼저 비운다. 덧쌓으면 같은 버튼을 두 번 눌렀을 때 값이 배가 된다 */
  const clear = [
    prisma.leaderboardSnapshot.deleteMany({ where: { seasonId } }),
    prisma.metricDaily.deleteMany({ where: { entryId: { in: entryIds } } }),
    /*
      수상도 함께 지운다. 「시즌 종료」에서 만든 것이 남으면 레이스로 되돌려도
      배지가 그대로 붙어 있다.
    */
    prisma.award.deleteMany({ where: { seasonId } }),
  ];

  /*
    ⚠️ 셋 다 **리더보드 플래그를 켠다.** 이 줄은 리더보드 세 상태를 보려고
    누르는 것인데, s1~s3에서 눌렀으면 플래그가 꺼져 있어(스테이지 줄) 화면이
    404가 된다. 「집계 전」도 마찬가지다 — 그 상태 자체가 「플래그는 켜졌고
    숫자만 아직 없는」 화면이다.
  */
  const season = await prisma.season.findUniqueOrThrow({
    where: { id: seasonId },
    select: {
      featureFlags: true,
      startsAt: true,
      endsAt: true,
      /* 시상 페이즈로 넘어가는 시각 = 2차 심사(최종)가 끝나는 때 */
      schedules: {
        where: { phase: SeasonPhase.awarded },
        take: 1,
        select: { startsAt: true },
      },
    },
  });
  const flags = season.featureFlags as Prisma.InputJsonObject | null;
  const flagOn = prisma.season.update({
    where: { id: seasonId },
    data: { featureFlags: { ...(flags ?? {}), leaderboard: true } },
  });

  /*
    스테이지 날짜는 **언제나 시즌 제 일정**이다(2026-09-21 수연 지시).
    예전에는 「집계 전」·「레이스」가 일정을 지금 쪽으로 끌어와, 볼 때마다 시즌
    날짜가 달라졌다. 지금은 반대다 — 일정은 그대로 두고 개발용 시계가 「오늘」을
    옮긴다(`lib/dev-clock.ts`, 개발 바 스테이지 줄).
  */
  const dates = scheduleStageDates(season.startsAt, season.endsAt);
  const stageDates = args.keepStageDates
    ? []
    : dates.map((s) =>
        prisma.stage.updateMany({
          where: { seasonId, stageKey: s.stageKey },
          data: { opensAt: s.opensAt, closesAt: s.closesAt },
        }),
      );

  if (kind === "none" || entries.length === 0) {
    await prisma.$transaction([...clear, ...stageDates, flagOn]);
    return;
  }

  /*
    오늘은 빼고 어제까지 14일. 화면이 전일까지만 공개하기 때문이다.

    ⚠️ 하루의 기준은 **서울 날짜**다(`seoulDateOnly`). UTC로 자르면 한국 시간
    오전 9시 전에 하루가 밀려서, 화면이 찾는 마지막 날에 행이 없다 — 「최근
    7일」의 끝 칸이 빈 채로 대조를 돌게 된다(실제로 그랬다).
  */
  const today = seoulDateOnly(devNow());

  const daily = entries.flatMap((entry, index) =>
    Array.from({ length: 14 }, (_, day) => {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() - 14 + day);
      const visitors = fixtureVisitors(index, day);
      return {
        entryId: entry.id,
        metricDate: date,
        validVisitors: visitors,
        signups: Math.round(visitors * 0.16),
        revenue: BigInt(index === 0 ? visitors * 900 : 0),
        /* 「운영자 보정」으로 표시된다 — 자동 집계인 척하지 않는다 */
        source: MetricSource.manual,
        manualReviewPassed: true,
      };
    }),
  );

  /*
    스냅샷은 **이틀치**를 만든다. 하루만 만들면 전일 대비 열이 전부 「—」다 —
    앞 집계가 없으면 증감이 성립하지 않기 때문이고, 그 칸도 검토 대상이다.
  */
  const snapshots = [1, 0].flatMap((back) => {
    const snapshotDate = new Date(today);
    snapshotDate.setUTCDate(snapshotDate.getUTCDate() - 1 - back);
    const isLatest = back === 0;

    return entries.map((entry, index) => {
      const rolled = Array.from({ length: 14 - back }, (_, day) =>
        fixtureVisitors(index, day),
      ).reduce((sum, v) => sum + v, 0);
      /*
        ⚠️ **종료의 최종치는 레이스보다 크다.** 시안이 FINAL 표를 `u+120+i*7`로
        그린다(3566행) — 배너가 말하는 「2차 심사(최종) 검증 반영」이 숫자에도
        나타난 것이다. 2026-09-20 수연이 이 값을 종료 목 데이터로 지정했다.

        마지막 집계에만 얹는다. 앞 집계는 레이스 때 보이던 값 그대로여야
        「검증에서 올라갔다」가 성립한다.

        지표가 0인 미배포 팀은 올리지 않는다 — 시안도 FINAL 표에서 그 팀을
        빼고 나머지만 매긴다.
      */
      const total =
        isLatest && kind === "final" && rolled > 0
          ? rolled + 120 + index * 7
          : rolled;
      return {
        seasonId,
        entryId: entry.id,
        snapshotDate,
        rank: index + 1,
        score: total,
        validVisitorsTotal: total,
        revenueTotal: BigInt(index === 0 ? total * 900 : 0),
        isFinal: isLatest && kind === "final",
        /* 하위 팀은 축 하한 미달로 시상 제외 — 그 표시도 화면에 있다 */
        isAwardEligible: index < entries.length - 1,
      };
    });
  });

  /*
    지표 공개 동의. 참가작 상세가 이 동의가 없으면 숫자를 통째로 가려서
    (public-read.ts) 순위 카드도 7일 추세도 안 보인다.

    ⚠️ 동의는 append-only 로그다 — 기존 행을 고치거나 지우지 않고 새 행을 쌓는다.
    화면은 가장 최근 행을 최종 상태로 읽는다(스키마 consents 주석).
  */
  const consents = entries.flatMap((entry) => {
    const userId = entry.team.members[0]?.userId;
    if (!userId) return [];

    return [
      {
        userId,
        entryId: entry.id,
        type: ConsentType.metrics_public,
        granted: true,
        version: "[개발용]",
      },
      /*
        계정 단위 동의(`entryId: null`) — 시안 ver4가 콜백 뒤 모달로 받기
        시작한 것이다(`ConsentGate`).

        ⚠️ **이게 없으면 개발용 계정 전원이 모든 화면에서 동의 모달에 막힌다.**
        게이트는 「계정 동의 기록이 있는가」를 보는데, 시드가 지표 공개 동의만
        넣고 있어서 한 건도 안 걸렸다. 이 픽스처들은 「이미 가입해 쓰고 있는
        회원」을 흔내는 것이므로 동의를 마친 상태가 맞다 — 시안도 「기존 회원은
        모달 없이 통과」로 적었다.

        동의 모달 자체를 보려면 새 소셜 계정으로 로그인하면 된다.

        ⚠️ 버전은 `[개발용]`이 아니라 **진짜 버전 문자열**이어야 한다.
        게이트가 버전을 비교해 「낮으면 재동의」로 판정하므로(account-consent.ts),
        파싱 안 되는 값을 넣으면 모달이 영원히 뜼다.
      */
      {
        userId,
        entryId: null,
        type: ConsentType.terms,
        granted: true,
        version: ACCOUNT_TERMS_CONSENT_VERSION,
      },
      {
        userId,
        entryId: null,
        type: ConsentType.privacy,
        granted: true,
        version: ACCOUNT_PRIVACY_CONSENT_VERSION,
      },
    ];
  });

  /*
    시안의 FINAL 표는 상위 셋에 수상 배지를 붙인다(3388·3396행 — 🏆 대상·2위·3위).
    라벨은 `public-read.ts`의 `awardOf`가 rank에서 만들어 내므로 rank만 넣는다.
  */
  const awards =
    kind === "final"
      ? entries.slice(0, 3).map((entry, index) => ({
          seasonId,
          entryId: entry.id,
          rank: index + 1,
          /*
            확정 시각이 곧 배너의 날짜다(`public-read`의 `finalizedAt`).
            지금을 쓰면 시즌이 11월에 끝나는데 확정일만 오늘로 보인다.
          */
          awardedAt:
            season.schedules[0]?.startsAt ?? season.endsAt ?? new Date(),
        }))
      : [];

  await prisma.$transaction([
    ...clear,
    ...stageDates,
    flagOn,
    prisma.award.createMany({ data: awards, skipDuplicates: true }),
    prisma.metricDaily.createMany({ data: daily, skipDuplicates: true }),
    prisma.leaderboardSnapshot.createMany({
      data: snapshots,
      skipDuplicates: true,
    }),
    prisma.consent.createMany({ data: consents }),
  ]);
}

/**
 * 리더보드 플래그 한 칸만 바꾼다.
 *
 * JSONB를 통째로 덮어쓰지 않고 읽어서 한 키만 고친다 — 이 함수가 모르는 키를
 * 지워버리면 그게 제일 찾기 어려운 버그가 된다.
 */
async function setLeaderboardFlag(
  tx: Prisma.TransactionClient,
  seasonId: string,
  on: boolean,
): Promise<void> {
  const season = await tx.season.findUniqueOrThrow({
    where: { id: seasonId },
    select: { featureFlags: true },
  });
  const flags = (season.featureFlags ?? {}) as Prisma.InputJsonObject;
  await tx.season.update({
    where: { id: seasonId },
    data: { featureFlags: { ...flags, leaderboard: on } },
  });
}

/*
  레이스 중 지금 스테이지를 고른다.

  **일정을 옮기지 않는다**(2026-09-21 수연 지시). 고른 스테이지가 열린 날을
  「오늘」로 가정할 뿐이다 — s2를 누르면 오늘이 10.19다. 예전에는 반대로 다섯
  스테이지를 지금 쪽으로 끌어왔는데, 그러면 볼 때마다 시즌 날짜가 달라져
  수연이 세 번 걸렸다. 정본은 시즌 일정이고 움직이는 것은 오늘이다
  (`lib/dev-clock.ts`).

  연 날 **정오**로 잡는다. 자정은 `opensAt`과 같은 순간이라 경계 판정
  (`opensAt <= now`)이 구현마다 갈릴 수 있다 — 하루 안쪽이면 그 다툼이 없다.

  **리더보드 플래그는 그대로 같이 옮긴다**(2026-09-20 수연 지시). 시즌1은 s4
  시작 전까지 플래그를 끄기로 했으므로(`leaderboard-flag-off-until-s4`),
  s4·s5를 고르면 켜지고 s1~s3을 고르면 꺼진다 — 스테이지만 옮기면 바가 말하는
  상태와 화면이 어긋난다.
*/
export async function setSandboxCurrentStage(args: {
  seasonId: string;
  stage: StageKey;
}): Promise<void> {
  assertSandbox();
  const KEYS = [StageKey.s1, StageKey.s2, StageKey.s3, StageKey.s4, StageKey.s5];
  const at = KEYS.indexOf(args.stage);

  const stage = await prisma.stage.findFirstOrThrow({
    where: { seasonId: args.seasonId, stageKey: args.stage },
    select: { opensAt: true },
  });
  if (!stage.opensAt) {
    throw new Error(`[dev] ${args.stage}에 일정이 없어 오늘을 옮길 수 없습니다.`);
  }
  setDevToday(new Date(stage.opensAt.getTime() + 12 * 3_600_000));

  /*
    **집계 상태도 같이 옮긴다**(2026-09-20 수연 지시). 고를 것이 있는 스테이지는
    s4뿐이라 바에서 집계 줄도 거기서만 뜬다 — 나머지는 여기서 정해 준다.

      s1~s3  아직 집계가 시작되지 않았다 → 집계 전
      s4     고르는 자리다 → 지금 값을 그대로 둔다
      s5     레이스가 돌고 있다 → 레이스 운영중

    `keepStageDates`는 이제 없어도 같지만(픽스처가 시즌 일정만 쓴다) 그대로 둔다 —
    스테이지 줄은 일정을 손대는 자리가 아니라는 뜻을 남긴다.
  */
  const kind: MetricsFixture | null =
    args.stage === StageKey.s5
      ? "race"
      : args.stage === StageKey.s4
        ? null
        : "none";
  if (kind) {
    await setMetricsFixture({
      seasonId: args.seasonId,
      kind,
      keepStageDates: true,
    });
  }

  /*
    ⚠️ **플래그는 픽스처 뒤에 쓴다.** `setMetricsFixture`는 무엇을 부르든 리더보드
    플래그를 켠다(그 줄은 리더보드 상태를 보려고 누르는 자리라서다). 먼저 꺼 두면
    바로 뒤에서 도로 켜져, s1~s3을 골라도 「리더보드 보기」가 남았다
    (2026-09-21 수연 지적). 스테이지 줄이 마지막에 말한다.
  */
  await prisma.$transaction(async (tx) => {
    await setLeaderboardFlag(tx, args.seasonId, at >= KEYS.indexOf(StageKey.s4));
  });
}

// ═════════════════════════════════════════════════════════════
// 허브 17종 — 시안 `#scr-hub`의 `<select id="hubSel">`
// ═════════════════════════════════════════════════════════════

/*
  개발 바의 「진도」 줄과 대조 스크립트(`scripts/design-diff/hub-state.mts`)가
  **같은 표**를 쓴다. 시안 드롭다운을 그대로 옮긴 것이고, 라벨도 시안 그대로다
  (2026-09-21 수연 지시 — 「개발 바에 진도 줄 사진과 동일하게」).

  ⚠️ **화면 열다섯에 이 표 열일곱이 대응한다.** h16은 DB 상태가 h9와 같아
  아카이브 한 판으로 합쳤고(`hub-state.ts` 머리 주석), h17은 **이번 시즌
  참가 기록이 없는 사람**이라 `resolveHubPane`을 거치지 않는다.

  ⚠️ 한 판이 여러 축을 한꺼번에 옮긴다(페이즈·진도·생존·팀·측정·집계·오늘).
  그래서 이 줄을 누르면 아래 다른 줄들의 값도 같이 바뀐다.
*/
export type HubKey =
  | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "h7" | "h8" | "h9"
  | "h10" | "h11" | "h12" | "h13" | "h14" | "h15" | "h16" | "h17";

type HubPlan = {
  label: string;
  group: "정상 흐름" | "예외";
  phase: SeasonPhase;
  stage: EntryStage;
  /** 기본은 정상(active) */
  status?: EntryStatus;
  /** 팀 구성 완료인가. 1인 팀이면 신청만으로 끝난다(access.ts) */
  solo: boolean;
  /** 측정 연동 검증이 끝났는가 */
  verified: boolean;
  metrics?: MetricsFixture;
  /** 레이스 중 「오늘」을 이 스테이지로 옮긴다 */
  raceStage?: StageKey;
  /** 골든패스의 ✓가 되는 임시저장 */
  draft?: { stageKey: StageKey; payload: Prisma.InputJsonObject };
  /** 그 스테이지 제출을 **지운다**(미제출 탈락) */
  unsubmit?: StageKey;
  /** 그 스테이지 제출에 미통과 판정을 단다 */
  judgeFail?: StageKey;
  /** 실격 제재를 남긴다 — 헤더가 사유와 소명 기한을 읽는다 */
  sanction?: boolean;
  /** 다음 시즌을 모집 중으로 둔다 */
  nextSeason?: boolean;
  /*
    로그인한 계정의 참가 자리를 보관 계정으로 옮긴다 — 「참가팀 없음」 줄과
    같은 일이다(`setSandboxTeam`). 지각 참가(h10)가 그 상태다: 아직 팀이
    없어서 온보딩을 이제부터 해야 하는 사람이다(2026-09-21 수연 지시).
  */
  parked?: boolean;
  /*
    시안 목업이 그 판에 적어 둔 값. 화면을 시안과 같게 보려고 심는다.

    ⚠️ **이것은 화면 검토용 dev 데이터다.** 시안 h3의 「24명」, h4의
    「방문자 471 · 사전 신청자 24 · 전환율 5.1%」가 그 출처이고 24/471이 실제로
    5.1%다. 운영에서는 엣지가 센 값만 들어온다.
  */
  leads?: number;
  visitors?: number;
  /*
    확정 집계가 끝난 판(h7·h8·h9)이 그리는 값. 시안 목업이 적어 둔 그대로다 —
    유효 이용자 1,248 · 주간 활성 512 · 재방문율 31% · 매출 ₩126,000 · 2위,
    수상은 「🏆 우수상」.

    ⚠️ **주간 활성과 재방문율은 채점 축이 아니라 참고 지표다**(`metric_extra_daily`).
    무엇을 참고 지표로 셀지는 아직 정해지지 않았고(PLN6 6장 1번), 여기서 만드는
    것은 **화면 검토용 dev 데이터**다 — 정의가 오면 엣지가 센 값이 들어온다.
  */
  spec?: {
    validUsers?: number;
    revenue?: number;
    rank?: number;
    /** 참고 지표 — 사람 수 */
    weeklyActive?: number;
    /** 참고 지표 — 퍼센트 */
    retention?: number;
    /** 종합 시상 문구 */
    award?: string;
    /** 게이트 둘(s2·s5)을 통과 처리한다 — 시안 h9의 「2 PASS」 */
    gatePass?: boolean;
  };
  /*
    개발 바의 「진도」 줄에 버튼을 두는가. 기본은 둔다.

    ⚠️ **다른 줄이 이미 만드는 판은 뺐다**(2026-09-21 수연 결정).
      h1        「참가팀 없음」 줄이 같은 화면(온보딩)을 만든다
      h2·h3·h5·h6·h7  스테이지 줄이 그 주차의 팀으로 진도까지 옮긴다(`setSandboxPace`)
    **표에서는 지우지 않는다** — 대조 스크립트(`hub-state.mts h2` …)가 이 판들을
    계속 쓰고, 그쪽은 세 폭을 돌며 한 판씩 정확히 세워야 한다.
  */
  inBar?: boolean;
};

export const HUB_PLANS: Record<HubKey, HubPlan> = {
  /* h1 온보딩 미완료 — 바에는 없다(위 `inBar` 주석) */
  h1: {
    label: "1, 온보딩 미완료", group: "정상 흐름", inBar: false,
    phase: SeasonPhase.recruiting, stage: EntryStage.applied,
    solo: false, verified: false,
  },
  h2: {
    label: "2, s1 제출 전", group: "정상 흐름", inBar: false,
    phase: SeasonPhase.racing, stage: EntryStage.applied,
    solo: true, verified: true, raceStage: StageKey.s1,
    /* 셋 중 둘을 끝낸 모양 — 시안 h2가 그렇다 */
    draft: { stageKey: StageKey.s1, payload: { guideChecks: [true, true, false] } },
  },
  h3: {
    label: "3, s2 진행 중", group: "정상 흐름", inBar: false,
    phase: SeasonPhase.racing, stage: EntryStage.s1,
    solo: true, verified: true, raceStage: StageKey.s2, leads: 24,
    draft: { stageKey: StageKey.s2, payload: { guideChecks: [true, false, false] } },
  },
  h4: {
    label: "4, 1차 심사 대기", group: "정상 흐름",
    phase: SeasonPhase.racing, stage: EntryStage.s2,
    solo: true, verified: true, raceStage: StageKey.s2,
    leads: 24, visitors: 471,
  },
  h5: {
    label: "5, s3 빌드와 배포", group: "정상 흐름", inBar: false,
    phase: SeasonPhase.racing, stage: EntryStage.s3,
    solo: true, verified: true, raceStage: StageKey.s3,
    /* 빌더는 골랐고 배포 주소는 아직 — 시안 h5가 그 모양이다 */
    draft: {
      stageKey: StageKey.s3,
      payload: { builder: "러버블", launchChecks: [], aiChecks: [] },
    },
  },
  h6: {
    label: "6, s4 레이스", group: "정상 흐름", inBar: false,
    phase: SeasonPhase.racing, stage: EntryStage.s4,
    solo: true, verified: true, raceStage: StageKey.s4, metrics: "race",
  },
  h7: {
    label: "7, 2차 심사 대기", group: "정상 흐름", inBar: false,
    phase: SeasonPhase.racing, stage: EntryStage.s5,
    solo: true, verified: true, raceStage: StageKey.s5, metrics: "final",
    spec: {
      validUsers: 1248, revenue: 126_000, rank: 2,
      weeklyActive: 512, retention: 31,
    },  },
  h8: {
    label: "8, 시상 발표", group: "정상 흐름",
    phase: SeasonPhase.awarded, stage: EntryStage.completed,
    solo: true, verified: true, metrics: "final",
    spec: {
      validUsers: 1248, revenue: 126_000, rank: 2,
      weeklyActive: 512, retention: 31, award: "🏆 우수상", gatePass: true,
    },
  },
  h9: {
    label: "9, 시즌 아카이브", group: "정상 흐름",
    phase: SeasonPhase.archived, stage: EntryStage.completed,
    solo: true, verified: true, metrics: "final",
    spec: {
      validUsers: 1248, revenue: 126_000, rank: 2,
      weeklyActive: 512, retention: 31, gatePass: true,
    },  },

  /*
    h10 지각 참가 — 레이스가 시작된 뒤에 온 사람이라 **참가팀이 아직 없다**
    (2026-09-21 수연 지시). h1과 갈리는 것은 페이즈다(모집 중 → 레이스).
  */
  h10: {
    label: "10, 지각 참가", group: "예외",
    phase: SeasonPhase.racing, stage: EntryStage.applied,
    solo: false, verified: false, raceStage: StageKey.s1, parked: true,
  },
  /* h11 게이트 미제출 탈락 — 마감이 지나도록 s2를 안 냈다 */
  h11: {
    label: "11, 게이트 미제출 탈락", group: "예외",
    phase: SeasonPhase.racing, stage: EntryStage.s2,
    status: EntryStatus.eliminated, solo: true, verified: true,
    raceStage: StageKey.s3, unsubmit: StageKey.s2,
  },
  /* h12 탈락팀 접근 — 냈지만 1차에서 미통과였다 */
  h12: {
    label: "12, 탈락팀 접근", group: "예외",
    phase: SeasonPhase.racing, stage: EntryStage.s2,
    status: EntryStatus.eliminated, solo: true, verified: true,
    raceStage: StageKey.s4, judgeFail: StageKey.s2,
    /* 시안 「신청 3명, 전환율 0.8%」 — 3/375가 실제로 0.8%다 */
    leads: 3, visitors: 375,
  },
  /* h13 미배포 레이스 — 레이스에 들어왔는데 측정 연동이 안 끝났다 */
  h13: {
    label: "13, 미배포 레이스", group: "예외",
    phase: SeasonPhase.racing, stage: EntryStage.s4,
    solo: true, verified: false, raceStage: StageKey.s4, metrics: "race",
  },
  h14: {
    label: "14, 레이스 중 실격", group: "예외",
    phase: SeasonPhase.racing, stage: EntryStage.s4,
    status: EntryStatus.disqualified, solo: true, verified: true,
    raceStage: StageKey.s4, metrics: "race", sanction: true,
  },
  /*
    h15 s5 자동 제출 확인 — 진도는 s4까지이고 **지금 스테이지가 s5**다.
    h6과 갈리는 것이 그 하나라 `raceStage`가 판을 만든다.
  */
  h15: {
    label: "15, s5 자동 제출 확인", group: "예외",
    phase: SeasonPhase.racing, stage: EntryStage.s4,
    /*
      ⚠️ 집계는 **레이스**다 — 「최종 지표는 자동으로 집계돼요」가 아직 확정
      전이라는 말이고, `setSandboxCurrentStage(s5)`도 레이스로 되돌린다.
      화면에 뜨는 넷은 시안 목업 값이라 아래 `spec`이 얹는다.
    */
    solo: true, verified: true, raceStage: StageKey.s5, metrics: "race",
    spec: {
      validUsers: 1248, revenue: 126_000, rank: 2,
      weeklyActive: 512, retention: 31,
    },
  },
  /* h16 종료 후 쓰기 시도 — DB 상태는 h9와 같다. 누른 판을 `dev-hub.ts`가 남겨 가른다 */
  h16: {
    label: "16, 종료 후 쓰기 시도", group: "예외",
    phase: SeasonPhase.archived, stage: EntryStage.completed,
    solo: true, verified: true, metrics: "final",
    /* 시안 h16의 요약 넷은 h9와 같은 값이다 */
    spec: {
      validUsers: 1248, revenue: 126_000, rank: 2,
      weeklyActive: 512, retention: 31, gatePass: true,
    },
  },
  /*
    h17 다음 시즌 참가 — **지금 시즌이 바뀐다.** 지난 시즌은 아카이브되고
    다음 시즌이 모집 중으로 선다(시안 배너도 「시즌 2, 모집 중」이다).
    그래서 `phase`는 다음 시즌 것이고, 지난 시즌은 `nextSeason`이 재운다.
  */
  h17: {
    label: "17, 다음 시즌 참가", group: "예외",
    phase: SeasonPhase.recruiting, stage: EntryStage.completed,
    solo: true, verified: true, metrics: "final", nextSeason: true,
  },
};

/**
 * 허브 한 판을 만든다 — 시안 `#hubSel`의 한 줄.
 *
 * ⚠️ **순서가 뜻을 만든다.** `setSandboxStage`가 그 진도에 필요한 제출물을
 * 채우고 넘치는 것을 지우므로, 임시저장·미제출·판정은 반드시 그 **뒤**다.
 * 집계 픽스처는 리더보드 플래그를 켜므로 「오늘」을 옮기는 것보다 앞에 둔다.
 */
export async function setSandboxHub(args: {
  key: HubKey;
  entryId: string;
  /** 집계 픽스처를 건드리지 않는다 — 스테이지 줄이 부를 때 그렇다 */
  skipMetrics?: boolean;
}): Promise<void> {
  assertSandbox();
  const { key, entryId } = args;
  const plan = HUB_PLANS[key];

  /*
    ⚠️ **시즌은 그 참가 기록의 시즌이다** — 「지금 시즌」이 아니다. h17이 다음
    시즌을 깨우면 그쪽이 지금 시즌이 되는데, 거기서 또 h17을 받으면 그 다음
    시즌을 만들어 번호가 계속 올라갔다(2026-09-21 수연 지적 — 「왜 점점 시즌
    숫자가 올라가」). 목 데이터는 시즌 1과 시즌 2 둘로 고정이다.
  */
  const entry = await prisma.entry.findUniqueOrThrow({
    where: { id: entryId },
    select: { teamId: true, seasonId: true },
  });
  const seasonId = entry.seasonId;
  /*
    ⚠️ **보관 계정이 앉아 있으면 먼저 비운다.** 「참가팀 없음」 줄과 지각
    참가(h10)가 그 사람의 팀 자리를 보관 계정으로 옮기는데, 그 상태로 다른
    허브 줄을 누르면 진도만 바뀌고 **로그인한 사람에게는 여전히 참가 기록이
    없다** — 허브가 엉뚱한 판을 그린다(2026-09-21에 수연이 그 화면을 봤다).

    ⚠️ **팀장은 그 뒤에 찾는다.** 부르는 쪽이 넘겨주게 두면 보관 중일 때
    보관 계정의 id가 들어와, 제출물의 `submitted_by`가 그 계정이 되고 h10은
    보관의 보관을 만든다(hub-state.mts에서 실제로 그랬다).
  */
  await unparkTeam(entry.teamId);
  const leader = await prisma.teamMember.findFirst({
    where: { teamId: entry.teamId, role: MemberRole.leader },
    select: { userId: true },
  });
  if (!leader) throw new Error("[dev] 그 팀에 팀장이 없습니다.");
  const userId = leader.userId;

  /*
    ⚠️ h17만 「지금 시즌」이 바뀐다 — 지난 시즌을 재우고 다음 시즌을 깨운다.
    나머지 판은 지난 세션의 h17이 남긴 다음 시즌을 **다시 재워야** 한다.
    안 재우면 그 시즌이 계속 「지금 시즌」이라 다른 판이 아무것도 안 바뀐
    것처럼 보인다.
  */
  await prisma.season.update({
    where: { id: seasonId },
    data: { phase: plan.nextSeason ? SeasonPhase.archived : plan.phase },
  });
  if (!plan.nextSeason) await sleepNextSeason(seasonId);
  /* ⚠️ 측정 주소를 **먼저** 만든다 — s2 제출의 랜딩 주소가 그 값을 쓴다 */
  await setHostname(entryId, plan.verified);
  await setSandboxStage({ entryId, stage: plan.stage, userId });
  await prisma.entry.update({
    where: { id: entryId },
    data: { status: plan.status ?? EntryStatus.active },
  });
  await prisma.team.update({
    where: { id: entry.teamId },
    data: { isSolo: plan.solo },
  });

  if (plan.draft) {
    await prisma.submission.upsert({
      where: {
        entryId_stageKey_week: { entryId, stageKey: plan.draft.stageKey, week: 0 },
      },
      create: {
        entryId,
        stageKey: plan.draft.stageKey,
        week: 0,
        status: SubmissionStatus.draft,
        payload: plan.draft.payload,
      },
      update: { status: SubmissionStatus.draft, payload: plan.draft.payload },
    });
  }

  if (plan.unsubmit) {
    await prisma.submission.deleteMany({
      where: { entryId, stageKey: plan.unsubmit },
    });
  }

  if (plan.judgeFail) {
    const submission = await prisma.submission.findFirst({
      where: { entryId, stageKey: plan.judgeFail },
      select: { id: true },
    });
    if (submission) {
      await prisma.judgment.deleteMany({
        where: { submissionId: submission.id },
      });
      await prisma.judgment.create({
        data: {
          submissionId: submission.id,
          result: JudgmentResult.fail,
          /*
            ⚠️ **가정한 「오늘」로 판정한다.** 스키마 기본값은 진짜 지금이라,
            그대로 두면 허브 h12의 이의신청 기한(통지 + 5영업일)이 화면이
            말하는 오늘보다 앞선 날짜로 뜬다.
          */
          judgedAt: devNow(),
          /*
            사유는 시안 h12의 요지 그대로다(「수요 신호 부족」) — 괄호 안 숫자는
            화면이 리드·방문에서 붙인다. 개발용 표시는 문구가 아니라 `aiReport`에
            둔다(2026-09-21 수연 지시 — 「시안처럼 표시」). 되돌릴 때 이 표시로 지운다.
          */
          feedback: "수요 신호 부족",
          aiReport: { dev: true },
        },
      });
    }
  }

  /* 실격은 사유와 소명 기한이 있어야 헤더가 그것을 말할 수 있다 */
  await prisma.sanction.deleteMany({
    where: { entryId, stage: SanctionStage.disqualified },
  });
  if (plan.sanction) {
    await prisma.sanction.create({
      data: {
        entryId,
        stage: SanctionStage.disqualified,
        reason: SanctionReason.bot_traffic,
        detail: "봇 트래픽이 감지됐습니다. 개발 바가 만든 제재입니다.",
        /* 「소명 D-4」 — 기한은 그날의 끝(소명 화면이 「23:59」로 적는다) */
        appealDeadlineAt: endOfSeoulDay(new Date(devNow().getTime() + 4 * 86_400_000)),
      },
    });
  }

  if (plan.metrics && !args.skipMetrics) {
    await setMetricsFixture({ seasonId, kind: plan.metrics });
  }
  /*
    ⚠️ 「오늘」은 맨 마지막에 옮긴다. `setSandboxCurrentStage`가 집계와 리더보드
    플래그도 같이 정하는데, 픽스처가 언제나 플래그를 켜기 때문이다.
  */
  if (plan.raceStage && plan.phase === SeasonPhase.racing) {
    await setSandboxCurrentStage({ seasonId, stage: plan.raceStage });
  }

  /*
    ⚠️ **미배포 팀에는 집계가 없다**(시안 h13의 0과 「-」). 공용 픽스처는
    참가팀 전부에 일별 지표와 스냅샷을 깔아서, 그대로 두면 연동이 안 끝난
    팀이 순위를 달고 나온다 — 운영에서는 일어날 수 없는 모양이다
    (`public-read.ts`의 `notDeployed`가 같은 조건을 본다).
  */
  if (!plan.verified) {
    await prisma.$transaction([
      prisma.metricDaily.deleteMany({ where: { entryId } }),
      prisma.leaderboardSnapshot.deleteMany({ where: { entryId } }),
    ]);
  }

  /*
    ⚠️ **시안 목업 값은 맨 마지막에 심는다.** 위의 집계 픽스처와
    `setSandboxCurrentStage`가 `metric_daily`를 비우므로, 먼저 넣으면
    방문자가 도로 0이 된다(2026-09-21).
  */
  if (plan.leads !== undefined) await setLeads(entryId, plan.leads);
  if (plan.visitors !== undefined) await setVisitors(entryId, plan.visitors);
  if (plan.spec) await setSpec(entryId, seasonId, plan.spec);

  if (plan.nextSeason) await ensureNextSeason(seasonId);

  /* h9와 h16은 DB로 못 가른다 — 누른 판을 남긴다(`dev-hub.ts`) */
  setDevHubKey(key);

  /*
    ⚠️ **자리를 비우는 것은 맨 마지막이다.** 위의 모든 단계가 그 팀의 참가
    기록을 재료로 쓰는데(진도·제출·집계), 먼저 비우면 손댈 자리가 없어진다.
  */
  if (plan.parked) await setSandboxTeam({ userId, seasonId, on: false });
}

/**
 * 지금 dev DB가 그리고 있는 판이 시안 목록의 어느 줄인가. 없으면 null이다.
 *
 * 바에서 눌린 버튼을 표시하려고 쓴다. **한 판을 DB 상태만으로는 못 가르는
 * 자리가 있다** — h9와 h16은 같은 상태이고(화면만 다르다) 그때는 앞엣것을
 * 고른다. 「오늘」이 어느 스테이지인지가 h6·h15를 가르는 유일한 축이라
 * `raceStage`까지 본다.
 */
export function matchHubKey(now: {
  phase: SeasonPhase;
  stage: EntryStage;
  status: EntryStatus;
  solo: boolean;
  verified: boolean;
  raceStage: StageKey | null;
  /** 로그인한 사람의 자리가 보관 계정에 가 있는가 — h10만 그렇다 */
  parked: boolean;
  /** 마지막으로 누른 판. DB로 못 가르는 짝(h9·h16)을 이것으로 가른다 */
  pressed: string | null;
  /** 다음 시즌이 깨어 있으면 그 페이즈. h17만 그렇다 */
  nextPhase: SeasonPhase | null;
}): HubKey | null {
  const keys = Object.keys(HUB_PLANS) as HubKey[];
  const hits = keys.filter((key) => {
    const plan = HUB_PLANS[key];
    if ((plan.parked ?? false) !== now.parked) return false;
    /* h17은 「지난 시즌은 아카이브, 다음 시즌은 모집 중」 — 페이즈는 다음 시즌 것을 본다 */
    if ((plan.nextSeason ?? false) !== (now.nextPhase !== null)) return false;
    if (plan.phase !== (plan.nextSeason ? now.nextPhase : now.phase)) return false;
    if (plan.stage !== now.stage) return false;
    if ((plan.status ?? EntryStatus.active) !== now.status) return false;
    if (plan.solo !== now.solo || plan.verified !== now.verified) return false;
    /* 레이스 밖에서는 「오늘」이 판을 가르지 않는다 */
    if (plan.raceStage && plan.phase === SeasonPhase.racing) {
      return plan.raceStage === now.raceStage;
    }
    return true;
  });
  return hits.find((key) => key === now.pressed) ?? hits[0] ?? null;
}

/**
 * 로그인한 사람의 자리를 보관 계정이 대신 앉아 있는 참가 기록. 없으면 null.
 *
 * 개발 바가 쓴다 — 지각 참가(h10)는 자리를 비워 두는 판이라, 화면이 보는
 * 참가 기록(`loadViewerState`)이 없다. 그래도 바의 진도 줄은 그 사람 팀의
 * 판을 계속 보여 줘야 다음 판으로 넘어갈 수 있다(2026-09-21 수연 지시 —
 * 「예외에 지각 참가 칩은 보여야지」).
 */
export async function findParkedEntry(args: {
  userId: string;
  seasonId: string;
}): Promise<string | null> {
  assertSandbox();
  const seat = await prisma.teamMember.findFirst({
    where: {
      user: { email: parkedEmail(args.userId) },
      team: { entries: { some: { seasonId: args.seasonId } } },
    },
    select: {
      team: {
        select: {
          entries: { where: { seasonId: args.seasonId }, take: 1, select: { id: true } },
        },
      },
    },
  });
  return seat?.team.entries[0]?.id ?? null;
}

/**
 * 그 팀에 앉아 있는 개발용 보관 계정을 원래 주인에게 돌려준다.
 *
 * 보관 계정의 메일이 `devbar-parked-<원래 userId>@example.com`이라 주인을
 * 되찾을 수 있다. 보관이 겹쳐 쌓였을 수도 있어(보관의 보관) 체인을 푼다.
 */
export async function unparkTeam(teamId: string): Promise<void> {
  const prefix = "devbar-parked-";
  for (let round = 0; round < 5; round++) {
    const sitting = await prisma.teamMember.findMany({
      where: { teamId, user: { email: { startsWith: prefix } } },
      select: { userId: true, user: { select: { email: true } } },
    });
    if (!sitting.length) return;

    let moved = 0;
    for (const member of sitting) {
      const ownerId = member.user.email
        .slice(prefix.length)
        .replace("@example.com", "");
      const owner = await prisma.user.findUnique({
        where: { id: ownerId },
        select: { id: true },
      });
      if (!owner) continue;
      const done = await prisma.teamMember.updateMany({
        where: { teamId, userId: member.userId },
        data: { userId: owner.id },
      });
      moved += done.count;
    }
    /* 주인을 못 찾는 자리만 남았으면 더 풀 것이 없다 */
    if (!moved) return;
  }
}

/** 다음 시즌을 다시 재운다(draft). 그래야 지난 시즌이 「지금 시즌」으로 돌아온다 */
export async function sleepNextSeason(currentId: string): Promise<void> {
  const current = await prisma.season.findUniqueOrThrow({
    where: { id: currentId },
    select: { createdAt: true },
  });
  await prisma.season.updateMany({
    where: {
      id: { not: currentId },
      createdAt: { gt: current.createdAt },
      phase: { not: SeasonPhase.draft },
    },
    data: { phase: SeasonPhase.draft },
  });
}

/**
 * 다음 시즌을 모집 중으로 둔다 — 시안 h17이 헤더에 「시즌 2, 모집 중」을 띄운다.
 *
 * 없으면 만든다. `loadNextSeason`(header-read.ts)이 **지금 시즌보다 뒤에
 * 만들어진 것**을 찾으므로 `createdAt`이 뒤여야 한다.
 */
async function ensureNextSeason(currentId: string): Promise<void> {
  const current = await prisma.season.findUniqueOrThrow({
    where: { id: currentId },
    select: { createdAt: true, endsAt: true, slug: true, title: true },
  });
  /* 바로 다음 시즌이다(가장 이른 것) — 목 데이터는 시즌 1·2 둘로 고정이다 */
  const next = await prisma.season.findFirst({
    where: { id: { not: currentId }, createdAt: { gt: current.createdAt } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (next) {
    await prisma.season.update({
      where: { id: next.id },
      data: { phase: SeasonPhase.recruiting },
    });
    return;
  }
  const startsAt = new Date(
    (current.endsAt ?? devNow()).getTime() + 50 * 86_400_000,
  );
  /*
    ⚠️ 이름은 지금 시즌 다음 번호다 — 「season-2」를 박아 두면 시즌 2가 지금
    시즌일 때(h17의 「참가 신청」으로 시즌 2에 신청한 뒤 다시 누르면 그렇다)
    같은 slug를 또 만들다 터진다(2026-09-21 수연이 그 에러를 봤다).
  */
  const n = Number(current.slug.match(/(\d+)$/)?.[1] ?? 1) + 1;
  await prisma.season.upsert({
    where: { slug: `season-${n}` },
    update: { phase: SeasonPhase.recruiting },
    create: {
      slug: `season-${n}`,
      title: current.title.replace(/\d+$/, String(n)) || `시즌 ${n}`,
      phase: SeasonPhase.recruiting,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 36 * 86_400_000),
    },
  });
}

/*
  「내 팀은 시즌 일정대로 간다」 — 개발 바 스테이지 줄이 오늘을 옮길 때
  **내 팀 진도도 그 주차에 맞춘다**(2026-09-21 수연 지시).

  그 전에는 두 축이 따로 놀아서, 페이즈를 레이스로 두고 s1 주차를 골라도
  진도가 s3이면 화면이 s3 그대로였다 — 수연이 「화면이 안 바뀌네」로 잡았다.
  화면을 보려고 누르는 줄이니 그 주차에 있을 법한 팀이 되는 편이 쓸모 있다.

  그 주차의 「판」을 그대로 쓴다. 진도만 옮기면 골든패스가 전부 미체크라
  **첫 칸이 진행 중으로 뜬다** — 시안 h2는 1·2를 끝내고 3번이 진행 중이다
  (2026-09-21에 수연이 그것도 잡았다). 판을 쓰면 그 임시저장까지 따라온다.

  ⚠️ 게이트에 멈춘 상태(판정 대기 h4·h7)는 그 주차를 「정상으로 지나는」
  모습이 아니다 — 진도 줄의 「4, 1차 심사 대기」가 그 자리다. s5 주차는
  시안에서 예외 15번(「s5 자동 제출 확인」)인데 아직 안 옮겨서, 그나마 가까운
  h7을 쓴다(진도를 s4로 두면 s5 주차에 s4 화면이 떠서 더 어긋난다).
*/
const STAGE_PANE: Record<StageKey, HubKey> = {
  [StageKey.s1]: "h2",
  [StageKey.s2]: "h3",
  [StageKey.s3]: "h5",
  [StageKey.s4]: "h6",
  [StageKey.s5]: "h7",
};

/**
 * 그 주차를 정상으로 지나는 팀으로 만든다 — 진도·온보딩·임시저장.
 *
 * ⚠️ **집계는 건드리지 않는다.** `setSandboxCurrentStage`가 스테이지별 규칙을
 * 이미 갖고 있고(s4는 고르는 자리라 그대로 둔다), 여기서 덮으면 s4의 집계 줄이
 * 무슨 값을 눌러도 되돌아간다.
 */
export async function setSandboxPace(args: {
  entryId: string;
  stage: StageKey;
}): Promise<void> {
  assertSandbox();
  await setSandboxHub({ key: STAGE_PANE[args.stage], entryId: args.entryId, skipMetrics: true });
}

/**
 * 사전 신청자를 그 수만큼 만든다 — 시안 h3의 칩과 h4의 「사전 신청자」.
 *
 * 개발용으로 만든 것만 지우고 다시 넣는다. 인증된 리드여야 점수에 든다.
 */
async function setLeads(entryId: string, count: number): Promise<void> {
  const prefix = "dev-lead-";
  await prisma.entryLead.deleteMany({
    where: { entryId, contactHash: { startsWith: prefix } },
  });
  if (count <= 0) return;
  const now = devNow();
  await prisma.entryLead.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      entryId,
      contactHash: `${prefix}${String(i).padStart(4, "0")}`,
      verifiedAt: now,
      sourceHost: "dev",
    })),
    skipDuplicates: true,
  });
}

/**
 * 누적 유효 방문을 그 값으로 만든다 — 시안 h4의 「방문자」.
 *
 * ⚠️ 하루치 한 행으로 넣는다. 허브가 보는 것은 **합계**뿐이고
 * (`loadHub`의 `totals`), 일별 모양이 필요한 화면은 `setMetricsFixture`가
 * 따로 만든다 — 그쪽과 겹치지 않게 **집계 픽스처를 쓰는 판에는 주지 않는다.**
 */
async function setVisitors(entryId: string, total: number): Promise<void> {
  const day = seoulDateOnly(devNow());
  await prisma.metricDaily.deleteMany({ where: { entryId } });
  if (total <= 0) return;
  await prisma.metricDaily.create({
    data: {
      entryId,
      metricDate: day,
      validVisitors: total,
      source: MetricSource.manual,
    },
  });
}

/** 참고 지표의 정의. 시안 h7·h9가 그리는 두 가지다 */
const EXTRA_DEFS = [
  { key: "weekly_active", name: "주간 활성", unit: "명" },
  { key: "retention", name: "재방문율", unit: "%" },
] as const;

/**
 * 확정 집계 판(h7·h8·h9)의 값을 시안 목업 그대로 만든다.
 *
 * 최종 스냅샷과 시상은 그 팀 것만 덮고, 참고 지표는 `metric_extra_daily`에
 * 하루치로 넣는다 — 화면이 보는 것은 가장 최근 값 하나다.
 */
async function setSpec(
  entryId: string,
  seasonId: string,
  spec: NonNullable<HubPlan["spec"]>,
): Promise<void> {
  const day = seoulDateOnly(devNow());

  const snapshot = await prisma.leaderboardSnapshot.findFirst({
    where: { entryId, seasonId },
    orderBy: { snapshotDate: "desc" },
    select: { id: true },
  });
  const board = {
    rank: spec.rank ?? 1,
    validVisitorsTotal: spec.validUsers ?? 0,
    revenueTotal: BigInt(spec.revenue ?? 0),
  };
  if (snapshot) {
    await prisma.leaderboardSnapshot.update({
      where: { id: snapshot.id },
      data: board,
    });
  } else {
    await prisma.leaderboardSnapshot.create({
      data: {
        seasonId,
        entryId,
        snapshotDate: day,
        isFinal: true,
        /* 채점식이 미확정이라 점수는 유효 이용자 수를 그대로 쓴다(픽스처 관례) */
        score: board.validVisitorsTotal,
        ...board,
      },
    });
  }

  if (spec.award) {
    const award = await prisma.award.findFirst({
      where: { seasonId, entryId },
      select: { id: true },
    });
    const data = { rank: spec.rank ?? null, prizeDesc: spec.award };
    if (award) {
      await prisma.award.update({ where: { id: award.id }, data });
    } else {
      await prisma.award.create({
        data: { seasonId, entryId, awardedAt: devNow(), ...data },
      });
    }
  }

  if (spec.gatePass) {
    /* 게이트 둘의 제출에 통과 판정을 단다 — 시안 h9의 「2 PASS」 */
    const gates = await prisma.submission.findMany({
      where: { entryId, stageKey: { in: [StageKey.s2, StageKey.s5] } },
      select: { id: true },
    });
    for (const gate of gates) {
      await prisma.judgment.deleteMany({ where: { submissionId: gate.id } });
      await prisma.judgment.create({
        data: {
          submissionId: gate.id,
          result: JudgmentResult.pass,
          feedback: "개발 바가 만든 판정입니다.",
          aiReport: { dev: true },
        },
      });
    }
  }

  /* 참고 지표 — 정의가 없으면 만든다(시즌1 dev DB에는 아직 없다) */
  const values: Record<string, number | undefined> = {
    weekly_active: spec.weeklyActive,
    retention: spec.retention,
  };
  for (const def of EXTRA_DEFS) {
    const value = values[def.key];
    if (value === undefined) continue;
    const definition = await prisma.metricDefinition.upsert({
      where: { key: def.key },
      update: {},
      create: { key: def.key, name: def.name, unit: def.unit },
      select: { id: true },
    });
    await prisma.metricExtraDaily.upsert({
      where: {
        entryId_metricDate_definitionId: {
          entryId,
          metricDate: day,
          definitionId: definition.id,
        },
      },
      update: { value },
      create: {
        entryId,
        metricDate: day,
        definitionId: definition.id,
        value,
        source: MetricSource.manual,
      },
    });
  }
}

/**
 * 측정 연동을 그 상태로 만든다 — **행이 없으면 만든다.**
 *
 * ⚠️ `updateMany`만 쓰면 hostname 행이 없는 팀은 영원히 온보딩 미완이다
 * (2026-09-21에 「ㄴㄴ」 팀이 그랬다 — 주차를 옮겨도 화면이 온보딩에 머물렀다).
 * 주소는 참가작 주소에서 가져오고, 그것도 없으면 개발용으로 하나 짓는다.
 */
async function setHostname(entryId: string, verified: boolean): Promise<void> {
  await setHostnameState(entryId, verified ? "ok" : "wait");
}

/**
 * 측정 연동 화면의 세 판(시안 ①②③) 중 하나로 만든다 — 「측정 연동」 줄.
 *
 * 배포 주소(`originUrl`)가 비어 있으면 참가작 주소로 채운다 — 화면 ③이
 * 그 값을 「배포 주소」 칸에 그리고, 「다시 검증하기」가 그 주소를 실제로 부른다.
 */
async function setHostnameState(
  entryId: string,
  state: MeasurementState,
): Promise<void> {
  const entry = await prisma.entry.findUniqueOrThrow({
    where: { id: entryId },
    select: {
      serviceUrl: true,
      hostname: { select: { id: true, originUrl: true } },
    },
  });
  const data = {
    deployStatus:
      state === "ok"
        ? DeployStatus.active
        : state === "fail"
          ? DeployStatus.failed
          : DeployStatus.pending,
    ownershipVerifiedAt: state === "ok" ? devNow() : null,
    lastCheckedAt: state === "wait" ? null : devNow(),
    ...(entry.hostname?.originUrl
      ? {}
      : { originUrl: entry.serviceUrl ?? "https://example.com" }),
  };
  if (entry.hostname) {
    await prisma.hostname.update({ where: { entryId }, data });
    return;
  }
  const host = entry.serviceUrl
    ? new URL(entry.serviceUrl).host
    : `dev-${entryId.slice(0, 8)}.proovit.kr`;
  await prisma.hostname.create({ data: { entryId, hostname: host, ...data } });
}

export async function setSandboxMeasurement(args: {
  entryId: string;
  state: MeasurementState;
}): Promise<void> {
  assertSandbox();
  await setHostnameState(args.entryId, args.state);
}

/*
  결제 연동 화면의 판을 앉힌다 — 시안 ① 미등록 · ② 등록과 확인 완료 · ③ 문의형,
  그리고 시안에 없는 「확인 대기」(등록은 했는데 확인 전).

  과금 유형은 s1 제출값이라 화면에서는 못 바꾸지만 여기서는 바꾼다 — 판을 보려고
  누르는 줄이다. ③은 문의 수단 주소가 비어 있으면 팀 주소의 /contact를 채운다
  (시안 목업 「https://little-potion.proovit.kr/contact」와 같아진다).
*/
export async function setSandboxPayment(args: {
  entryId: string;
  pane: PaymentPane;
}): Promise<void> {
  assertSandbox();
  const { entryId, pane } = args;

  if (pane === "inq") {
    const entry = await prisma.entry.findUniqueOrThrow({
      where: { id: entryId },
      select: { inquiryUrl: true, hostname: { select: { hostname: true } } },
    });
    await setSandboxRevenue(entryId, false);
    await setSandboxInquiries(entryId, true);
    await prisma.entry.update({
      where: { id: entryId },
      data: {
        chargeType: ChargeType.inquiry,
        ...(entry.inquiryUrl
          ? {}
          : {
              inquiryUrl: `https://${entry.hostname?.hostname ?? `dev-${entryId.slice(0, 8)}.proovit.kr`}/contact`,
            }),
      },
    });
    return;
  }

  await prisma.entry.update({
    where: { id: entryId },
    data: { chargeType: ChargeType.payment },
  });
  await setSandboxRevenue(entryId, pane === "ok");
  await setSandboxInquiries(entryId, false);
  if (pane === "none") {
    await prisma.paymentIntegration.deleteMany({ where: { entryId } });
    return;
  }

  const now = devNow();
  const data = {
    status: pane === "ok" ? IntegrationStatus.verified : IntegrationStatus.pending,
    verifiedAt: pane === "ok" ? now : null,
    lastTestedAt: pane === "ok" ? now : null,
  };
  await prisma.paymentIntegration.upsert({
    where: { entryId },
    create: {
      entryId,
      provider: PaymentProvider.toss,
      /* 가리면 시안 목업 「sk_live_••••••••3f2a」와 같아지는 가짜 키 */
      readonlyKeyEnc: encryptSecret("sk_live_sandbox_only_3f2a"),
      ...data,
    },
    update: data,
  });
}

// ═════════════════════════════════════════════════════════════
// 스테이지 제출 — 시안 `#scr-submit` 다섯 판
// ═════════════════════════════════════════════════════════════

/*
  두 판이면 다섯 탭이 전부 시안 모양이 된다.

    s3  진도 h5(s3 빌드와 배포) 위에 시안 목업을 얹는다 — s1 제출됨·s2 통과(잠김)·
        s3 임시저장·s4 「주간 반복」·s5 「예정」. 시안의 s1·s2·s3·s5 판이 이 상태다.
    s4  진도 h6(s4 레이스) 위에 s4 1주차 임시저장. 시안의 s4 판이 이 상태다 —
        ⚠️ 시안은 「1주차 제출됨 · 2주차 작성 중」인데 dev 일정은 s4가 한 주라
        2주차가 없다. 1주차 작성 중으로 심는다(2026-09-22).

  판을 만드는 순서가 뜻을 만든다 — `setSandboxHub`가 그 진도에 필요한 제출물을
  개발용 payload로 채우고 집계 픽스처와 「오늘」을 정하므로, 시안 목업 제출물·
  판정·방문자는 반드시 그 **뒤**에 얹는다.
*/
/** s4w2 — s4를 두 주로 늘리고 1주차 제출·2주차 작성 중. s5 — s5 열림, 작성 중(h15 위에) */
export type SubmitPane = "s3" | "s4" | "s4w2" | "s5";

/** 지금 dev DB가 그리는 제출 판. 시안 목업이 심긴 모양이 아니면 null */
function submitPane(
  rows: { stageKey: StageKey; week: number; status: SubmissionStatus }[],
): SubmitPane | null {
  const has = (stageKey: StageKey, status: SubmissionStatus, week?: number) =>
    rows.some(
      (r) =>
        r.stageKey === stageKey &&
        r.status === status &&
        (week === undefined ? true : r.week >= week),
    );
  if (has(StageKey.s5, SubmissionStatus.draft)) return "s5";
  if (has(StageKey.s4, SubmissionStatus.draft, 2)) return "s4w2";
  if (has(StageKey.s4, SubmissionStatus.draft, 1)) return "s4";
  if (has(StageKey.s3, SubmissionStatus.draft) && has(StageKey.s2, SubmissionStatus.locked)) {
    return "s3";
  }
  return null;
}

export async function setSandboxSubmit(args: {
  entryId: string;
  pane: SubmitPane;
}): Promise<void> {
  assertSandbox();
  const { entryId, pane } = args;

  await setSandboxHub({ key: pane === "s3" ? "h5" : pane === "s5" ? "h15" : "h6", entryId });

  /*
    dev 일정은 스테이지마다 한 주라 s4에 2주차가 없다. 「s4 2주차」는 s4 마감을 한 주
    미루고 s5를 그만큼 뒤로 민다(시즌 종료는 그대로). 다른 줄(스테이지·집계·허브)을
    누르면 `scheduleStageDates`가 한 주짜리로 되돌린다.
  */
  if (pane === "s4w2") {
    const { seasonId } = await prisma.entry.findUniqueOrThrow({
      where: { id: entryId },
      select: { seasonId: true },
    });
    const [s4, s5] = await Promise.all(
      [StageKey.s4, StageKey.s5].map((stageKey) =>
        prisma.stage.findFirstOrThrow({ where: { seasonId, stageKey } }),
      ),
    );
    if (s4.closesAt && s5.closesAt) {
      const s4Closes = new Date(s4.closesAt.getTime() + WEEK_MS);
      const s5Opens = new Date(s4Closes.getTime() + MIN_MS);
      const s5Closes = new Date(Math.max(s5.closesAt.getTime(), s5Opens.getTime() + 86_400_000));
      await prisma.$transaction([
        prisma.stage.update({ where: { id: s4.id }, data: { closesAt: s4Closes } }),
        prisma.stage.update({ where: { id: s5.id }, data: { opensAt: s5Opens, closesAt: s5Closes } }),
      ]);
    }
  }

  const entry = await prisma.entry.findUniqueOrThrow({
    where: { id: entryId },
    select: {
      seasonId: true,
      teamId: true,
      hostname: { select: { hostname: true } },
      season: {
        select: {
          stages: { select: { stageKey: true, opensAt: true, closesAt: true } },
        },
      },
    },
  });
  const leader = await prisma.teamMember.findFirst({
    where: { teamId: entry.teamId, role: MemberRole.leader },
    select: { userId: true },
  });
  if (!leader) throw new Error("[dev] 그 팀에 팀장이 없습니다.");
  const host = entry.hostname?.hostname ?? `dev-${entryId.slice(0, 8)}.proovit.kr`;
  const stageOf = (key: StageKey) => entry.season.stages.find((s) => s.stageKey === key);
  /* 제출 시각은 마감 이틀 전 — 시안 「마감 10.04 · 제출 10.02」의 간격 */
  const submittedAt = (key: StageKey) => {
    const closes = stageOf(key)?.closesAt;
    return closes ? new Date(closes.getTime() - 2 * 86_400_000) : devNow();
  };

  /*
    시안 칩의 파일을 실제로 심는다 — 칩이 열려야 화면 검토가 된다. 키의 id는
    이름에서 정해지므로 몇 번을 눌러도 같은 파일 하나다. 되돌릴 때는
    submit-state.mts가 스냅에 없는 키를 저장소에서 걷어낸다.
  */
  const storage = evidenceStorage();
  const seedFiles = async (stageKey: StageKey, names: readonly string[]) => {
    if (!storage) return [];
    const keys: string[] = [];
    for (const name of names) {
      const kind = kindOfName(name);
      if (!kind || !(kind in DEV_FILE_BYTES)) continue;
      const key = buildEvidenceKey({
        entryId,
        stageKey,
        slot: "evidence",
        id: createHash("md5").update(`dev:${name}`).digest("hex"),
        name,
      });
      await storage.put(key, DEV_FILE_BYTES[kind as keyof typeof DEV_FILE_BYTES], EVIDENCE_KINDS[kind]);
      keys.push(key);
    }
    return keys;
  };

  const put = async (
    stageKey: StageKey,
    week: number,
    status: SubmissionStatus,
    payload: Prisma.InputJsonObject,
    evidenceUrls: string[] = [],
  ) => {
    const submitted = status !== SubmissionStatus.draft;
    const data = {
      status,
      payload,
      evidenceUrls,
      submittedBy: submitted ? leader.userId : null,
      submittedAt: submitted ? submittedAt(stageKey) : null,
    };
    return prisma.submission.upsert({
      where: { entryId_stageKey_week: { entryId, stageKey, week } },
      create: { entryId, stageKey, week, ...data },
      update: data,
      select: { id: true },
    });
  };

  await put(
    StageKey.s1,
    0,
    SubmissionStatus.submitted,
    SPEC_S1,
    await seedFiles(StageKey.s1, SPEC_FILES.s1),
  );
  const s2 = await put(
    StageKey.s2,
    0,
    SubmissionStatus.locked,
    specS2(host),
    await seedFiles(StageKey.s2, SPEC_FILES.s2),
  );
  /* 1차 통과 — 시안 s2의 「pass」. 되돌릴 때 `aiReport.dev`로 찾아 지운다 */
  await prisma.judgment.deleteMany({ where: { submissionId: s2.id } });
  await prisma.judgment.create({
    data: {
      submissionId: s2.id,
      result: JudgmentResult.pass,
      judgedAt: submittedAt(StageKey.s2),
      feedback: "개발 바가 만든 판정입니다.",
      aiReport: { dev: true },
    },
  });
  await put(
    StageKey.s3,
    0,
    pane === "s3" ? SubmissionStatus.draft : SubmissionStatus.submitted,
    specS3(host, pane === "s4"),
  );
  /*
    s2 판의 방문자·사전 신청자 — 허브 h4와 같은 수. 방문은 s2(1차 심사) 마감 전의
    날이어야 센다 — 제출 화면은 측정 시작부터 마감까지 센다(유동 게이트).
  */
  await setLeads(entryId, SPEC_S2_LEADS);
  if (pane === "s3") {
    /*
      s2 달력 첫날부터 마감일까지 나눠 심는다(합은 시안 수 그대로, 나머지는 마지막
      날에). 기간 표기의 앞은 첫 집계일이라(submission.ts `visitRange`) 하루에 몰면
      「10.11~10.11」이 된다 — 나눠 심어야 시안처럼 「10.05~」로 선다.
    */
    const s2 = stageOf(StageKey.s2);
    const last = seoulDateOnly(s2?.closesAt ? new Date(s2.closesAt.getTime() - 60_000) : devNow());
    const first = s2?.opensAt ? seoulDateOnly(s2.opensAt) : last;
    const days: Date[] = [];
    for (let t = first.getTime(); t <= last.getTime(); t += 86_400_000) days.push(new Date(t));
    if (days.length === 0) days.push(last);
    const each = Math.floor(SPEC_S2_VISITORS / days.length);
    await prisma.metricDaily.deleteMany({ where: { entryId } });
    await prisma.metricDaily.createMany({
      data: days.map((metricDate, i) => ({
        entryId,
        metricDate,
        validVisitors:
          i === days.length - 1 ? SPEC_S2_VISITORS - each * (days.length - 1) : each,
        source: MetricSource.manual,
      })),
    });
    return;
  }

  /* s5 작성 중 — h15(s5 구간, 진도 s4)가 일정·지표·「오늘」을 앉혔다. 초안만 얹는다 */
  if (pane === "s5") {
    await put(StageKey.s5, 0, SubmissionStatus.draft, SPEC_S5);
    return;
  }

  /*
    s4 작성 중 — 「s4 1주차」는 1주차 초안, 「s4 2주차」는 1주차 제출 + 2주차 초안(시안 그대로).
    「오늘」은 이번 주 마감 이틀 전 낮 — 시안 「D-2」
  */
  const week = pane === "s4w2" ? 2 : 1;
  if (week === 2) await put(StageKey.s4, 1, SubmissionStatus.submitted, SPEC_S4_WEEK1);
  await put(
    StageKey.s4,
    week,
    SubmissionStatus.draft,
    SPEC_S4,
    await seedFiles(StageKey.s4, SPEC_FILES.s4),
  );
  const closes = stageOf(StageKey.s4)?.closesAt;
  if (closes) {
    setDevToday(new Date(closes.getTime() - 2 * 86_400_000 - (11 * 60 + 59) * 60_000));
  }
  /*
    주간 지표 「방문 214 · 가입 38」 — 집계 픽스처는 「오늘」을 옮기기 전의 날짜에
    행을 깔아 이 주에는 없다. 이 주의 오늘 하루치를 시안 수치로 얹는다.
  */
  await prisma.metricDaily.upsert({
    where: { entryId_metricDate: { entryId, metricDate: seoulDateOnly(devNow()) } },
    update: { validVisitors: SPEC_S4_VISITORS, signups: SPEC_S4_SIGNUPS },
    create: {
      entryId,
      metricDate: seoulDateOnly(devNow()),
      validVisitors: SPEC_S4_VISITORS,
      signups: SPEC_S4_SIGNUPS,
      source: MetricSource.manual,
    },
  });
}

/*
  시안 ②의 요약 「집계된 매출 ₩126,000 · 결제 건수 7건」을 **진짜 거래 행**으로
  만든다(2026-09-22 수연 지시 — 허브의 주간 활성·재방문율 픽스처와 같은 방식).
  화면은 여전히 거래 표를 집계해 그리고, 이 행들은 멱등키 접두로 구별해 다른
  판으로 옮길 때 지운다. 결제자 해시를 각각 달리 둬 유효 결제자 수도 7이 된다.
*/
export const SANDBOX_TX_PREFIX = "sandbox-tx:";

export async function setSandboxRevenue(entryId: string, on: boolean): Promise<void> {
  const prefix = `${SANDBOX_TX_PREFIX}${entryId}:`;
  await prisma.transaction.deleteMany({
    where: { entryId, providerTxId: { startsWith: prefix } },
  });
  if (!on) return;
  const now = devNow().getTime();
  await prisma.transaction.createMany({
    data: Array.from({ length: 7 }, (_, i) => ({
      entryId,
      providerTxId: `${prefix}${i + 1}`,
      amount: BigInt(18000),
      status: TransactionStatus.paid,
      /* 최근 일주일에 하루 한 건씩 */
      paidAt: new Date(now - (7 - i) * 24 * 60 * 60 * 1000),
      rawPayload: { sandbox: true },
      payerHash: `sandbox-payer-${i + 1}`,
    })),
  });
}

/*
  시안 ③의 「현재 단계 L2, 유효 문의 2건」을 **진짜 리드 행**으로 만든다
  (2026-09-22 수연 지시, 매출 픽스처와 같은 방식). 인증된 리드 2건이면 L2다.
*/
export const SANDBOX_LEAD_PREFIX = "sandbox-lead:";

export async function setSandboxInquiries(entryId: string, on: boolean): Promise<void> {
  const prefix = `${SANDBOX_LEAD_PREFIX}${entryId.slice(0, 8)}:`;
  await prisma.entryLead.deleteMany({
    where: { entryId, contactHash: { startsWith: prefix } },
  });
  if (!on) return;
  const now = devNow().getTime();
  await prisma.entryLead.createMany({
    data: [1, 2].map((i) => ({
      entryId,
      contactHash: `${prefix}${i}`,
      verifiedAt: new Date(now - i * 24 * 60 * 60 * 1000),
      sourceHost: "little-potion.proovit.kr",
    })),
  });
}

// ═════════════════════════════════════════════════════════════
// 혜택과 크레딧 — 시안 `#scr-credits` 일곱 판
// ═════════════════════════════════════════════════════════════

/*
  판은 카드 상태의 결과라(credits.ts `creditCardState`) 여기서는 그 재료를 심는다 —
  허브 판(진도·페이즈·오늘) 위에 스폰서·카드·코드·발급 기록을 얹는다.

    pend    h1  모집 중, 카드 넷 다 협의 중(스폰서 없음)
    locked  h2  s1 제출 전. C1·C2·C4에 스폰서, C3은 협의 중
    sched   h3  s1 제출됨, C1 발급 예정(빌드 시작일 전)
    build   h5  s3, C1 발급 완료 · C2 발급 가능
    race    h6  s4, C1 발급 확인 · C2 발급 완료 · C3 협의 중인데 배포 검증됨
    tester  h12 게이트 1 미통과, C1만 받음
    end     h8  시상 발표, C3 만료 · C4 시상 확정

  ⚠️ **카드는 시즌의 것이다** — 이 줄을 누르면 그 시즌 참가팀 전부의 카드가
  바뀐다. dev DB라 괜찮다. 되돌리는 것은 `credits-state.mts`.

  ⚠️ 허브 h2~h5·h12는 측정 연동이 검증된 팀이라 C3(배포 URL 검증)가 열려
  버린다. 시안 ②③④⑥은 C3이 잠금이라 그 판에서는 검증을 되돌린다 — 시안의
  전제가 「배포 검증은 s3에서 한다」이기 때문이다.
*/
export type { CreditsPane } from "@/lib/credits";

const CREDITS_HUB: Record<CreditsPane, HubKey> = {
  pend: "h1",
  locked: "h2",
  sched: "h3",
  build: "h5",
  race: "h6",
  tester: "h12",
  end: "h8",
};

/* 시안 CR_CARDS — 본문·폴백·적용 안내. 스폰서가 붙으면 그쪽 값으로 바뀐다 */
const SPEC_CREDITS = {
  c1: {
    description: "AI 에이전트와 배포, 컴퓨트 크레딧. 표준 빌더로 만들고 그 자리에서 배포까지 해요.",
    sponsor: { name: "Replit", mark: "R" },
    value: "$75",
    redeemNote: "Replit 계정의 Billing에서 Redeem",
    code: "RPL-PRV-7K2Q-M3XA",
    fallback: [
      { name: "Replit 무료 티어", note: "에이전트 월 한도" },
      { name: "Vercel Hobby", note: "무료 배포" },
      { name: "한국어 사용 가이드", note: "Ch.5" },
    ],
  },
  c2: {
    description: "배포 플랫폼 호스팅과 LLM API 크레딧. 자유 도구 트랙이나 외부 API 연동에 써요.",
    sponsor: { name: "Vercel", mark: "▲" },
    value: "$50",
    redeemNote: "초대 링크에서 팀 계정으로 수락",
    inviteUrl: "vercel.com/claim/prv-s1-4f8b",
    fallback: [
      { name: "Vercel Hobby", note: "호스팅" },
      { name: "Supabase Free", note: "DB와 인증" },
      { name: "Gemini 무료 티어", note: "API" },
    ],
  },
  c3: {
    description: "분석 도구 구독이나 광고 크레딧. 레이스 기간의 유입을 보고 키우는 데 써요.",
    fallback: [
      { name: "GA4", note: "측정 연동으로 자동" },
      { name: "Search Console", note: "색인 등록" },
      { name: "스레드 운영 가이드", note: "Ch.6" },
    ],
  },
  c4: {
    description: "상위 팀에게 주는 추가 크레딧이에요. 상금 규정이 적용되고, 2차 심사가 확정된 뒤에 안내돼요.",
    sponsor: { name: "Vercel", mark: "▲" },
    value: "상위 3팀",
  },
} as const;

/* 가이드 링크 자리 — 노션 가이드 주소가 정해지면 운영 화면에서 바꾼다 */
const DEV_GUIDE_URL = "https://proovit.kr/rules";

export async function setSandboxCredits(args: {
  entryId: string;
  pane: CreditsPane;
}): Promise<void> {
  assertSandbox();
  const { entryId, pane } = args;

  await setSandboxHub({ key: CREDITS_HUB[pane], entryId });
  /* 시안 ②③④⑥의 C3은 잠금 — 배포 검증을 되돌린다(머리 주석) */
  await setHostname(entryId, pane === "race" || pane === "end");

  const entry = await prisma.entry.findUniqueOrThrow({
    where: { id: entryId },
    select: {
      seasonId: true,
      season: {
        select: {
          endsAt: true,
          stages: { select: { stageKey: true, opensAt: true, closesAt: true } },
        },
      },
    },
  });
  const seasonId = entry.seasonId;
  const stageOf = (key: StageKey) => entry.season.stages.find((s) => s.stageKey === key);
  const endsAt = entry.season.endsAt ?? devNow();
  const day = (base: Date, days: number) => new Date(base.getTime() + days * 86_400_000);
  /* 빌드 시작일 — s3 개시. 발송은 그날 09:00(KST, 개시가 자정이므로 +9시간) */
  const buildStart = stageOf(StageKey.s3)?.opensAt ?? day(devNow(), 7);
  const sentAt = (d: Date) => new Date(d.getTime() + 9 * 3_600_000);

  const sponsorId = async (spec: { name: string; mark: string }) => {
    const found = await prisma.sponsor.findFirst({
      where: { name: spec.name },
      select: { id: true },
    });
    if (found) {
      await prisma.sponsor.update({ where: { id: found.id }, data: { mark: spec.mark } });
      return found.id;
    }
    return (await prisma.sponsor.create({ data: spec, select: { id: true } })).id;
  };

  const negotiating = (kind: CreditKind, spec: { description: string; fallback?: readonly { name: string; note: string }[] }) => ({
    kind,
    status: CreditOfferStatus.negotiating,
    sponsorId: null,
    unlockEvent: CREDIT_CARD_BY_KIND[kind].unlockEvent,
    deliveryMethod: CreditDelivery.manual,
    releaseDate: null,
    validUntil: null,
    inviteUrl: null,
    howtoUrl: null,
    redeemNote: null,
    description: spec.description,
    value: null,
    fallbackUrl: DEV_GUIDE_URL,
    fallbackItems: [...(spec.fallback ?? [])] as Prisma.InputJsonArray,
  });

  /* 지급 시점은 일정이라 협의 중에도 안다 — 시안 ①의 「빌드 시작일 10.12」·「11.03」 */
  const offers =
    pane === "pend"
      ? [
          { ...negotiating(CreditKind.c1, SPEC_CREDITS.c1), releaseDate: buildStart },
          negotiating(CreditKind.c2, SPEC_CREDITS.c2),
          negotiating(CreditKind.c3, SPEC_CREDITS.c3),
          { ...negotiating(CreditKind.c4, SPEC_CREDITS.c4), releaseDate: endsAt },
        ]
      : [
          {
            ...negotiating(CreditKind.c1, SPEC_CREDITS.c1),
            status: CreditOfferStatus.active,
            sponsorId: await sponsorId(SPEC_CREDITS.c1.sponsor),
            deliveryMethod: CreditDelivery.code_pool,
            releaseDate: buildStart,
            validUntil: day(endsAt, 14),
            howtoUrl: DEV_GUIDE_URL,
            redeemNote: SPEC_CREDITS.c1.redeemNote,
            value: SPEC_CREDITS.c1.value,
          },
          {
            ...negotiating(CreditKind.c2, SPEC_CREDITS.c2),
            status: CreditOfferStatus.active,
            sponsorId: await sponsorId(SPEC_CREDITS.c2.sponsor),
            deliveryMethod: CreditDelivery.invite_link,
            inviteUrl: SPEC_CREDITS.c2.inviteUrl,
            validUntil: day(endsAt, 45),
            howtoUrl: DEV_GUIDE_URL,
            redeemNote: SPEC_CREDITS.c2.redeemNote,
            value: SPEC_CREDITS.c2.value,
          },
          negotiating(CreditKind.c3, SPEC_CREDITS.c3),
          {
            ...negotiating(CreditKind.c4, SPEC_CREDITS.c4),
            status: CreditOfferStatus.active,
            sponsorId: await sponsorId(SPEC_CREDITS.c4.sponsor),
            releaseDate: endsAt,
            validUntil: day(endsAt, 45),
            value: SPEC_CREDITS.c4.value,
          },
        ];

  /* 발급 기록은 통째로 새로 심는다 — 코드는 되돌려 다시 issued로 */
  await prisma.creditClaim.deleteMany({ where: { entryId } });
  const offerIds: Partial<Record<CreditKind, string>> = {};
  for (const { kind, ...data } of offers) {
    const saved = await prisma.creditOffer.upsert({
      where: { seasonId_kind: { seasonId, kind } },
      create: { seasonId, kind, ...data },
      update: data,
      select: { id: true },
    });
    offerIds[kind] = saved.id;
  }
  const c1 = offerIds.c1!;
  const c2 = offerIds.c2!;

  const code = await prisma.creditCode.upsert({
    where: { code: SPEC_CREDITS.c1.code },
    create: { offerId: c1, code: SPEC_CREDITS.c1.code, status: CreditStatus.issued },
    update: { offerId: c1, status: CreditStatus.issued },
    select: { id: true },
  });

  /* s1 제출 시각 — 시안 조건 칩의 날짜. 진도 세터는 진짜 지금으로 적는다 */
  const s1Closes = stageOf(StageKey.s1)?.closesAt;
  if (s1Closes) {
    await prisma.submission.updateMany({
      where: { entryId, stageKey: StageKey.s1, status: { not: SubmissionStatus.draft } },
      data: { submittedAt: day(s1Closes, -2) },
    });
  }
  /* 게이트 1 통과 판정 — C2 조건 칩의 날짜. 빌드 시작일에 났다고 본다 */
  if (pane === "build" || pane === "race" || pane === "end") {
    const s2 = await prisma.submission.findFirst({
      where: { entryId, stageKey: StageKey.s2 },
      select: { id: true },
    });
    if (s2) {
      await prisma.judgment.deleteMany({ where: { submissionId: s2.id } });
      await prisma.judgment.create({
        data: {
          submissionId: s2.id,
          result: JudgmentResult.pass,
          judgedAt: buildStart,
          feedback: "개발 바가 만든 판정입니다.",
          aiReport: { dev: true },
        },
      });
    }
  }
  /* 시상 기록은 ⑦(h8)만 — 다른 판에 남은 것은 걷는다 */
  if (pane !== "end") await prisma.award.deleteMany({ where: { entryId } });

  const delivered = (offerId: string, at: Date, codeId?: string) => ({
    offerId,
    entryId,
    status: CreditClaimStatus.delivered,
    unlockedAt: at,
    claimedAt: at,
    deliveredAt: at,
    deliveredVia: CreditDeliveredVia.email,
    ...(codeId ? { creditCodeId: codeId } : {}),
  });
  const c1Sent = sentAt(buildStart);
  const c2Sent = sentAt(day(buildStart, 1));

  const claims: Prisma.CreditClaimUncheckedCreateInput[] = [];
  if (pane === "sched") {
    const at = s1Closes ? day(s1Closes, -2) : devNow();
    claims.push({
      offerId: c1,
      entryId,
      status: CreditClaimStatus.scheduled,
      unlockedAt: at,
      claimedAt: at,
    });
  }
  if (pane === "build" || pane === "tester") claims.push(delivered(c1, c1Sent, code.id));
  if (pane === "race" || pane === "end") {
    claims.push({
      ...delivered(c1, c1Sent, code.id),
      status: CreditClaimStatus.confirmed,
      confirmedAt: day(c1Sent, 1),
    });
    claims.push(delivered(c2, c2Sent));
  }
  if (claims.some((c) => c.creditCodeId)) {
    await prisma.creditCode.update({
      where: { id: code.id },
      data: { status: CreditStatus.claimed },
    });
  }
  for (const claim of claims) await prisma.creditClaim.create({ data: claim });
}

/**
 * 지금 dev DB가 그리는 크레딧 판 — 「크레딧」 줄이 되짚는다. 화면과 같은 규칙
 * (`creditsPane`)에 같은 재료를 넣는다. 시안 목업 모양이 아니면 null.
 */
function creditsPaneOf(args: {
  phase: SeasonPhase;
  status: EntryStatus;
  stage: EntryStage;
  s1Submitted: boolean;
  deployVerified: boolean;
  awarded: boolean;
  offers: { kind: CreditKind; status: CreditOfferStatus }[];
  claims: { status: CreditClaimStatus; offer: { kind: CreditKind } }[];
}): CreditsPane | null {
  const season = creditSeason(args.phase);
  /* 때는 여기서 안 쓴다 — 일어났다는 사실만 EPOCH로 표시한다 */
  const when = (on: boolean) => (on ? new Date(0) : null);
  const progress: UnlockProgress = {
    s1Submitted: when(args.s1Submitted),
    gate1Passed: when(stageAtLeast(args.stage, EntryStage.s3)),
    deployVerified: when(args.deployVerified),
    finalConfirmed: when(args.awarded),
  };
  const cards = CREDIT_CARDS.map((spec) => {
    const unlocked = isUnlocked(spec.unlockEvent, progress);
    const offerStatus =
      args.offers.find((o) => o.kind === spec.kind)?.status ?? CreditOfferStatus.negotiating;
    const claimStatus = args.claims.find((c) => c.offer.kind === spec.kind)?.status ?? null;
    return {
      kind: spec.kind,
      unlocked,
      state: creditCardState({ kind: spec.kind, offerStatus, claimStatus, unlocked, season }),
    };
  });
  return creditsPane({ season, eliminated: args.status === EntryStatus.eliminated, cards });
}

/* ═══════════ 내 지표 ═══════════ */

export type { MetricsPane as MyMetricsPane } from "@/lib/metrics-view";

/*
  시안 `#scr-mymetrics`의 두 판. 둘 다 허브 h6(s4 레이스, 배포 검증됨) 위다 —
  시안의 `.db-top`이 「s4 마케팅과 유저 유입 · 주간 제출 D-2」다.

    data   시안 ① 목업 그대로 — 주간 방문 1,204 · 주간 가입 187 · 전환율 15.5%,
           14일 곡선, 채널 스레드 42% · 카카오 오픈채팅 27% · 인스타 릴스 18%
    empty  시안 ② — 검증은 됐는데 집계 행이 하나도 없다

  ⚠️ h6의 집계 픽스처(`setMetricsFixture race`)가 시즌 전 팀에 14일치를 심는다.
  그 위에서 **이 팀의 행만** 시안 값으로 갈아 끼우거나(data) 지운다(empty) —
  리더보드 순위표는 스냅샷이 정본이라 흔들리지 않는다.
*/
const SPEC_MY_METRICS = {
  /* 어제까지 14일. 뒤 7일 합이 1,204 · 187 — 시안 카드 값이다 */
  visitors: [62, 70, 78, 74, 96, 108, 104, 128, 150, 144, 176, 188, 200, 218],
  signups: [8, 10, 11, 10, 14, 17, 16, 20, 23, 22, 27, 29, 31, 35],
  /* 날마다 이 비율로 나눈다. 나머지는 direct */
  channels: [
    ["스레드", 0.42],
    ["카카오 오픈채팅", 0.27],
    ["인스타 릴스", 0.18],
  ] as const,
} as const;

export async function setSandboxMyMetrics(args: {
  entryId: string;
  pane: MyMetricsPane;
}): Promise<void> {
  assertSandbox();
  const { entryId, pane } = args;

  await setSandboxHub({ key: "h6", entryId });

  await prisma.metricChannelDaily.deleteMany({ where: { entryId } });
  await prisma.metricDaily.deleteMany({ where: { entryId } });
  if (pane === "empty") return;

  const today = seoulDateOnly(devNow());
  const days = SPEC_MY_METRICS.visitors.length;
  const dateOf = (i: number) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - days + i);
    return d;
  };
  await prisma.metricDaily.createMany({
    data: SPEC_MY_METRICS.visitors.map((visitors, i) => ({
      entryId,
      metricDate: dateOf(i),
      rawVisitors: visitors,
      validVisitors: visitors,
      pageviews: visitors * 3,
      sessions: visitors,
      signups: SPEC_MY_METRICS.signups[i],
      /* 「운영자 보정」 — 자동 집계인 척하지 않는다(픽스처와 같다) */
      source: MetricSource.manual,
      manualReviewPassed: true,
    })),
  });
  await prisma.metricChannelDaily.createMany({
    data: SPEC_MY_METRICS.visitors.flatMap((visitors, i) => {
      const tagged = SPEC_MY_METRICS.channels.map(([channel, share]) => ({
        entryId,
        metricDate: dateOf(i),
        channel,
        visitors: Math.round(visitors * share),
      }));
      const rest = visitors - tagged.reduce((s, c) => s + c.visitors, 0);
      return [...tagged, { entryId, metricDate: dateOf(i), channel: "direct", visitors: rest }];
    }),
  });
}

/** 바가 되짚는 판. 화면이 s3부터라 그 전엔 null */
function myMetricsPaneOf(args: {
  stage: EntryStage;
  hasRows: boolean;
  verified: boolean;
}): MyMetricsPane | null {
  if (!stageAtLeast(args.stage, EntryStage.s3)) return null;
  if (args.hasRows) return "data";
  return args.verified ? "empty" : null;
}

/* ── 심사 결과 ─────────────────────────────────────────────────────────── */

export type { JudgmentsPane } from "@/lib/judgments-view";

/*
  심사 결과 화면의 네 판 — 시안 `#scr-judgments`의 목업을 허브 판 위에 얹는다.

    none   h4(1차 심사 대기) — 게이트 판정 없음
    pass   h5(s3 빌드) — s2 PASS, 시안 ②의 코멘트
    fail   h12(탈락팀 접근) — s2 FAIL, 시안 ③의 요지·코멘트(허브 h12가 만든
           판정의 문구만 바꾼다. 판정 시각은 h12대로 「오늘」 — 이의신청 기한이
           지나지 않게)
    final  h8(시상 발표) — s2·s5 PASS, s5에 시안 ④의 점수표

  판정 시각은 그 게이트 마감 다음 날 14:20(시안 「판정 10.12 14:20」의 시각),
  확정은 s5 마감 뒤 10:00(「확정 11.03 10:00」)이다 — 날짜는 dev 일정을 따른다.
*/
const SPEC_JUDGMENTS = {
  pass: "수요 검증이 충실합니다. 비지인 인터뷰 6건과 유효 사전 신청 24건이 확인되고, 위험 가정(\"구독료 지불 의사\")이 조사 설계와 정확히 연결됐습니다. 기존 대안 분석에서 원가표 수작업의 불만 지점을 잡아낸 것이 차별 포인트로 이어졌습니다.",
  /* 첫 문단이 요지 — 괄호 숫자는 화면이 붙인다(허브 h12와 같다) */
  fail: "수요 신호 부족\n\n문제 정의는 명확하나 수요 검증이 통과 기준에 못 미칩니다. 사전 신청 3건은 존재 확인 기준(10건)에 미달하고, 비지인 직접 조사 기록이 없습니다. 채널을 페르소나가 실제로 모여 있는 곳으로 좁혀 다음 시즌 재도전을 권합니다.",
  finalPass: "수요 검증이 충실합니다. 비지인 인터뷰 6건과 유효 사전 신청 24건이 확인됐습니다.",
  /* `judgments-view.ts`의 `FinalScoreJson` — 축 점수·총점은 화면이 센다 */
  score: {
    items: {
      T1: { raw: "V 1,248", score: 80.8 },
      T2: { raw: "r 2.0배", score: 66.7 },
      T3: { raw: "유효 채널 3.35", score: 100 },
      R1: { raw: "W ₩126,000", score: 44.4 },
      R2: { raw: "0.62%", score: 35.2 },
      R3: { raw: "결제형 L3, 결제자 7인", score: 75 },
    },
    compliance: { raw: "주간 제출 누락 0, 증빙 불응 0", factor: 1 },
    rank: { position: 2, teams: 11, floorsMet: true },
  },
  formulaVersion: "v0.3.1",
} as const;

const JUDGMENTS_HUB: Record<JudgmentsPane, HubKey> = {
  none: "h4",
  pass: "h5",
  fail: "h12",
  final: "h8",
};

export async function setSandboxJudgments(args: {
  entryId: string;
  pane: JudgmentsPane;
}): Promise<void> {
  assertSandbox();
  const { entryId, pane } = args;

  await setSandboxHub({ key: JUDGMENTS_HUB[pane], entryId });

  const entry = await prisma.entry.findUniqueOrThrow({
    where: { id: entryId },
    select: {
      seasonId: true,
      submissions: {
        where: { stageKey: { in: [StageKey.s2, StageKey.s5] } },
        select: { id: true, stageKey: true },
      },
    },
  });
  const stages = await prisma.stage.findMany({
    where: { seasonId: entry.seasonId, stageKey: { in: [StageKey.s2, StageKey.s5] } },
    select: { stageKey: true, closesAt: true },
  });
  const gate = (key: StageKey) => entry.submissions.find((x) => x.stageKey === key) ?? null;
  const closes = (key: StageKey) => {
    const at = stages.find((x) => x.stageKey === key)?.closesAt;
    if (!at) throw new Error(`[dev] ${key} 마감이 없다`);
    return at;
  };
  /* 마감(23:59 서울) 다음 날 14:20 */
  const judgedAfterClose = (key: StageKey) =>
    new Date(closes(key).getTime() + (14 * 60 + 21) * 60_000);

  const s2 = gate(StageKey.s2);
  const s5 = gate(StageKey.s5);

  if (pane === "none") {
    await prisma.judgment.deleteMany({
      where: { submissionId: { in: entry.submissions.map((x) => x.id) } },
    });
    return;
  }
  if (!s2) throw new Error("[dev] s2 제출물이 없다 — 허브 판이 만들었어야 한다");

  if (pane === "pass") {
    await prisma.judgment.deleteMany({ where: { submissionId: s2.id } });
    await prisma.judgment.create({
      data: {
        submissionId: s2.id,
        result: JudgmentResult.pass,
        feedback: SPEC_JUDGMENTS.pass,
        judgedAt: judgedAfterClose(StageKey.s2),
        aiReport: { dev: true },
      },
    });
    return;
  }

  if (pane === "fail") {
    /* h12가 만든 판정(요지 「수요 신호 부족」)에 시안 ③의 코멘트를 붙인다 */
    await prisma.judgment.updateMany({
      where: { submissionId: s2.id, result: JudgmentResult.fail },
      data: { feedback: SPEC_JUDGMENTS.fail },
    });
    return;
  }

  /* final — h8의 `gatePass`가 단 판정 둘에 시안 ④의 문구·점수표 */
  if (!s5) throw new Error("[dev] s5 제출물이 없다 — 허브 h8이 만들었어야 한다");
  await prisma.judgment.updateMany({
    where: { submissionId: s2.id },
    data: { feedback: SPEC_JUDGMENTS.finalPass, judgedAt: judgedAfterClose(StageKey.s2) },
  });
  await prisma.judgment.updateMany({
    where: { submissionId: s5.id },
    data: {
      feedback: null,
      /* s5 마감은 자정(서울)이라 같은 날 10:00 */
      judgedAt: new Date(closes(StageKey.s5).getTime() + 10 * 60 * 60_000),
      scoreBreakdown: SPEC_JUDGMENTS.score,
      formulaVersion: SPEC_JUDGMENTS.formulaVersion,
    },
  });
}

/* ── 소명 ─────────────────────────────────────────────────────────────── */

export type { AppealPane } from "@/lib/appeal-view";

/*
  소명 화면의 두 판 — 시안 `#scr-appeal`의 목업을 허브 h14(레이스 중 실격) 위에 얹는다.

    write  실격 제재(h14가 만든 것, 통지는 「오늘」 3일 전)와 방문 -214 보정 플래그
           (「오늘」 4일 전)가 소명 대상이고 접수는 없다
    sent   실격 제재에 소명이 접수됐고(「오늘」 2일 전 09:12) 운영진 회신이 왔다
           (어제 16:40, 시안 ②의 문구 — `**…**`가 청록 강조)

  날짜는 「오늘」 기준이라 시안의 10.22·10.23·10.24와 다르다 — 헤더의 「소명 D-4」가
  h14의 기한(오늘 + 4일)에서 나오고 그것을 따른다. 대조는 날짜를 뺀다.
*/
const SPEC_APPEAL = {
  reason:
    "10.21 새벽 트래픽 급증은 커뮤니티 글이 밤 사이 상단에 노출된 결과예요. 해당 글 링크와 시간대별 유입 캡처를 첨부해요.",
  reply:
    "근거 지표, 10.21 03:12~04:40 유입 214건, 유입원 IP 다양성 187, 체류 중앙값 41초. 봇 패턴에 해당하지 않아 **제재를 해제**하고 지표를 원복했습니다. 리더보드에는 다음 롤업에 반영됩니다.",
  adjusted: -214,
  flagReason: "개발 바가 만든 플래그",
} as const;

/** 「오늘」에서 n일 전의 서울 hh:mm */
function seoulDaysAgo(days: number, hh: number, mm: number): Date {
  const day = seoulDateOnly(devNow());
  return new Date(day.getTime() - days * 86_400_000 + ((hh - 9) * 60 + mm) * 60_000);
}

export async function setSandboxAppeal(args: {
  entryId: string;
  pane: AppealPane;
}): Promise<void> {
  assertSandbox();
  const { entryId, pane } = args;

  await setSandboxHub({ key: "h14", entryId });

  /* 접수 기록은 늘 걷는다 — ①은 없어야 하고 ②는 새로 심는다 */
  await prisma.appeal.deleteMany({ where: { entryId } });
  await prisma.abuseFlag.deleteMany({ where: { entryId, reason: SPEC_APPEAL.flagReason } });

  const sanction = await prisma.sanction.findFirst({
    where: { entryId, stage: SanctionStage.disqualified },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!sanction) throw new Error("[dev] 실격 제재가 없다 — 허브 h14가 만들었어야 한다");

  /* 통지는 「오늘」 3일 전 — 시안 「실격 처분 (10.22 통지)」의 자리 */
  const noticedAt = seoulDaysAgo(3, 11, 0);
  await prisma.sanction.update({
    where: { id: sanction.id },
    data: { createdAt: noticedAt, appliedAt: noticedAt, appealText: null, appealedAt: null },
  });
  await prisma.abuseFlag.create({
    data: {
      entryId,
      reason: SPEC_APPEAL.flagReason,
      status: AbuseStatus.upheld,
      adjustedVisitors: SPEC_APPEAL.adjusted,
      createdAt: seoulDaysAgo(4, 9, 30),
    },
  });
  if (pane === "write") return;

  const submittedAt = seoulDaysAgo(2, 9, 12);
  await prisma.appeal.create({
    data: {
      entryId,
      targetType: "sanction",
      targetId: sanction.id,
      reasonText: SPEC_APPEAL.reason,
      submittedAt,
      responseDueAt: responseDeadline(submittedAt),
      responseText: SPEC_APPEAL.reply,
      respondedAt: seoulDaysAgo(1, 16, 40),
      corrected: true,
    },
  });
  await prisma.sanction.update({
    where: { id: sanction.id },
    data: { appealText: SPEC_APPEAL.reason, appealedAt: submittedAt },
  });
}

/** 바가 되짚는 판. 화면이 s2부터라 그 전엔 null */
function judgmentsPaneOf(args: {
  stage: EntryStage;
  gate1: { result: string } | null;
  gate2: { result: string } | null;
}): JudgmentsPane | null {
  if (!stageAtLeast(args.stage, EntryStage.s2)) return null;
  return judgmentsPane({ gate1: args.gate1, gate2: args.gate2 });
}

// ─────────────────────────────────────────────────────────────
// 알림센터
// ─────────────────────────────────────────────────────────────

export type NotiPane = "list" | "empty";

/*
  시안 `#scr-noti` ① 목업 여덟 줄. 날짜는 「오늘」에서 며칠 전인가로 적는다 —
  h6의 「오늘」이 시안 헤더 「주간 제출 D-2」의 자리라 시안의 10.23이 오늘이다.
  (시안 목업의 순서는 날짜와 안 맞는다. 화면은 최신 순이다.)
*/
const SPEC_NOTI = [
  { type: "gate_result", title: "1차 심사 통과!", body: "s3 빌드와 배포가 열렸어요. 배포 가이드를 확인해요.", daysAgo: 11, read: false, link: "/dashboard/submit/s3" },
  { type: "deadline", title: "이번 주 활동 제출 D-2", body: "s4 주간 제출 마감이 다가와요.", daysAgo: 0, read: false, link: "/dashboard/submit/s4" },
  { type: "notice", title: "롤업 주기 안내", body: "리더보드는 15분마다 갱신돼요.", daysAgo: 4, read: true, link: null },
  { type: "submission", title: "s2 제출 접수", body: "48시간 내 판정 결과를 알려드려요.", daysAgo: 13, read: true, link: null },
  { type: "notice", title: "측정 연동 확인됨", body: "little-potion.proovit.kr 집계가 시작됐어요.", daysAgo: 15, read: true, link: "/dashboard/measurement" },
  { type: "deadline", title: "s2 마감 D-1", body: "랜딩, 수요조사 제출을 잊지 마세요.", daysAgo: 13, read: true, link: null },
  { type: "notice", title: "시즌 1 킥오프", body: "5주 뒤, 지표로 만나요.", daysAgo: 25, read: true, link: null },
  { type: "notice", title: "환영해요 👋", body: "온보딩 체크리스트에서 시작해요, 팀 구성 → 측정 연동.", daysAgo: 27, read: true, link: "/dashboard" },
] as const;

/**
 * 알림센터 판. 허브 h6(s4 레이스, 시안 헤더와 같은 판) 위에 **이 팀 팀원 전부**의
 * 알림을 걷고 다시 심는다 — 알림은 사람마다 한 행이다.
 *   list   시안 목업 여덟 줄
 *   empty  막 가입한 사람 — 가입 어댑터가 만드는 환영 알림 한 줄, 「지금」 시각
 */
export async function setSandboxNotifications(args: {
  entryId: string;
  pane: NotiPane;
}): Promise<void> {
  assertSandbox();
  const { entryId } = args;

  await setSandboxHub({ key: "h6", entryId });

  const entry = await prisma.entry.findUniqueOrThrow({
    where: { id: entryId },
    select: { team: { select: { members: { select: { userId: true } } } } },
  });
  const users = entry.team.members.map((m) => m.userId);

  await prisma.notification.deleteMany({ where: { userId: { in: users } } });
  if (args.pane === "empty") {
    /* 「방금」은 화면이 개발 시계로 판정한다 — 심는 시각도 그 시계다 */
    const at = devNow();
    await prisma.notification.createMany({
      data: users.map((userId) => ({
        userId,
        ...NOTI_WELCOME,
        channel: NotifChannel.inapp,
        sentAt: at,
        createdAt: at,
      })),
    });
    return;
  }
  await prisma.notification.createMany({
    data: users.flatMap((userId) =>
      SPEC_NOTI.map((n, i) => {
        /* 같은 날은 목업 순서대로 — 분으로 벌린다 */
        const at = seoulDaysAgo(n.daysAgo, 10, 59 - i);
        return {
          userId,
          type: n.type,
          title: n.title,
          body: n.body,
          linkUrl: n.link,
          channel: NotifChannel.inapp,
          sentAt: at,
          createdAt: at,
          readAt: n.read ? at : null,
        };
      }),
    ),
  });
}
