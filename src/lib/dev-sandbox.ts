import type { Prisma } from "@/generated/prisma/client";
import {
  ConsentType,
  EntryStage,
  EntryStatus,
  MemberRole,
  MetricSource,
  SeasonPhase,
  StageKey,
  SubmissionStatus,
} from "@/generated/prisma/enums";
import type { FeatureFlagKey } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

/*
  개발용 상태 토글의 **판정과 쓰기**. 화면은 components/DevBar가 그린다.

  시안의 화면마다 STATE 줄이 있는데(로그인/회원가입, 집계 전/레이스/종료 …),
  실제 앱에서 그 상태를 만들려면 DB를 손으로 고쳐야 한다. 화면을 훑어보는 동안
  터미널을 왕복하면 그 마찰 때문에 안 보고 넘어가는 상태가 생긴다. 이 파일이
  그 왕복을 없앤다.

  ══════════════════════════════════════════════════════════════
  ⚠️ 안전장치가 **둘**이고, 둘 다 통과해야 동작한다.
  ══════════════════════════════════════════════════════════════

    ① NODE_ENV가 production이 아닐 것
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
  if (process.env.NODE_ENV === "production") {
    return { ok: false, reason: "production 빌드에서는 열지 않습니다." };
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
function assertSandbox(): void {
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
  /** 이 팀 팀장의 이메일. 어느 계정으로 들어가는지 알려준다 */
  email: string;
};

export type SandboxState = {
  teams: SandboxTeam[];
  season: {
    id: string;
    slug: string;
    phase: SeasonPhase;
    flags: Record<string, boolean>;
    /** 리더보드가 지금 어느 상태로 보이는가 */
    metrics: MetricsFixture;
  } | null;
};

/**
 * 고를 수 있는 팀 목록.
 *
 * **팀장이 있는 팀만** 준다. 팀원 계정으로 들어가면 쓰기 화면이 전부 잠겨
 * (leaderOnly) 검토할 것이 절반으로 준다.
 */
export async function loadSandboxState(): Promise<SandboxState> {
  assertSandbox();

  const [entries, season] = await Promise.all([
    prisma.entry.findMany({
      orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        stage: true,
        status: true,
        ideaTitle: true,
        team: {
          select: {
            name: true,
            members: {
              where: { role: "leader" },
              take: 1,
              select: { userId: true, user: { select: { email: true } } },
            },
          },
        },
      },
    }),
    prisma.season.findFirst({
      where: { phase: { not: SeasonPhase.draft } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        slug: true,
        phase: true,
        featureFlags: true,
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
      },
    }),
  ]);

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
        email: leader.user.email,
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
          flags: (season.featureFlags ?? {}) as Record<string, boolean>,
          metrics: !season.snapshots[0]
            ? "none"
            : season.snapshots[0].isFinal
              ? "final"
              : "race",
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

function devPayload(key: StageKey): Prisma.InputJsonObject {
  switch (key) {
    case StageKey.s1:
      return {
        concept: "[개발용] 1인 카페 사장님을 위한 시그니처 레시피 구독",
        problemDoc:
          "[개발용] 화면 검토를 위해 개발자 도구가 만든 제출물입니다. 실제 참가자가 쓴 내용이 아닙니다.",
        coreFeature: "[개발용] 매주 레시피와 원가표 발송",
        notBuilding: ["[개발용] 재고 관리", "[개발용] POS 연동"],
        riskiest: "[개발용] 구독료를 낼 의사가 있는가",
        guideChecks: [true, true, true],
      };
    case StageKey.s3:
      return {
        serviceUrl: "https://example.com",
        builder: "[개발용] 러버블",
        signupConnected: true,
        launchChecks: Array.from({ length: 10 }, () => true),
        aiFeature: false,
        aiChecks: Array.from({ length: 5 }, () => false),
      };
    default:
      /* s2·s4·s5는 아직 폼이 없다. 자리만 채워 「냈다」가 성립하게 한다 */
      return { note: "[개발용] 개발자 도구가 만든 제출물" };
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
          payload: devPayload(stageKey),
          submittedBy: userId,
          submittedAt: now,
        },
        update: {
          status: SubmissionStatus.submitted,
          submittedAt: now,
        },
      });
    }

    /*
      뒤로 되돌릴 때는 넘치는 제출물을 **지운다.** 남겨두면 "s1인데 s3 제출이
      있는" 상태가 되어 화면이 실제로는 나올 수 없는 조합을 그린다.
    */
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
}

/**
 * 기능 플래그 하나를 뒤집는다.
 *
 * JSONB를 통째로 덮어쓰지 않고 읽어서 한 키만 바꾼다 — 나중에 플래그가 늘었을 때
 * 이 함수가 모르는 키를 지워버리면 그게 제일 찾기 어려운 버그가 된다.
 */
