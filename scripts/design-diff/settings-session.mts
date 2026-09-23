/*
  settings.mjs가 여는 대조 전용 계정의 세션을 만든다.

    node --env-file=.env.development.local --import tsx scripts/design-diff/settings-session.mts
  → 세션 토큰 한 줄. 세션은 1시간 산다.

  시안은 카카오로 가입한 사람(「카카오 연결됨」)이고 메일 켜짐·알림톡 꺼짐이다.
  dev DB의 다른 계정은 누가 실제로 로그인해 쓰는 계정일 수 있어 소셜 연결을
  건드리지 않는다 — 이 계정만 돌릴 때마다 시안 값으로 되돌린다.

  계정 동의를 채워 둔다. 없으면 동의 모달이 화면을 덮는다(consent-session.mts의 반대).

  ⚠️ **반드시 .env.development.local로 돌린다.** `.env`는 운영 DB다.
*/
import { accountConsentRows } from "../../src/lib/account-consent";
import { checkDevSandbox } from "../../src/lib/dev-sandbox";
import { prisma } from "../../src/lib/prisma";

const check = checkDevSandbox();
if (!check.ok) throw new Error(`[settings-session] ${check.reason}`);

const EMAIL = "settings-diff@example.com";

const user = await prisma.user.upsert({
  where: { email: EMAIL },
  update: { notifyEmail: true, notifyAlimtalk: false },
  create: {
    email: EMAIL,
    name: "대조용",
    nickname: "대조용",
    onboardedAt: new Date(),
    oauthAccounts: { create: { provider: "kakao", providerAccountId: "settings-diff" } },
  },
  select: { id: true },
});

await prisma.consent.deleteMany({ where: { userId: user.id, entryId: null } });
await prisma.consent.createMany({
  data: accountConsentRows({ userId: user.id, marketing: false, ipHash: null, userAgent: null }),
});

const token = crypto.randomUUID();
await prisma.session.create({
  data: { sessionToken: token, userId: user.id, expires: new Date(Date.now() + 60 * 60 * 1000) },
});

console.log(token);
await prisma.$disconnect();
