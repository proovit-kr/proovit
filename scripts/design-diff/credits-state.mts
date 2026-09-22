/*
  혜택과 크레딧 대조용 dev DB 상태 스위치 — 시안 일곱 판(pend · locked · sched ·
  build · race · tester · end).

    node --env-file=.env.development.local --import tsx scripts/design-diff/credits-state.mts save
    node --env-file=.env.development.local --import tsx scripts/design-diff/credits-state.mts build
    node --env-file=.env.development.local --import tsx scripts/design-diff/credits-state.mts restore

  판 이름은 상태를 만든 뒤 **세션 토큰 한 줄**을 찍는다 — `credits.mjs`가 그것을
  쿠키로 심어 그 팀의 혜택 화면을 연다(submit-state.mts와 같은 방식).

  판을 만드는 것은 개발 바의 「크레딧」 줄과 같은 함수(`setSandboxCredits`)다. 그
  함수가 허브 판을 통째로 앉히고 시즌의 카드까지 바꾸므로 save·restore는
  submit-state.mts만큼 넓게 뜬다 — 거기에 스폰서·카드·코드·발급 기록·시상을 더한다.

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
import { type CreditsPane } from "../../src/lib/credits";
import {
  checkDevSandbox,
  setMetricsFixture,
  setSandboxCredits,
  sleepNextSeason,
  unparkTeam,
} from "../../src/lib/dev-sandbox";
import { devToday, setDevToday } from "../../src/lib/dev-clock";
import { setDevHubKey } from "../../src/lib/dev-hub";
import { prisma } from "../../src/lib/prisma";

const check = checkDevSandbox();
if (!check.ok) throw new Error(`[credits-state] ${check.reason}`);

const DIR = join(tmpdir(), "proovit-design-diff");
mkdirSync(DIR, { recursive: true });
const SNAP = join(DIR, "credits-state.json");

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
if (!leader) throw new Error(`[credits-state] ${TEAM} 팀장을 못 찾았다`);

type Json = Prisma.InputJsonValue;
type Snap = {
  phase: SeasonPhase;
  featureFlags: unknown;
  stages: { stageKey: string; opensAt: string | null; closesAt: string | null }[];
  entry: { id: string; stage: EntryStage; status: EntryStatus };
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
  sponsors: { id: string; name: string; mark: string | null }[];
  offers: Record<string, unknown>[];
  codes: Record<string, unknown>[];
  claims: Record<string, unknown>[];
  awards: Record<string, unknown>[];
};

const PANES: CreditsPane[] = ["pend", "locked", "sched", "build", "race", "tester", "end"];
const mode = process.argv[2];

/* Date → ISO 문자열로 떠 두고, 되돌릴 때 이름이 `At`·`Date`·`Until`로 끝나면 Date로 */
const plain = (row: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]),
  );
const revive = (row: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k,
      typeof v === "string" && /(At|Date|Until)$/.test(k) ? new Date(v) : v,
    ]),
  );

if (mode === "save") {
  if (existsSync(SNAP)) {
    throw new Error(
      `[credits-state] 아직 되돌리지 않은 상태가 있다(${SNAP}). 먼저 restore한다.`,
    );
  }
  const [stages, submissions, sponsors, offers, claims, awards] = await Promise.all([
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
    prisma.sponsor.findMany({ select: { id: true, name: true, mark: true } }),
    prisma.creditOffer.findMany({ where: { seasonId: season.id } }),
    prisma.creditClaim.findMany({ where: { entryId: entry.id } }),
    prisma.award.findMany({ where: { entryId: entry.id } }),
  ]);
  const codes = await prisma.creditCode.findMany({
    where: { offerId: { in: offers.map((o) => o.id) } },
  });
  const snap: Snap = {
    phase: season.phase,
    featureFlags: season.featureFlags,
    stages: stages.map((s) => ({
      stageKey: s.stageKey,
      opensAt: s.opensAt?.toISOString() ?? null,
      closesAt: s.closesAt?.toISOString() ?? null,
    })),
    entry: { id: entry.id, stage: entry.stage, status: entry.status },
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
    sponsors,
    offers: offers.map(plain),
    codes: codes.map(plain),
    claims: claims.map(plain),
    awards: awards.map((a) => plain({ ...a, amount: a.amount === null ? null : String(a.amount) })),
  };
  writeFileSync(SNAP, JSON.stringify(snap, null, 2));
  console.log(`저장 → ${SNAP}`);
  console.log(
    `  ${TEAM}: 페이즈 ${season.phase}, 진도 ${entry.stage}, 카드 ${offers.length}장, 발급 ${claims.length}건`,
  );
} else if (PANES.includes(mode as CreditsPane)) {
  await setSandboxCredits({ entryId: entry.id, pane: mode as CreditsPane });
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
  await setMetricsFixture({ seasonId: season.id, kind: "none" });
  await prisma.entryLead.deleteMany({
    where: { entryId: snap.entry.id, contactHash: { startsWith: "dev-lead-" } },
  });
  await prisma.sanction.deleteMany({
    where: { entryId: snap.entry.id, detail: { contains: "개발 바가 만든" } },
  });
  setDevToday(snap.today ? new Date(snap.today) : null);
  setDevHubKey(null);

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

  /* 카드·코드·발급·시상 — 발급(→코드·카드)부터 지우고 카드부터 되살린다 */
  await prisma.creditClaim.deleteMany({ where: { entryId: snap.entry.id } });
  await prisma.creditCode.deleteMany({ where: { offer: { seasonId: season.id } } });
  await prisma.creditOffer.deleteMany({ where: { seasonId: season.id } });
  for (const o of snap.offers) {
    await prisma.creditOffer.create({
      data: revive(o) as unknown as Prisma.CreditOfferUncheckedCreateInput,
    });
  }
  for (const c of snap.codes) {
    await prisma.creditCode.create({
      data: revive(c) as unknown as Prisma.CreditCodeUncheckedCreateInput,
    });
  }
  for (const c of snap.claims) {
    await prisma.creditClaim.create({
      data: revive(c) as unknown as Prisma.CreditClaimUncheckedCreateInput,
    });
  }
  await prisma.award.deleteMany({ where: { entryId: snap.entry.id } });
  for (const a of snap.awards) {
    const row = revive(a) as Record<string, unknown>;
    await prisma.award.create({
      data: {
        ...row,
        amount: row.amount === null ? null : BigInt(row.amount as string),
      } as unknown as Prisma.AwardUncheckedCreateInput,
    });
  }
  /* 세터가 만든 스폰서는 지우고, 있던 것은 표시 글자만 되돌린다 */
  await prisma.sponsor.deleteMany({
    where: { id: { notIn: snap.sponsors.map((s) => s.id) } },
  });
  for (const s of snap.sponsors) {
    await prisma.sponsor.updateMany({ where: { id: s.id }, data: { mark: s.mark } });
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
    `되돌림: 페이즈 ${snap.phase}, 진도 ${snap.entry.stage}, 카드 ${snap.offers.length}장, 발급 ${snap.claims.length}건`,
  );
} else {
  throw new Error(`save · ${PANES.join(" · ")} · restore 중 하나를 준다`);
}

await prisma.$disconnect();
