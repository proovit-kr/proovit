/*
  dev DB의 참가팀을 **시안 리더보드의 12팀**(시안 3533행 `TEAMS`)으로 맞춘다.

    node --env-file=.env.development.local --import tsx scripts/design-diff/spec-teams.mts

  왜 필요한가 — 팀명·참가작·주소가 시안과 다르면 그 칸들의 **폭을 대조할 수
  없다.** 지금까지 `leaderboard.mjs`가 `tm`·`tm small`·`usr score`의 width를
  빼고 재던 것이 그래서다. 이름을 맞추면 그 자리도 값으로 볼 수 있다.

  무엇을 하나
    · 기존 참가팀을 시안 순서대로 이름·참가작·주소를 바꾼다
    · 모자라는 만큼 dev 계정과 팀을 새로 만든다
    · `entry.createdAt`을 순위 순서로 다시 쓴다 — 픽스처가 그 순서로 값을
      매기기 때문이다(`setMetricsFixture`의 `orderBy: createdAt asc`)
    · 주소가 없는 팀(로그인 계정이 손으로 만든 것)을 **뒤로 민다.** 기존 팀이
      시안 12보다 적으면 그 팀도 중간 자리를 받고 모자라는 만큼 새로 만들어진다 —
      어느 자리를 받든 참가팀으로 남으므로 개발 바의 「참가팀」 줄은 그대로 돈다.

  ⚠️ **아무것도 지우지 않는다.** 이름만 바꾸므로 팀·참가·제출물·동의가 모두
  그대로 남는다. 바꾸기 전 이름을 찍어 두니 되돌리려면 그 값을 쓴다.

  ⚠️ **반드시 .env.development.local로 돌린다.** `.env`는 운영 DB다.
  숫자는 `setMetricsFixture`가 따로 넣는다 — 이 스크립트는 이름만 맡는다.
*/
import { EntryStatus, MemberRole } from "../../src/generated/prisma/enums";
import { prisma } from "../../src/lib/prisma";
import { checkDevSandbox, SPEC_TEAMS } from "../../src/lib/dev-sandbox";

const check = checkDevSandbox();
if (!check.ok) throw new Error(`[spec-teams] ${check.reason}`);

const SLUG = process.env.LB_SLUG ?? "season-1";
const season = await prisma.season.findUniqueOrThrow({
  where: { slug: SLUG },
  select: { id: true },
});

const entries = await prisma.entry.findMany({
  where: { seasonId: season.id, status: EntryStatus.active },
  orderBy: { createdAt: "asc" },
  select: {
    id: true,
    teamId: true,
    serviceUrl: true,
    team: { select: { name: true } },
  },
});

/*
  주소가 없는 팀을 맨 끝으로 보낸다. dev DB에서 그런 팀은 로그인 계정이
  손으로 만든 것이고, 시안의 마지막 자리도 미배포다.
*/
const ordered = [
  ...entries.filter((e) => e.serviceUrl),
  ...entries.filter((e) => !e.serviceUrl),
];

console.log(`기존 참가팀 ${ordered.length}개 → 시안 ${SPEC_TEAMS.length}팀`);
console.log("바꾸기 전 이름(되돌릴 때 쓴다):");
for (const e of ordered) console.log(`  ${e.team.name} — ${e.serviceUrl ?? "(주소 없음)"}`);

/* 순위 순서를 createdAt으로 못박는다. 1분 간격이면 정렬이 흔들리지 않는다 */
const base = Date.now() - SPEC_TEAMS.length * 60_000;
const at = (i: number) => new Date(base + i * 60_000);

for (const [i, spec] of SPEC_TEAMS.entries()) {
  const existing = ordered[i];
  const serviceUrl = `https://${spec.host}.proovit.kr`;

  if (existing) {
    await prisma.$transaction([
      prisma.team.update({
        where: { id: existing.teamId },
        data: { name: spec.team },
      }),
      prisma.entry.update({
        where: { id: existing.id },
        data: {
          ideaTitle: spec.idea,
          serviceUrl,
          createdAt: at(i),
        },
      }),
    ]);
    console.log(`  ${String(i + 1).padStart(2, "0")} ${spec.team} ← ${existing.team.name}`);
    continue;
  }

  /*
    모자라는 팀은 새로 만든다. 계정이 있어야 팀장 자리가 채워지고, 그게
    없으면 리더보드 밖의 화면(참가작 상세·팀 관리)이 빈 팀을 만난다.
  */
  const user = await prisma.user.upsert({
    where: { email: `spec-${spec.host}@example.com` },
    update: {},
    create: {
      email: `spec-${spec.host}@example.com`,
      name: spec.team,
      nickname: spec.team,
      onboardedAt: new Date(),
    },
    select: { id: true },
  });

  const team = await prisma.team.create({
    data: {
      name: spec.team,
      isSolo: true,
      members: { create: { userId: user.id, role: MemberRole.leader } },
    },
    select: { id: true },
  });

  await prisma.entry.create({
    data: {
      seasonId: season.id,
      teamId: team.id,
      ideaTitle: spec.idea,
      serviceUrl,
      status: EntryStatus.active,
      appliedAt: at(i),
      createdAt: at(i),
    },
  });
  console.log(`  ${String(i + 1).padStart(2, "0")} ${spec.team} (새로 만듦)`);
}

/* 시안에 없는 나머지 팀은 건드리지 않는다 — 있으면 순위 뒤에 그대로 붙는다 */
const extra = ordered.length - SPEC_TEAMS.length;
if (extra > 0) console.log(`⚠️ 시안보다 ${extra}팀 많다. 뒤쪽 팀은 그대로 뒀다`);

console.log("\n숫자는 개발 바의 집계 줄이나 lb-state.mts가 넣는다");
await prisma.$disconnect();
