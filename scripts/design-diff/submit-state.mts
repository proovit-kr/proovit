/*
  스테이지 제출 대조용 dev DB 상태 스위치 — 시안 다섯 탭을 두 판으로 만든다.

    node --env-file=.env.development.local --import tsx scripts/design-diff/submit-state.mts save
    node --env-file=.env.development.local --import tsx scripts/design-diff/submit-state.mts s3
    node --env-file=.env.development.local --import tsx scripts/design-diff/submit-state.mts restore

    s3  s1 제출됨 · s2 통과(잠김) · s3 임시저장 · s4 주간 반복 · s5 예정 — 시안의 s1·s2·s3·s5 판
    s4  s4 1주차 작성 중
    s4w2  s4를 두 주로 늘려 1주차 제출됨 · 2주차 작성 중 — 시안의 s4 판
    s5  s5 열림, 토글 켜진 초안 — 시안의 s5 판

  판 이름은 상태를 만든 뒤 **세션 토큰 한 줄**을 찍는다 — `submit.mjs`가 그것을
  쿠키로 심어 그 팀의 제출 화면을 연다(payment-state.mts와 같은 방식).

  판을 만드는 것은 개발 바의 「제출」 줄과 같은 함수(`setSandboxSubmit`)다. 그 함수가
  진도(h5·h6)를 통째로 앉히므로 save·restore는 hub-state.mts만큼 넓게 뜬다 —
  거기에 이 팀의 제출물·판정을 그대로 떠서 되돌린다.

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
import { evidenceStorage } from "../../src/lib/evidence-storage";
import {
  checkDevSandbox,
  setMetricsFixture,
  setSandboxSubmit,
  sleepNextSeason,
  unparkTeam,
  type SubmitPane,
} from "../../src/lib/dev-sandbox";
import { devToday, setDevToday } from "../../src/lib/dev-clock";
import { setDevHubKey } from "../../src/lib/dev-hub";
import { prisma } from "../../src/lib/prisma";

const check = checkDevSandbox();
if (!check.ok) throw new Error(`[submit-state] ${check.reason}`);

const DIR = join(tmpdir(), "proovit-design-diff");
mkdirSync(DIR, { recursive: true });
const SNAP = join(DIR, "submit-state.json");

const SLUG = process.env.HUB_SLUG ?? "season-1";
/* 시안 목업의 팀. 주소도 little-potion.proovit.kr라 s2·s3의 주소 글자까지 같다 */
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
    chargeType: true,
    serviceUrl: true,
    team: { select: { isSolo: true } },
    hostname: { select: { deployStatus: true, ownershipVerifiedAt: true } },
  },
});

/* 보관 중이면 팀장이 보관 계정으로 읽힌다(hub-state.mts 주석) */
await unparkTeam(entry.teamId);

const leader = (
  await prisma.teamMember.findFirst({
    where: { teamId: entry.teamId, role: "leader" },
    select: { userId: true },
  })
)?.userId;
if (!leader) throw new Error(`[submit-state] ${TEAM} 팀장을 못 찾았다`);

type Snap = {
  phase: SeasonPhase;
  featureFlags: unknown;
  stages: { stageKey: string; opensAt: string | null; closesAt: string | null }[];
  entry: {
    id: string;
    stage: EntryStage;
    status: EntryStatus;
    chargeType: string;
    serviceUrl: string | null;
  };
  today: string | null;
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
};

const PANES: SubmitPane[] = ["s3", "s4", "s4w2", "s5"];
const mode = process.argv[2];

if (mode === "save") {
  if (existsSync(SNAP)) {
    throw new Error(
      `[submit-state] 아직 되돌리지 않은 상태가 있다(${SNAP}). 먼저 restore한다.`,
    );
  }
  const [stages, submissions] = await Promise.all([
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
          select: {
            result: true,
            feedback: true,
            judgedBy: true,
            judgedAt: true,
            aiReport: true,
          },
        },
      },
    }),
  ]);
  const snap: Snap = {
    phase: season.phase,
    featureFlags: season.featureFlags,
    stages: stages.map((s) => ({
      stageKey: s.stageKey,
      opensAt: s.opensAt?.toISOString() ?? null,
      closesAt: s.closesAt?.toISOString() ?? null,
    })),
    entry: {
      id: entry.id,
      stage: entry.stage,
      status: entry.status,
      chargeType: entry.chargeType,
      serviceUrl: entry.serviceUrl,
    },
    today: devToday()?.toISOString() ?? null,
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
  };
  writeFileSync(SNAP, JSON.stringify(snap, null, 2));
  console.log(`저장 → ${SNAP}`);
  console.log(
    `  ${TEAM}: 페이즈 ${season.phase}, 진도 ${entry.stage}, 제출물 ${submissions.length}건`,
  );
} else if (PANES.includes(mode as SubmitPane)) {
  await setSandboxSubmit({ entryId: entry.id, pane: mode as SubmitPane });
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

  /* 다음 시즌부터 재운다 — hub-state.mts와 같은 순서 */
  await sleepNextSeason(season.id);
  /* 픽스처가 만든 스냅샷·일별 지표·수상을 걷어낸다(직접 심은 방문자 행도 여기 든다) */
  await setMetricsFixture({ seasonId: season.id, kind: "none" });
  await prisma.entryLead.deleteMany({
    where: { entryId: snap.entry.id, contactHash: { startsWith: "dev-lead-" } },
  });
  setDevToday(snap.today ? new Date(snap.today) : null);
  setDevHubKey(null);

  /* 제출물·판정은 떠 둔 그대로 되돌린다 — 판정을 먼저 지운다(외래키) */
  await prisma.judgment.deleteMany({ where: { submission: { entryId: snap.entry.id } } });
  await prisma.submission.deleteMany({ where: { entryId: snap.entry.id } });
  for (const s of snap.submissions) {
    await prisma.submission.create({
      data: {
        entryId: snap.entry.id,
        stageKey: s.stageKey,
        week: s.week,
        status: s.status,
        payload: s.payload as Prisma.InputJsonValue,
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
            aiReport: j.aiReport as Prisma.InputJsonValue,
          })),
        },
      },
    });
  }
  /* 개발 바가 심은 파일 — 스냅에 없는 키는 저장소에서 걷어낸다 */
  const storage = evidenceStorage();
  if (storage) {
    const keep = new Set(snap.submissions.flatMap((s) => s.evidenceUrls));
    const stray = (await storage.list(`${snap.entry.id}/`)).filter((key) => !keep.has(key));
    await storage.remove(stray);
  }

  await prisma.entry.update({
    where: { id: snap.entry.id },
    data: {
      stage: snap.entry.stage,
      status: snap.entry.status,
      chargeType: snap.entry.chargeType as never,
      serviceUrl: snap.entry.serviceUrl,
    },
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
    `되돌림: 페이즈 ${snap.phase}, 진도 ${snap.entry.stage}, 제출물 ${snap.submissions.length}건`,
  );
} else {
  throw new Error("save · s3 · s4 · restore 중 하나를 준다");
}

await prisma.$disconnect();
