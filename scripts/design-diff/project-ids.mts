/*
  참가작 상세를 대조할 두 엔트리의 id를 찾아 준다. 화면 어디에도
  `/projects/:id`로 가는 링크가 없어서(리더보드 표는 서비스 주소로 나간다)
  주소를 손으로 만들 방법이 이것뿐이다.

    node --env-file=.env.development.local --import tsx scripts/design-diff/project-ids.mts
  → { "live": "<entryId>", "undeployed": "<entryId>" } JSON 한 줄.

  · live       시안 목업의 팀(리틀포션). 팀명·소개·주소·지표가 시안과 같아서
               글자 폭까지 대조할 수 있다.
  · undeployed hostname이 없는 팀. `lb-state.mts`의 `fakeHostnames()`가
               마지막 한 팀(혼밥연구소)만 그렇게 남긴다.

  ⚠️ **반드시 .env.development.local로 돌린다.** `.env`는 운영 DB다.
*/
import { EntryStatus } from "../../src/generated/prisma/enums";
import { prisma } from "../../src/lib/prisma";
import { checkDevSandbox } from "../../src/lib/dev-sandbox";

const check = checkDevSandbox();
if (!check.ok) throw new Error(`[project-ids] ${check.reason}`);

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
    team: { select: { name: true } },
    hostname: { select: { deployStatus: true, ownershipVerifiedAt: true } },
  },
});

const live = entries.find((e) => e.team.name === "리틀포션");
/*
  화면의 판정(race.ts `notDeployed`)은 주소 확인에 더해 레이스 전(s3 미제출)도
  미배포로 본다(2026-09-26). 여기서는 주소 쪽만 본다 — 대조 ②는 주소가 없는 팀이라
  레이스 시작과 무관하게 미배포이고, 집계 픽스처가 모든 팀에 레이스 시작을 심는다.
*/
const undeployed = entries.find(
  (e) => e.hostname === null || e.hostname.ownershipVerifiedAt === null,
);

if (!live || !undeployed) {
  throw new Error(
    `대조할 엔트리가 없다: 리틀포션=${!!live} 미배포=${!!undeployed}. ` +
      "spec-teams.mts와 lb-state.mts race를 먼저 돌린다",
  );
}

console.log(
  JSON.stringify({
    live: live.id,
    undeployed: undeployed.id,
    undeployedTeam: undeployed.team.name,
  }),
);
await prisma.$disconnect();
