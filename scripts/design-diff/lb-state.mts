/*
  리더보드 대조용 dev DB 상태 스위치.

    node --env-file=.env.development.local --import tsx scripts/design-diff/lb-state.mts save
    node --env-file=.env.development.local --import tsx scripts/design-diff/lb-state.mts race
    node --env-file=.env.development.local --import tsx scripts/design-diff/lb-state.mts final
    node --env-file=.env.development.local --import tsx scripts/design-diff/lb-state.mts restore

  개발 바로도 같은 일을 할 수 있지만(페이즈 줄 + 집계 줄), 대조는 폭마다 다시
  돌리는 일이라 손으로 누르면 중간에 어긋난 상태로 재게 된다.

  ⚠️ **집계 픽스처가 스테이지 날짜를 옮긴다**(dev-sandbox.ts `fixtureStageDates`).
  `save`가 지금의 페이즈·플래그·스테이지 날짜를 먼저 적어 두고 `restore`가
  그대로 되돌린다. 지금 dev DB에 들어 있는 것은 수연의 임시 일정이다.

  ⚠️ **반드시 .env.development.local로 돌린다.** `.env`는 운영 DB다
  (consent-session.mts와 같은 가드).
*/
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { SeasonPhase } from "../../src/generated/prisma/enums";
import { prisma } from "../../src/lib/prisma";
import {
  checkDevSandbox,
  setMetricsFixture,
  setSandboxPhase,
} from "../../src/lib/dev-sandbox";

const check = checkDevSandbox();
if (!check.ok) throw new Error(`[lb-state] ${check.reason}`);

const DIR = join(tmpdir(), "proovit-design-diff");
mkdirSync(DIR, { recursive: true });
const SNAP = join(DIR, "lb-state.json");

const SLUG = process.env.LB_SLUG ?? "season-1";
const season = await prisma.season.findUniqueOrThrow({
  where: { slug: SLUG },
  select: { id: true, phase: true, featureFlags: true },
});

const mode = process.argv[2];

if (mode === "save") {
  const stages = await prisma.stage.findMany({
    where: { seasonId: season.id },
    select: { stageKey: true, opensAt: true, closesAt: true },
  });
  writeFileSync(
    SNAP,
    JSON.stringify(
      { phase: season.phase, featureFlags: season.featureFlags, stages },
      null,
      2,
    ),
  );
  console.log(`저장 → ${SNAP}`);
  console.log(`  페이즈 ${season.phase}, 스테이지 ${stages.length}개`);
} else if (mode === "race" || mode === "final") {
  await setSandboxPhase({
    seasonId: season.id,
    phase: mode === "race" ? SeasonPhase.racing : SeasonPhase.awarded,
  });
  /* 픽스처가 리더보드 플래그를 켜고 스테이지 날짜도 옮긴다 */
  await setMetricsFixture({ seasonId: season.id, kind: mode });
  console.log(`${mode}로 바꿈`);
} else if (mode === "restore") {
  const snap = JSON.parse(readFileSync(SNAP, "utf8")) as {
    phase: SeasonPhase;
    featureFlags: unknown;
    stages: {
      stageKey: string;
      opensAt: string | null;
      closesAt: string | null;
    }[];
  };
  /* 픽스처가 만든 스냅샷·일별 지표·수상을 먼저 걷어낸다 */
  await setMetricsFixture({ seasonId: season.id, kind: "none" });
  await prisma.$transaction([
    prisma.season.update({
      where: { id: season.id },
      data: {
        phase: snap.phase,
        featureFlags: snap.featureFlags as never,
      },
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
  console.log(`되돌림: 페이즈 ${snap.phase}, 스테이지 ${snap.stages.length}개`);
} else {
  throw new Error("save · race · final · restore 중 하나를 준다");
}

await prisma.$disconnect();
