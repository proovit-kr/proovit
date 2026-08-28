/*
  시연용 계정 만들기. **개발용이다.**

  로그인이 구글 OAuth 하나뿐이라 DB에 계정을 새로 넣어도 들어올 수가 없다
  (`@demo.proovit.local` 데모 계정 6개가 그래서 로그인이 안 된다). 그래서
  이 스크립트는 계정을 만드는 게 아니라 **이미 구글로 한 번 들어온 계정에
  운영자 역할과 참가 기록을 붙인다.**

  붙이는 것 둘:
    1. 전역 admin 역할 → /admin/* 10개 화면이 열린다
    2. 기존 데모 팀의 팀장 자리 → /dashboard/* 화면이 열린다.
       팀을 새로 만들지 않고 자리를 넘겨받는 이유는, 새 팀은 제출물이 없어
       제출 폼·내 지표·참가작 상세가 전부 빈 화면이 되기 때문이다.

  ⚠️ 반드시 dev 브랜치에서만 돌린다:

    set -a; source .env.development.local; set +a; npx tsx scripts/make-demo-account.ts

  이메일·팀을 바꾸려면:

    ... npx tsx scripts/make-demo-account.ts --email=someone@gmail.com --team=민재팀

  되돌리기는 맨 끝에 출력되는 명령을 쓴다.
*/
import { MemberRole } from "../src/generated/prisma/enums";
import { prisma } from "../src/lib/prisma";

/* 브랜치 ID가 아니라 엔드포인트 호스트로 본다 — Neon은 둘을 다르게 부른다 */
const DEV_ENDPOINT = "ep-floral-truth-azjbh0bs";
const host = new URL(process.env.DATABASE_URL ?? "").host;
if (!host.startsWith(DEV_ENDPOINT)) {
  console.error(`중단: dev 브랜치가 아니다 (host=${host})`);
  console.error("set -a; source .env.development.local; set +a 로 실어서 부를 것");
  process.exit(1);
}

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const EMAIL = arg("email", "suyeonjin2000@gmail.com");
const TEAM = arg("team", "수연팀");

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, email: true, nickname: true, onboardedAt: true },
  });
  if (!user) {
    console.error(`중단: ${EMAIL} 계정이 없다.`);
    console.error("먼저 그 구글 계정으로 /login에서 한 번 로그인할 것 — 그래야 행이 생긴다.");
    process.exit(1);
  }
  if (!user.onboardedAt) {
    console.warn(`주의: 온보딩 미완이라 로그인하면 /onboarding으로 먼저 간다 (${EMAIL})`);
  }

  /* ── 1. 전역 admin 역할 ─────────────────────────────── */
  const adminRole = await prisma.role.findUnique({ where: { key: "admin" } });
  if (!adminRole) {
    console.error("중단: roles에 admin이 없다. npm run db:seed를 먼저 돌릴 것");
    process.exit(1);
  }
  /*
    upsert를 못 쓴다 — 유니크가 (userId, roleId, seasonId)인데 seasonId가 null이고
    Postgres는 유니크 인덱스에서 NULL을 서로 다른 값으로 본다. 조회해서 없을 때만 만든다.
  */
  const hasAdmin = await prisma.userRole.findFirst({
    where: { userId: user.id, roleId: adminRole.id, seasonId: null },
    select: { id: true },
  });
  if (hasAdmin) {
    console.log("admin 역할: 이미 있음");
  } else {
    await prisma.userRole.create({
      data: { userId: user.id, roleId: adminRole.id, seasonId: null },
    });
    console.log("admin 역할: 부여함 (전역)");
  }

  /* ── 2. 팀장 자리 넘겨받기 ──────────────────────────── */
  const team = await prisma.team.findFirst({
    where: { name: TEAM },
    select: {
      id: true,
      name: true,
      members: { select: { id: true, userId: true, role: true } },
      entries: {
        select: {
          id: true,
          stage: true,
          status: true,
          serviceUrl: true,
          _count: { select: { submissions: true } },
        },
      },
    },
  });
  if (!team) {
    console.error(`중단: ${TEAM} 팀이 없다. npx tsx scripts/... 로 데모 데이터를 먼저 넣을 것`);
    process.exit(1);
  }

  const leader = team.members.find((m) => m.role === MemberRole.leader);
  if (!leader) {
    console.error(`중단: ${TEAM}에 팀장 행이 없다`);
    process.exit(1);
  }

  let revert = "";
  if (leader.userId === user.id) {
    console.log(`팀장 자리: 이미 ${TEAM} 팀장임`);
  } else if (team.members.some((m) => m.userId === user.id)) {
    /* 유니크 (teamId, userId)에 걸린다 — 이미 팀원이면 그 행을 팀장으로 올리고
       기존 팀장을 내린다. 「팀당 팀장 1명」 부분 유니크 때문에 순서가 중요하다 */
    const mine = team.members.find((m) => m.userId === user.id)!;
    await prisma.$transaction([
      prisma.teamMember.update({ where: { id: leader.id }, data: { role: MemberRole.member } }),
      prisma.teamMember.update({ where: { id: mine.id }, data: { role: MemberRole.leader } }),
    ]);
    console.log(`팀장 자리: ${TEAM}에서 팀원 → 팀장으로 올림`);
    revert = `UPDATE team_members SET role='member' WHERE id='${mine.id}'; UPDATE team_members SET role='leader' WHERE id='${leader.id}';`;
  } else {
    const before = leader.userId;
    await prisma.teamMember.update({ where: { id: leader.id }, data: { userId: user.id } });
    console.log(`팀장 자리: ${TEAM} 팀장을 ${EMAIL}로 넘김`);
    revert = `UPDATE team_members SET user_id='${before}' WHERE id='${leader.id}';`;
  }

  const entry = team.entries[0];
  console.log("");
  console.log("─".repeat(60));
  console.log(`시연 계정  ${EMAIL} (${user.nickname})`);
  console.log(`팀        ${team.name}`);
  if (entry) {
    console.log(`참가 기록  stage=${entry.stage} · status=${entry.status} · 제출 ${entry._count.submissions}건`);
    console.log(`배포 주소  ${entry.serviceUrl ?? "(없음)"}`);
    console.log(`참가작     /projects/${entry.id}`);
  } else {
    console.log("참가 기록  없음 — /apply부터 해야 대시보드가 열린다");
  }
  console.log(`운영자     /admin 열림`);
  console.log("─".repeat(60));
  if (revert) {
    console.log("되돌리려면 dev DB에서:");
    console.log(`  ${revert}`);
  }

  await prisma.$disconnect();
}

void main();
