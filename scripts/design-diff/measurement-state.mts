/*
  측정 연동 대조용 dev DB 상태 스위치 — 시안 세 판(wait · ok · fail).

    node --env-file=.env.development.local --import tsx scripts/design-diff/measurement-state.mts save
    node --env-file=.env.development.local --import tsx scripts/design-diff/measurement-state.mts ok
    node --env-file=.env.development.local --import tsx scripts/design-diff/measurement-state.mts restore

  `wait`·`ok`·`fail`은 상태를 만든 뒤 **세션 토큰 한 줄**을 찍는다 — `measurement.mjs`가
  그것을 쿠키로 심어 그 팀의 측정 연동 화면을 연다(hub-state.mts와 같은 방식).

  판을 만드는 것은 개발 바의 「측정 연동」 줄과 같은 함수(`setSandboxMeasurement`)다.
  대조는 폭마다 다시 돌리는 일이라 손으로 누르면 중간에 어긋난 상태로 재게 된다.

  ⚠️ **반드시 .env.development.local로 돌린다.** `.env`는 운영 DB다.
*/
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DeployStatus } from "../../src/generated/prisma/enums";
import { checkDevSandbox, setSandboxMeasurement } from "../../src/lib/dev-sandbox";
import { prisma } from "../../src/lib/prisma";

const check = checkDevSandbox();
if (!check.ok) throw new Error(`[measurement-state] ${check.reason}`);

const DIR = join(tmpdir(), "proovit-design-diff");
mkdirSync(DIR, { recursive: true });
const SNAP = join(DIR, "measurement-state.json");

const SLUG = process.env.HUB_SLUG ?? "season-1";
/* 시안 목업의 팀. 주소도 little-potion.proovit.kr라 keybox 글자까지 같다 */
const TEAM = process.env.HUB_TEAM ?? "리틀포션";

const season = await prisma.season.findUniqueOrThrow({
  where: { slug: SLUG },
  select: { id: true },
});
const entry = await prisma.entry.findFirstOrThrow({
  where: { seasonId: season.id, team: { name: TEAM } },
  select: {
    id: true,
    teamId: true,
    hostname: {
      select: {
        deployStatus: true,
        ownershipVerifiedAt: true,
        lastCheckedAt: true,
        originUrl: true,
      },
    },
  },
});

const leader = (
  await prisma.teamMember.findFirst({
    where: { teamId: entry.teamId, role: "leader" },
    select: { userId: true },
  })
)?.userId;
if (!leader) throw new Error(`[measurement-state] ${TEAM} 팀장을 못 찾았다`);

type Snap = {
  entryId: string;
  hostname: {
    deployStatus: DeployStatus;
    ownershipVerifiedAt: string | null;
    lastCheckedAt: string | null;
    originUrl: string | null;
  } | null;
};

const mode = process.argv[2];

if (mode === "save") {
  if (existsSync(SNAP)) {
    throw new Error(
      `[measurement-state] 아직 되돌리지 않은 상태가 있다(${SNAP}). 먼저 restore한다.`,
    );
  }
  const snap: Snap = {
    entryId: entry.id,
    hostname: entry.hostname
      ? {
          deployStatus: entry.hostname.deployStatus,
          ownershipVerifiedAt: entry.hostname.ownershipVerifiedAt?.toISOString() ?? null,
          lastCheckedAt: entry.hostname.lastCheckedAt?.toISOString() ?? null,
          originUrl: entry.hostname.originUrl,
        }
      : null,
  };
  writeFileSync(SNAP, JSON.stringify(snap, null, 2));
  console.log(`저장 → ${SNAP}`);
  console.log(
    `  ${TEAM}: ${entry.hostname ? `${entry.hostname.deployStatus}, 검증 ${entry.hostname.ownershipVerifiedAt ? "됨" : "전"}` : "행 없음"}`,
  );
} else if (mode === "wait" || mode === "ok" || mode === "fail") {
  await setSandboxMeasurement({ entryId: entry.id, state: mode });
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
  if (snap.hostname) {
    await prisma.hostname.updateMany({
      where: { entryId: snap.entryId },
      data: {
        deployStatus: snap.hostname.deployStatus,
        ownershipVerifiedAt: snap.hostname.ownershipVerifiedAt
          ? new Date(snap.hostname.ownershipVerifiedAt)
          : null,
        lastCheckedAt: snap.hostname.lastCheckedAt
          ? new Date(snap.hostname.lastCheckedAt)
          : null,
        originUrl: snap.hostname.originUrl,
      },
    });
  } else {
    /* 원래 행이 없던 팀이다 — 판을 만들며 생긴 행을 지운다 */
    await prisma.hostname.deleteMany({ where: { entryId: snap.entryId } });
  }
  rmSync(SNAP, { force: true });
  console.log(`되돌림: ${snap.hostname ? snap.hostname.deployStatus : "행 없음"}`);
} else {
  throw new Error("save · wait · ok · fail · restore 중 하나를 준다");
}

await prisma.$disconnect();
