import type { Prisma } from "@/generated/prisma/client";
import {
  ConsentType,
  DeployStatus,
  EntryStage,
  EntryStatus,
  JudgmentResult,
  MemberRole,
  MetricSource,
  SanctionReason,
  SanctionStage,
  SeasonPhase,
  StageKey,
  SubmissionStatus,
} from "@/generated/prisma/enums";
import {
  ACCOUNT_PRIVACY_CONSENT_VERSION,
  ACCOUNT_TERMS_CONSENT_VERSION,
  APPLY_CONSENTS,
} from "@/content/consent";
import { applyConsentRows } from "@/lib/apply-store";
import { devNow, setDevToday } from "@/lib/dev-clock";
import { seoulDateOnly } from "@/lib/measure";
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
  /* 아래 둘은 허브 줄이 「지금 어느 판인가」를 되짚는 데 쓴다 */
  solo: boolean;
  verified: boolean;
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
  } | null;
};

/**
 * 팀 목록과 시즌 상태. 바는 로그인한 계정이 팀장인 팀을 이 목록에서 찾는다.
 *
 * **팀장이 있는 팀만** 준다. 진도·상태 줄이 제출물을 팀장 이름으로 만든다.
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
        hostname: { select: { deployStatus: true, ownershipVerifiedAt: true } },
        team: {
          select: {
            name: true,
            isSolo: true,
            members: {
              where: { role: "leader" },
              take: 1,
              select: { userId: true },
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
  const now = devNow().getTime();

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
        verified:
          entry.hostname?.deployStatus === DeployStatus.active &&
          entry.hostname.ownershipVerifiedAt !== null,
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
        name: "[개발용] 보관",
        nickname: "[개발용] 보관",
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
            name: `[개발용] ${user.nickname}`.slice(0, 60),
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
        ideaTitle: "[개발용] 개발 바가 만든 참가작",
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

  ⚠️ **화면은 아직 아홉만 있다.** 정상 흐름 h1~h9는 `resolveHubPane()`이 받고,
  예외 h10~h17은 그 함수가 null을 내 옛 안내가 그려진다. 그래도 **상태는 지금
  만들 수 있어야 한다** — 다음 사람이 그 판을 옮길 때 바로 눌러서 본다.

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
    solo: true, verified: true, raceStage: StageKey.s2,
    draft: { stageKey: StageKey.s2, payload: { guideChecks: [true, false, false] } },
  },
  h4: {
    label: "4, 1차 심사 대기", group: "정상 흐름",
    phase: SeasonPhase.racing, stage: EntryStage.s2,
    solo: true, verified: true, raceStage: StageKey.s2,
  },
  h5: {
    label: "5, s3 빌드와 배포", group: "정상 흐름", inBar: false,
    phase: SeasonPhase.racing, stage: EntryStage.s3,
    solo: true, verified: true, raceStage: StageKey.s3,
    /* 빌더는 골랐고 배포 주소는 아직 — 시안 h5가 그 모양이다 */
    draft: {
      stageKey: StageKey.s3,
      payload: { builder: "[개발용] 러버블", launchChecks: [], aiChecks: [] },
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
  },
  h8: {
    label: "8, 시상 발표", group: "정상 흐름",
    phase: SeasonPhase.awarded, stage: EntryStage.completed,
    solo: true, verified: true, metrics: "final",
  },
  h9: {
    label: "9, 시즌 아카이브", group: "정상 흐름",
    phase: SeasonPhase.archived, stage: EntryStage.completed,
    solo: true, verified: true, metrics: "final",
  },

  /*
    h10 지각 참가 — 온보딩이 안 끝났는데 s1이 이미 열려 있다.
    h1과 갈리는 것은 페이즈뿐이다(모집 중 → 레이스).
  */
  h10: {
    label: "10, 지각 참가", group: "예외",
    phase: SeasonPhase.racing, stage: EntryStage.applied,
    solo: false, verified: false, raceStage: StageKey.s1,
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
    solo: true, verified: true, raceStage: StageKey.s5, metrics: "final",
  },
  /* h16 종료 후 쓰기 시도 — DB 상태는 h9와 같다. 화면만 다르다 */
  h16: {
    label: "16, 종료 후 쓰기 시도", group: "예외",
    phase: SeasonPhase.archived, stage: EntryStage.completed,
    solo: true, verified: true, metrics: "final",
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
  seasonId: string;
  userId: string;
}): Promise<void> {
  assertSandbox();
  const { key, entryId, seasonId, userId } = args;
  const plan = HUB_PLANS[key];

  const entry = await prisma.entry.findUniqueOrThrow({
    where: { id: entryId },
    select: { teamId: true },
  });
  /*
    ⚠️ **보관 계정이 앉아 있으면 먼저 비운다.** 「참가팀 없음」 줄이 그 사람의
    팀 자리를 보관 계정으로 옮기는데, 그 상태로 허브 줄을 누르면 진도만 바뀌고
    **로그인한 사람에게는 여전히 참가 기록이 없다** — 허브가 「참가 신청부터
    해요」를 그린다(2026-09-21에 수연이 그 화면을 봤다). 허브 17판은 전부
    참가자 화면이라 「참가 기록이 있다」가 전제다.
  */
  await unparkTeam(entry.teamId);

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
  await setSandboxStage({ entryId, stage: plan.stage, userId });
  await prisma.entry.update({
    where: { id: entryId },
    data: { status: plan.status ?? EntryStatus.active },
  });
  await prisma.team.update({
    where: { id: entry.teamId },
    data: { isSolo: plan.solo },
  });
  await prisma.hostname.updateMany({
    where: { entryId },
    data: {
      deployStatus: plan.verified ? DeployStatus.active : DeployStatus.pending,
      ownershipVerifiedAt: plan.verified ? devNow() : null,
    },
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
          feedback:
            "[개발용] 수요 신호가 부족합니다. 개발자 도구가 만든 판정이라 실제 심사가 아닙니다.",
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
        detail: "[개발용] 봇 트래픽이 감지됐습니다. 개발자 도구가 만든 제재입니다.",
        appealDeadlineAt: new Date(devNow().getTime() + 4 * 86_400_000),
      },
    });
  }

  if (plan.metrics) {
    await setMetricsFixture({ seasonId, kind: plan.metrics });
  }
  /*
    ⚠️ 「오늘」은 맨 마지막에 옮긴다. `setSandboxCurrentStage`가 집계와 리더보드
    플래그도 같이 정하는데, 픽스처가 언제나 플래그를 켜기 때문이다.
  */
  if (plan.raceStage && plan.phase === SeasonPhase.racing) {
    await setSandboxCurrentStage({ seasonId, stage: plan.raceStage });
  }

  if (plan.nextSeason) await ensureNextSeason(seasonId);
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
}): HubKey | null {
  const keys = Object.keys(HUB_PLANS) as HubKey[];
  const hit = keys.find((key) => {
    const plan = HUB_PLANS[key];
    if (plan.phase !== now.phase) return false;
    if (plan.stage !== now.stage) return false;
    if ((plan.status ?? EntryStatus.active) !== now.status) return false;
    if (plan.solo !== now.solo || plan.verified !== now.verified) return false;
    /* 레이스 밖에서는 「오늘」이 판을 가르지 않는다 */
    if (plan.raceStage && plan.phase === SeasonPhase.racing) {
      return plan.raceStage === now.raceStage;
    }
    return true;
  });
  return hit ?? null;
}

