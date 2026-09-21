/*
  대시보드 허브 대조용 dev DB 상태 스위치 — 시안 17판(h1~h17).

    node --env-file=.env.development.local --import tsx scripts/design-diff/hub-state.mts save
    node --env-file=.env.development.local --import tsx scripts/design-diff/hub-state.mts h6
    node --env-file=.env.development.local --import tsx scripts/design-diff/hub-state.mts restore

  `h1`~`h17`은 상태를 만든 뒤 **세션 토큰 한 줄**을 찍는다 — `hub.mjs`가 그것을
  쿠키로 심어 그 팀의 대시보드를 연다(auth.mjs가 `consent-session.mts`를 쓰는
  것과 같은 방식).

  개발 바로도 페이즈·진도는 바꿀 수 있지만 **온보딩(팀·측정)과 아카이브는 못
  바꾼다** — 바에 그 줄이 없다(archived는 2026-09-19에 수연이 뺐다). 그리고
  대조는 폭마다 다시 돌리는 일이라 손으로 누르면 중간에 어긋난 상태로 재게 된다.

  ⚠️ **반드시 .env.development.local로 돌린다.** `.env`는 운영 DB다
  (lb-state.mts와 같은 가드).
*/
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DeployStatus,
  EntryStage,
  EntryStatus,
  SeasonPhase,
} from "../../src/generated/prisma/enums";
import {
  checkDevSandbox,
  HUB_PLANS,
  setMetricsFixture,
  setSandboxHub,
  setSandboxStage,
  sleepNextSeason,
  unparkTeam,
  type HubKey,
} from "../../src/lib/dev-sandbox";
import { devToday, setDevToday } from "../../src/lib/dev-clock";
import { setDevHubKey } from "../../src/lib/dev-hub";
import { prisma } from "../../src/lib/prisma";

const check = checkDevSandbox();
if (!check.ok) throw new Error(`[hub-state] ${check.reason}`);

const DIR = join(tmpdir(), "proovit-design-diff");
mkdirSync(DIR, { recursive: true });
const SNAP = join(DIR, "hub-state.json");

const SLUG = process.env.HUB_SLUG ?? "season-1";
/*
  시안 목업이 쓰는 팀 이름이 dev DB에 그대로 있다(랜딩 주소도 little-potion).
  계정을 이름으로 찾는다 — 스크립트에 사람의 메일 주소를 적지 않는다.
*/
const TEAM = process.env.HUB_TEAM ?? "리틀포션";

const season = await prisma.season.findUniqueOrThrow({
  where: { slug: SLUG },
  select: { id: true, phase: true, featureFlags: true },
});

const entry = await prisma.entry.findFirstOrThrow({
  where: { seasonId: season.id, team: { name: TEAM } },
  select: {
    id: true,
    stage: true,
    status: true,
    teamId: true,
    team: { select: { isSolo: true } },
    hostname: {
      select: { deployStatus: true, ownershipVerifiedAt: true },
    },
  },
});

/*
  ⚠️ **팀장을 읽기 전에 보관을 푼다.** 지각 참가(h10)는 그 사람의 참가 자리를
  보관 계정으로 옮겨 두는데(「참가팀 없음」과 같은 일), 그 상태로 다음 판을
  만들면 **팀장이 보관 계정으로 읽혀** 세션이 엉뚱한 사람으로 열린다 —
  화면이 계속 「참가 기록 없음」이라 다음 판이 통째로 안 뜬다(09-21에 대조
  가드가 잡았다: 「구현본이 late을 그린다 — h11는 missed여야 한다」).
*/
await unparkTeam(entry.teamId);

const leader = (
  await prisma.teamMember.findFirst({
    where: { teamId: entry.teamId, role: "leader" },
    select: { userId: true },
  })
)?.userId;
if (!leader) throw new Error(`[hub-state] ${TEAM} 팀장을 못 찾았다`);

