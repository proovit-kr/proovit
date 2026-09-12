/*
  csp.mjs가 로그인 뒤 화면을 돌 수 있게 세션을 만든다. dev-sandbox의
  impersonate()와 같은 일이지만 DevBar를 거치지 않는다 — 프로덕션 빌드에서는
  DevBar가 안 뜨는데, CSP는 프로덕션 빌드로 재야 하기 때문이다.

    node --env-file=.env.development.local --import tsx scripts/design-diff/csp-session.mts
  → { leader, admin, entryId, seasonSlug } JSON 한 줄. 세션은 1시간 산다.

  ⚠️ **반드시 .env.development.local로 돌린다.** `.env`는 운영 DB다. 아래
  checkDevSandbox()가 엔드포인트 호스트를 보고 운영이면 던지므로 실수해도
  세션 행이 운영에 생기지는 않는다 — 하지만 조회는 그 전에 나간다.
*/
import { prisma } from "../../src/lib/prisma";
import { checkDevSandbox } from "../../src/lib/dev-sandbox";

const check = checkDevSandbox();
if (!check.ok) throw new Error(`[csp-session] ${check.reason}`);

async function session(userId: string) {
  const token = crypto.randomUUID();
  await prisma.session.create({
    data: { sessionToken: token, userId, expires: new Date(Date.now() + 60 * 60 * 1000) },
  });
  return token;
}

const leader = await prisma.teamMember.findFirst({
  where: { role: "leader" },
  select: { userId: true, team: { select: { entries: { select: { id: true }, take: 1 } } } },
});
const admin = await prisma.userRole.findFirst({
  where: { role: { key: "admin" } },
  select: { userId: true },
});
const season = await prisma.season.findFirst({ select: { slug: true }, orderBy: { createdAt: "desc" } });

if (!leader || !admin) throw new Error(`dev 데이터가 없다: leader=${!!leader} admin=${!!admin}`);

console.log(JSON.stringify({
  leader: await session(leader.userId),
  admin: await session(admin.userId),
  entryId: leader.team.entries[0]?.id ?? null,
  seasonSlug: season?.slug ?? null,
}));
await prisma.$disconnect();