export async function toggleSandboxFlag(args: {
  seasonId: string;
  flag: FeatureFlagKey;
  value: boolean;
}): Promise<void> {
  assertSandbox();
  const season = await prisma.season.findUniqueOrThrow({
    where: { id: args.seasonId },
    select: { featureFlags: true },
  });
  const flags = (season.featureFlags ?? {}) as Prisma.InputJsonObject;
  await prisma.season.update({
    where: { id: args.seasonId },
    data: { featureFlags: { ...flags, [args.flag]: args.value } },
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

/** 팀 순서로 정해지는 값. 앞 팀일수록 많다 — 순위가 눈에 보이게 */
function fixtureVisitors(index: number, day: number): number {
  const base = 320 - index * 38;
  /* 뒤로 갈수록 늘어나는 완만한 곡선. day는 0(가장 옛날)부터 */
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

  ⚠️ 「시즌 종료」도 s4를 진행 중으로 둔다. 어색해 보이지만 시안이 세 상태에서
  **같은 트랙**을 그리기 때문이다(`#lbTrack` 하나를 세 pane이 공유한다).
  여기서 s5까지 끝내 놓으면 트랙만 시안과 어긋난다.
*/
const WEEK_MS = 7 * 86_400_000;
const MIN_MS = 60_000;

function fixtureStageDates(kind: MetricsFixture, now: number) {
  /*
    집계 전  — s3까지 마감했고 s4가 14분 뒤 열린다. 첫 갱신 기준이 s4 시작이라
              화면에 「첫 갱신까지 14분」이 뜬다(시안 1624행과 같은 문장).
    나머지  — s4가 이틀 전 열려 진행 중이다.
  */
  const s4OpensAt = kind === "none" ? now + 14 * MIN_MS : now - 2 * 86_400_000;
  const KEYS = [StageKey.s1, StageKey.s2, StageKey.s3, StageKey.s4, StageKey.s5];
  return KEYS.map((stageKey, i) => {
    const opensAt = new Date(s4OpensAt + (i - 3) * WEEK_MS);
    return {
      stageKey,
      opensAt,
      /* 마감은 다음 스테이지가 열리기 1분 전 — 규칙서의 「마감 10.11 23:59」 모양 */
      closesAt: new Date(opensAt.getTime() + WEEK_MS - MIN_MS),
    };
  });
}

export async function setMetricsFixture(args: {
  seasonId: string;
  kind: MetricsFixture;
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

  /* 셋 다 스테이지 날짜를 옮긴다 — 「집계 전」도 그 나름의 순간이 있다 */
  const stageDates = fixtureStageDates(kind, Date.now()).map((s) =>
    prisma.stage.updateMany({
      where: { seasonId, stageKey: s.stageKey },
      data: { opensAt: s.opensAt, closesAt: s.closesAt },
    }),
  );

  if (kind === "none" || entries.length === 0) {
    await prisma.$transaction([...clear, ...stageDates]);
    return;
  }

  /* 오늘은 빼고 어제까지 14일. 화면이 전일까지만 공개하기 때문이다 */
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

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
      const total = Array.from({ length: 14 - back }, (_, day) =>
        fixtureVisitors(index, day),
      ).reduce((sum, v) => sum + v, 0);
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
    return userId
      ? [
          {
            userId,
            entryId: entry.id,
            type: ConsentType.metrics_public,
            granted: true,
            version: "[개발용]",
          },
        ]
      : [];
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
          awardedAt: new Date(),
        }))
      : [];

  await prisma.$transaction([
    ...clear,
    ...stageDates,
    prisma.award.createMany({ data: awards, skipDuplicates: true }),
    prisma.metricDaily.createMany({ data: daily, skipDuplicates: true }),
    prisma.leaderboardSnapshot.createMany({
      data: snapshots,
      skipDuplicates: true,
    }),
    prisma.consent.createMany({ data: consents }),
  ]);
}

// ═════════════════════════════════════════════════════════════
// 팀 시점으로 갈아타기
// ═════════════════════════════════════════════════════════════

/*
  세션 전략이 DB라(auth.ts) 세션 행 하나를 만들고 쿠키를 그 토큰으로 바꾸면
  그 사람으로 들어간 것과 **완전히 같다.** 판정 경로(access.ts)에 "~인 척한다"는
  분기를 넣지 않는 것이 핵심이다 — 거기는 접근 판정의 입력이라 개발용 우회로가
  하나라도 생기면 안 된다.

  ⚠️ 쿠키 이름은 Auth.js 규약이다. https에서는 `__Secure-` 접두사가 붙는데
  이 도구는 dev(http)에서만 열리므로 접두사 없는 쪽만 쓴다.
*/
export const DEV_SESSION_COOKIE = "authjs.session-token";

/** 이 팀 팀장으로 로그인한다. 돌려주는 값은 쿠키에 심을 세션 토큰 */
export async function impersonate(userId: string): Promise<{
  token: string;
  expires: Date;
}> {
  assertSandbox();

  const token = crypto.randomUUID();
  /* 짧게 잡는다. 개발 도구가 만든 세션이 오래 살아 있을 이유가 없다 */
  const expires = new Date(Date.now() + 12 * 60 * 60 * 1000);

  await prisma.session.create({
    data: { sessionToken: token, userId, expires },
  });

  return { token, expires };
}