/*
  ⚠️ **판의 표는 여기 없다.** `src/lib/dev-sandbox.ts`의 `HUB_PLANS`가 정본이고
  개발 바의 「진도」 줄이 같은 표를 쓴다(2026-09-21 수연 지시로 그 줄이 시안
  `#hubSel` 17종이 됐다). 여기서 또 적으면 바로 갈린다.
*/

const mode = process.argv[2];

/** 그 팀장으로 로그인한 세션 하나. 한 시간 산다 */
async function session(): Promise<string> {
  const token = crypto.randomUUID();
  await prisma.session.create({
    data: {
      sessionToken: token,
      userId: leader!,
      expires: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return token;
}

/*
  ⚠️ **픽스처가 켜진 상태를 원본으로 저장하지 않는다.**

  h1~h9를 한 번이라도 돌린 뒤에 `save`하면 그 상태가 원본이 되어 `restore`가
  돌아갈 곳을 잃는다(2026-09-21에 실제로 그랬다 — 페이즈가 archived로 굳었다).

  가드는 둘이다. **떠 둔 파일이 있으면 덮지 않는다** — 그 파일이 곧 「아직
  되돌리지 않았다」는 표시이고, `restore`가 성공하면 지운다. 그리고 픽스처의
  흔적(스냅샷·시상 페이즈)이 남아 있어도 거부한다.
*/
if (mode === "save") {
  if (existsSync(SNAP)) {
    throw new Error(
      `[hub-state] 아직 되돌리지 않은 상태가 있다(${SNAP}). 먼저 restore한다.`,
    );
  }
  const snapshots = await prisma.leaderboardSnapshot.count({
    where: { seasonId: season.id },
  });
  /*
    `HUB_SAVE_FORCE=1`은 이 가드를 넘는다 — 수연이 같은 dev DB에서 개발 바를
    눌러 둔 판이 곧 「지금 상태」일 때다. 되돌리면 그 판의 페이즈·진도는
    돌아오지만 집계 픽스처는 걷힌다(다시 누르면 된다).
  */
  if (
    process.env.HUB_SAVE_FORCE !== "1" &&
    (snapshots > 0 ||
      season.phase === SeasonPhase.awarded ||
      season.phase === SeasonPhase.archived)
  ) {
    throw new Error(
      `[hub-state] 픽스처가 켜진 상태다(페이즈 ${season.phase}, 스냅샷 ${snapshots}개). ` +
        "먼저 restore로 되돌린 뒤에 save한다.",
    );
  }
  const stages = await prisma.stage.findMany({
    where: { seasonId: season.id },
    select: { stageKey: true, opensAt: true, closesAt: true },
  });
  writeFileSync(
    SNAP,
    JSON.stringify(
      {
        team: TEAM,
        phase: season.phase,
        featureFlags: season.featureFlags,
        stages,
        entry: { id: entry.id, stage: entry.stage, status: entry.status },
        /* 픽스처가 「오늘」을 옮긴다(raceStage) — 떠 두고 되돌린다 */
        today: devToday()?.toISOString() ?? null,
        isSolo: entry.team?.isSolo ?? false,
        hostname: entry.hostname ?? null,
      },
      null,
      2,
    ),
  );
  console.log(`저장 → ${SNAP}`);
  console.log(
    `  ${TEAM}: 페이즈 ${season.phase}, 진도 ${entry.stage}, 2인팀 ${!entry.team?.isSolo}`,
  );
} else if (mode && HUB_PLANS[mode as HubKey]) {
  const key = mode as HubKey;
  const plan = HUB_PLANS[key];
  await setSandboxHub({ key, entryId: entry.id, seasonId: season.id });
  console.error(`${mode}: ${plan.label} — 페이즈 ${plan.phase}, 진도 ${plan.stage}`);
  console.log(await session());
} else if (mode === "restore") {
  const snap = JSON.parse(readFileSync(SNAP, "utf8")) as {
    phase: SeasonPhase;
    featureFlags: unknown;
    stages: { stageKey: string; opensAt: string | null; closesAt: string | null }[];
    entry: { id: string; stage: EntryStage; status: EntryStatus };
    today: string | null;
    isSolo: boolean;
    hostname: {
      deployStatus: DeployStatus;
      ownershipVerifiedAt: string | null;
    } | null;
  };

  /*
    ⚠️ **다음 시즌부터 재운다.** h17이 시즌 2를 모집 중으로 세워 두는데,
    그러면 그쪽이 「지금 시즌」이라(`getCurrentSeason`) 아래에서 시즌 1을
    아무리 되돌려도 화면이 안 돌아온다.
  */
  await sleepNextSeason(season.id);

  /* 픽스처가 만든 스냅샷·일별 지표·수상을 먼저 걷어낸다 */
  await setMetricsFixture({ seasonId: season.id, kind: "none" });

  /* 실격 판(h14)이 남긴 제재도 걷는다 — 헤더가 계속 붉은 띠를 문다 */
  await prisma.sanction.deleteMany({
    where: { entryId: snap.entry.id, detail: { startsWith: "[개발용]" } },
  });

  /*
    시안 목업 값도 걷는다 — `setMetricsFixture`가 모르는 것들이다.
    개발용으로 만든 것만 지운다(사전 신청 리드는 접두사, 판정은 문구).
  */
  await prisma.entryLead.deleteMany({
    where: { contactHash: { startsWith: "dev-lead-" } },
  });
  /* 개발용 판정 — h12의 것은 문구가 시안 그대로라 `aiReport`의 표시로 찾는다 */
  await prisma.judgment.deleteMany({
    where: {
      OR: [
        { feedback: { startsWith: "[개발용]" } },
        { aiReport: { path: ["dev"], equals: true } },
      ],
    },
  });
  await prisma.metricExtraDaily.deleteMany({
    where: { definition: { key: { in: ["weekly_active", "retention"] } } },
  });
  await prisma.metricDefinition.deleteMany({
    where: { key: { in: ["weekly_active", "retention"] } },
  });
  /* 「오늘」도 떠 둔 값으로 되돌린다. 누른 판 표시는 지운다 */
  setDevToday(snap.today ? new Date(snap.today) : null);
  setDevHubKey(null);

  await setSandboxStage({
    entryId: snap.entry.id,
    stage: snap.entry.stage,
    userId: leader,
  });
  await prisma.entry.update({
    where: { id: snap.entry.id },
    data: { status: snap.entry.status },
  });
  await prisma.team.update({
    where: { id: entry.teamId },
    data: { isSolo: snap.isSolo },
  });
  if (snap.hostname) {
    await prisma.hostname.updateMany({
      where: { entryId: snap.entry.id },
      data: {
        deployStatus: snap.hostname.deployStatus,
        ownershipVerifiedAt: snap.hostname.ownershipVerifiedAt
          ? new Date(snap.hostname.ownershipVerifiedAt)
          : null,
      },
    });
  }

  await prisma.$transaction([
    prisma.season.update({
      where: { id: season.id },
      data: { phase: snap.phase, featureFlags: snap.featureFlags as never },
    }),
    ...snap.stages.map((s) =>
      prisma.stage.updateMany({
        where: { seasonId: season.id, stageKey: s.stageKey as never },
        data: {
          opensAt: s.opensAt ? new Date(s.opensAt) : null,
          closesAt: s.closesAt ? new Date(s.closesAt) : null,
        },
      }),
    ),
  ]);
  /* 되돌렸으니 표시를 지운다 — 다음 `save`가 열린다 */
  rmSync(SNAP, { force: true });
  console.log(`되돌림: 페이즈 ${snap.phase}, 진도 ${snap.entry.stage}`);
} else {
  throw new Error("save · h1~h17 · restore 중 하나를 준다");
}

await prisma.$disconnect();
