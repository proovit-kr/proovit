/*
  알림센터 대조용 dev DB 상태 스위치 — 시안 ① 목록(list)·② 빈 상태(empty).

    node --env-file=.env.development.local --import tsx scripts/design-diff/noti-state.mts save
    node --env-file=.env.development.local --import tsx scripts/design-diff/noti-state.mts list|empty
    node --env-file=.env.development.local --import tsx scripts/design-diff/noti-state.mts restore

  판 이름은 상태를 만든 뒤 **세션 토큰 한 줄**을 찍는다 — `noti.mjs`가 그것을
  쿠키로 심어 그 팀장의 알림센터를 연다(hub-state.mts와 같은 방식).

  판을 만드는 것은 개발 바의 「알림센터」 줄과 같은 함수(`setSandboxNotifications`)다.
  그 함수가 허브 h6를 통째로 앉히므로 save·restore는 내 지표(metrics-state.mts)만큼
  넓게 뜨고, 거기에 **이 팀 팀원 전부의 알림** 행을 더한다.

  ⚠️ **반드시 .env.development.local로 돌린다.** `.env`는 운영 DB다.
*/
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  DeployStatus,
  EntryStage,
  EntryStatus,
  JudgmentResult,
  SeasonPhase,
  StageKey,
  SubmissionStatus,
} from "../../src/generated/prisma/enums";
import type { Prisma } from "../../src/generated/prisma/client";
import {
  checkDevSandbox,
  setMetricsFixture,
  setSandboxNotifications,
  sleepNextSeason,
  unparkTeam,
  type NotiPane,
  restoreRaceStarts,
  saveRaceStarts,
  type SavedRaceStart,
} from "../../src/lib/dev-sandbox";
import { devToday, setDevToday } from "../../src/lib/dev-clock";
import { devHubKey, setDevHubKey } from "../../src/lib/dev-hub";
import { prisma } from "../../src/lib/prisma";

const check = checkDevSandbox();
if (!check.ok) throw new Error(`[noti-state] ${check.reason}`);

const DIR = join(tmpdir(), "proovit-design-diff");
mkdirSync(DIR, { recursive: true });
const SNAP = join(DIR, "noti-state.json");

const SLUG = process.env.HUB_SLUG ?? "season-1";
/* 시안 목업의 팀 */
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
    hostname: { select: { deployStatus: true, ownershipVerifiedAt: true } },
  },
});

await unparkTeam(entry.teamId);

const leader = (
  await prisma.teamMember.findFirst({
    where: { teamId: entry.teamId, role: "leader" },
    select: { userId: true },
  })
)?.userId;
if (!leader) throw new Error(`[noti-state] ${TEAM} 팀장을 못 찾았다`);

type Json = Prisma.InputJsonValue;
type Snap = {
  phase: SeasonPhase;
  featureFlags: unknown;
  /* 픽스처·스테이지 줄이 레이스 시작을 심는다(2026-09-26 팀별 집계). 옛 save에는 없다 */
  raceStarts?: SavedRaceStart[];
  stages: { stageKey: string; opensAt: string | null; closesAt: string | null }[];
  entry: { id: string; stage: EntryStage; status: EntryStatus };
  today: string | null;
  /** 개발 바가 마지막으로 누른 허브 판 — 검토 중인 판의 표시를 지우지 않는다 */
  hubKey: string | null;
  isSolo: boolean;
  hostname: { deployStatus: DeployStatus; ownershipVerifiedAt: string | null } | null;
  submissions: {
    stageKey: StageKey;
    week: number;
    status: SubmissionStatus;
    payload: unknown;
    evidenceUrls: string[];
    revisionDueAt: string | null;
    submittedBy: string | null;
    submittedAt: string | null;
    judgments: {
      result: JudgmentResult;
      feedback: string | null;
      judgedBy: string | null;
      judgedAt: string;
      aiReport: unknown;
    }[];
  }[];
  daily: Record<string, unknown>[];
  channels: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
};

const PANES: NotiPane[] = ["list", "empty"];

const users = (
  await prisma.teamMember.findMany({ where: { teamId: entry.teamId }, select: { userId: true } })
).map((m) => m.userId);
const mode = process.argv[2];

/* Date·BigInt → 문자열로 떠 두고, 되돌릴 때 이름으로 되살린다 */
const plain = (row: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k,
      v instanceof Date ? v.toISOString() : typeof v === "bigint" ? String(v) : v,
    ]),
  );
const revive = (row: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k,
      typeof v === "string" && /(At|Date)$/.test(k)
        ? new Date(v)
        : k === "revenue" && typeof v === "string"
          ? BigInt(v)
          : v,
    ]),
  );