/**
 * 그 팀에 앉아 있는 개발용 보관 계정을 원래 주인에게 돌려준다.
 *
 * 보관 계정의 메일이 `devbar-parked-<원래 userId>@example.com`이라 주인을
 * 되찾을 수 있다. 보관이 겹쳐 쌓였을 수도 있어(보관의 보관) 체인을 푼다.
 */
async function unparkTeam(teamId: string): Promise<void> {
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
async function sleepNextSeason(currentId: string): Promise<void> {
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
    select: { createdAt: true, endsAt: true },
  });
  const next = await prisma.season.findFirst({
    where: { id: { not: currentId }, createdAt: { gt: current.createdAt } },
    orderBy: { createdAt: "desc" },
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
  await prisma.season.create({
    data: {
      slug: "season-2",
      title: "시즌 2",
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

  ⚠️ `EntryStage`는 **마지막으로 완료한 단계**다. s2 주차를 진행 중인 팀은
  s1까지 낸 상태(`s1`)이고, s3 주차 팀은 s2 게이트를 통과한 상태(`s3`)다.
  게이트에 멈춘 상태(판정 대기 `s2`·`s5`)는 그 주차를 「정상으로 지나는」
  모습이 아니라 여기 없다 — 진도 줄의 「4, 1차 심사 대기」가 그 자리다.
*/
const STAGE_PACE: Record<StageKey, EntryStage> = {
  [StageKey.s1]: EntryStage.applied,
  [StageKey.s2]: EntryStage.s1,
  [StageKey.s3]: EntryStage.s3,
  [StageKey.s4]: EntryStage.s4,
  [StageKey.s5]: EntryStage.s5,
};

/**
 * 그 주차를 정상으로 지나는 팀으로 만든다 — 진도와 온보딩.
 *
 * ⚠️ **집계는 건드리지 않는다.** `setSandboxCurrentStage`가 스테이지별 규칙을
 * 이미 갖고 있고(s4는 고르는 자리라 그대로 둔다), 여기서 덮으면 s4의 집계 줄이
 * 무슨 값을 눌러도 되돌아간다.
 */
export async function setSandboxPace(args: {
  entryId: string;
  seasonId: string;
  userId: string;
  stage: StageKey;
}): Promise<void> {
  assertSandbox();
  const { entryId, userId, stage } = args;

  const entry = await prisma.entry.findUniqueOrThrow({
    where: { id: entryId },
    select: { teamId: true },
  });
  /* 「참가팀 없음」으로 비워 둔 자리가 있으면 먼저 돌려받는다 */
  await unparkTeam(entry.teamId);

  await setSandboxStage({ entryId, stage: STAGE_PACE[stage], userId });
  await prisma.entry.update({
    where: { id: entryId },
    data: { status: EntryStatus.active },
  });
  /* 일정대로 왔다면 온보딩은 이미 끝난 팀이다 */
  await prisma.team.update({
    where: { id: entry.teamId },
    data: { isSolo: true },
  });
  await prisma.hostname.updateMany({
    where: { entryId },
    data: { deployStatus: DeployStatus.active, ownershipVerifiedAt: devNow() },
  });
}
