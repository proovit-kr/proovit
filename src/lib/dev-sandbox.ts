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
        team: {
          select: {
            name: true,
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

    /* 신청 화면이 남기는 참가 동의 3종과 같은 행 — 버전도 진짜 값이다 */
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

  await prisma.$transaction(async (tx) => {
    await setLeaderboardFlag(tx, args.seasonId, at >= KEYS.indexOf(StageKey.s4));
  });

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
}