if (mode === "save") {
  if (existsSync(SNAP)) {
    throw new Error(
      `[noti-state] 아직 되돌리지 않은 상태가 있다(${SNAP}). 먼저 restore한다.`,
    );
  }
  const snapshots = await prisma.leaderboardSnapshot.count({
    where: { seasonId: season.id },
  });
  if (process.env.HUB_SAVE_FORCE !== "1" && snapshots > 0) {
    throw new Error(
      `[noti-state] 픽스처가 켜진 상태다(스냅샷 ${snapshots}개). 먼저 restore로 되돌린 뒤에 save한다.`,
    );
  }
  const [stages, submissions, daily, channels, notifications] = await Promise.all([
    prisma.stage.findMany({
      where: { seasonId: season.id },
      select: { stageKey: true, opensAt: true, closesAt: true },
    }),
    prisma.submission.findMany({
      where: { entryId: entry.id },
      select: {
        stageKey: true,
        week: true,
        status: true,
        payload: true,
        evidenceUrls: true,
        revisionDueAt: true,
        submittedBy: true,
        submittedAt: true,
        judgments: {
          select: { result: true, feedback: true, judgedBy: true, judgedAt: true, aiReport: true },
        },
      },
    }),
    prisma.metricDaily.findMany({ where: { entryId: entry.id } }),
    prisma.metricChannelDaily.findMany({ where: { entryId: entry.id } }),
    prisma.notification.findMany({ where: { userId: { in: users } } }),
  ]);
  const snap: Snap = {
    phase: season.phase,
    featureFlags: season.featureFlags,
    raceStarts: await saveRaceStarts(season.id),
    stages: stages.map((s) => ({
      stageKey: s.stageKey,
      opensAt: s.opensAt?.toISOString() ?? null,
      closesAt: s.closesAt?.toISOString() ?? null,
    })),
    entry: { id: entry.id, stage: entry.stage, status: entry.status },
    today: devToday()?.toISOString() ?? null,
    hubKey: devHubKey(),
    isSolo: entry.team?.isSolo ?? false,
    hostname: entry.hostname
      ? {
          deployStatus: entry.hostname.deployStatus,
          ownershipVerifiedAt: entry.hostname.ownershipVerifiedAt?.toISOString() ?? null,
        }
      : null,
    submissions: submissions.map((s) => ({
      ...s,
      revisionDueAt: s.revisionDueAt?.toISOString() ?? null,
      submittedAt: s.submittedAt?.toISOString() ?? null,
      judgments: s.judgments.map((j) => ({ ...j, judgedAt: j.judgedAt.toISOString() })),
    })),
    daily: daily.map(plain),
    channels: channels.map(plain),
    notifications: notifications.map(plain),
  };
  writeFileSync(SNAP, JSON.stringify(snap, null, 2));
  console.log(`저장 → ${SNAP}`);
  console.log(
    `  ${TEAM}: 페이즈 ${season.phase}, 진도 ${entry.stage}, 일별 집계 ${daily.length}행, 채널 ${channels.length}행, 알림 ${notifications.length}행`,
  );
} else if (PANES.includes(mode as NotiPane)) {
  await setSandboxNotifications({ entryId: entry.id, pane: mode as NotiPane });
  const token = crypto.randomUUID();
  await prisma.session.create({
    data: {
      sessionToken: token,
      userId: leader,
      expires: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  console.error(`${mode}: ${TEAM}`);
  console.log(token);
} else if (mode === "restore") {
  const snap = JSON.parse(readFileSync(SNAP, "utf8")) as Snap;

  await sleepNextSeason(season.id);
  /* 픽스처가 시즌 전 팀에 심은 집계·스냅샷을 걷는다 — 이 팀 것은 아래서 되살린다 */
  await setMetricsFixture({ seasonId: season.id, kind: "none" });
  /* 픽스처가 심은 레이스 시작을 떠 둔 값으로 — 「none」도 s4 달력 시작일을 심는다 */
  await restoreRaceStarts(season.id, snap.raceStarts);
  await prisma.sanction.deleteMany({
    where: { entryId: snap.entry.id, detail: { contains: "개발 바가 만든" } },
  });
  setDevToday(snap.today ? new Date(snap.today) : null);
  setDevHubKey(snap.hubKey ?? null);

  /* 제출물·판정은 떠 둔 그대로 — 판정을 먼저 지운다(외래키) */
  await prisma.judgment.deleteMany({ where: { submission: { entryId: snap.entry.id } } });
  await prisma.submission.deleteMany({ where: { entryId: snap.entry.id } });
  for (const s of snap.submissions) {
    await prisma.submission.create({
      data: {
        entryId: snap.entry.id,
        stageKey: s.stageKey,
        week: s.week,
        status: s.status,
        payload: s.payload as Json,
        evidenceUrls: s.evidenceUrls,
        revisionDueAt: s.revisionDueAt ? new Date(s.revisionDueAt) : null,
        submittedBy: s.submittedBy,
        submittedAt: s.submittedAt ? new Date(s.submittedAt) : null,
        judgments: {
          create: s.judgments.map((j) => ({
            result: j.result,
            feedback: j.feedback,
            judgedBy: j.judgedBy,
            judgedAt: new Date(j.judgedAt),
            aiReport: j.aiReport as Json,
          })),
        },
      },
    });
  }

  await prisma.notification.deleteMany({ where: { userId: { in: users } } });
  for (const n of snap.notifications) {
    await prisma.notification.create({
      data: revive(n) as unknown as Prisma.NotificationUncheckedCreateInput,
    });
  }

  await prisma.metricChannelDaily.deleteMany({ where: { entryId: snap.entry.id } });
  await prisma.metricDaily.deleteMany({ where: { entryId: snap.entry.id } });
  for (const d of snap.daily) {
    await prisma.metricDaily.create({
      data: revive(d) as unknown as Prisma.MetricDailyUncheckedCreateInput,
    });
  }
  for (const c of snap.channels) {
    await prisma.metricChannelDaily.create({
      data: revive(c) as unknown as Prisma.MetricChannelDailyUncheckedCreateInput,
    });
  }

  await prisma.entry.update({
    where: { id: snap.entry.id },
    data: { stage: snap.entry.stage, status: snap.entry.status },
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
  rmSync(SNAP, { force: true });
  console.log(
    `되돌림: 페이즈 ${snap.phase}, 진도 ${snap.entry.stage}, 일별 집계 ${snap.daily.length}행, 알림 ${snap.notifications.length}행`,
  );
} else {
  throw new Error(`save · ${PANES.join(" · ")} · restore 중 하나를 준다`);
}

await prisma.$disconnect();
