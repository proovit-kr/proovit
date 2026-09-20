/*
  시즌 상세 대조용 dev DB 상태 스위치.

    node --env-file=.env.development.local --import tsx scripts/design-diff/season-state.mts save
    node --env-file=.env.development.local --import tsx scripts/design-diff/season-state.mts pre
    node --env-file=.env.development.local --import tsx scripts/design-diff/season-state.mts recruit
    node --env-file=.env.development.local --import tsx scripts/design-diff/season-state.mts racing
    node --env-file=.env.development.local --import tsx scripts/design-diff/season-state.mts restore

  시안은 상태 바 버튼으로 `data-state`를 바꾸지만 우리는 **시즌 페이즈**가
  그 셋을 만든다. 개발 바의 페이즈 줄로도 되지만 대조는 폭마다 다시 도는
  일이라 손으로 누르면 중간에 어긋난 상태로 재게 된다(lb-state.mts와 같은 이유).

  ③만 `setMetricsFixture`를 같이 부른다. 그래야 둘이 생긴다 —
    ① 리더보드 플래그가 켜져 히어로 CTA 「리더보드 보기」가 나온다.
    ② s4가 이틀 전 열려 **지금 도는 스테이지**가 된다(시안 ③의 라임 카드).
  지금 dev DB의 임시 일정(10.12~11.17)으로는 오늘이 든 스테이지가 없어서
  ③의 핵심인 그 카드를 아예 못 잰다.

  ⚠️ `restore`를 빠뜨리면 다음 사람이 픽스처를 정본으로 착각한다. 리더보드
  플래그는 s4 전까지 꺼 두는 것이 기본값이다.

  ⚠️ **반드시 .env.development.local로 돌린다.** `.env`는 운영 DB다
  (lb-state.mts와 같은 가드).
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
if (!check.ok) throw new Error(`[season-state] ${check.reason}`);

const DIR = join(tmpdir(), "proovit-design-diff");
mkdirSync(DIR, { recursive: true });
const SNAP = join(DIR, "season-state.json");

const SLUG = process.env.SEASON_SLUG ?? "season-1";
const season = await prisma.season.findUniqueOrThrow({
  where: { slug: SLUG },
  select: { id: true, phase: true, featureFlags: true },
});

const PHASE: Record<string, SeasonPhase> = {
  pre: SeasonPhase.pre_apply,
  recruit: SeasonPhase.recruiting,
  racing: SeasonPhase.racing,
};

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
} else if (mode in PHASE) {
  await setSandboxPhase({ seasonId: season.id, phase: PHASE[mode] });
  /* ③만 — 플래그를 켜고 s4를 지금 도는 스테이지로 만든다 */
  if (mode === "racing") {
    await setMetricsFixture({ seasonId: season.id, kind: "race" });
  }
  console.log(`${mode}(${PHASE[mode]})로 바꿈`);
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
  /* 픽스처가 만든 스냅샷·일별 지표를 먼저 걷어낸다 */
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
  throw new Error("save · pre · recruit · racing · restore 중 하나를 준다");
}

await prisma.$disconnect();
