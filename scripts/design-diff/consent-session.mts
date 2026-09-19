/*
  auth.mjs의 ② 「콜백 뒤 동의 모달」을 재려면 **계정 동의가 없는 로그인 세션**이
  있어야 한다. dev DB의 다른 계정은 픽스처가 동의를 채워 두므로 대조 전용 계정을
  따로 둔다.

    node --env-file=.env.development.local --import tsx scripts/design-diff/consent-session.mts
  → 세션 토큰 한 줄. 세션은 1시간 산다.

  돌릴 때마다 이 계정의 계정 동의(entryId null)를 지운다 — 한 번 「동의하고
  시작하기」를 눌러 봤어도 다시 모달이 뜨게. 지우는 것은 이 계정 것뿐이다.

  ⚠️ **반드시 .env.development.local로 돌린다.** `.env`는 운영 DB다.
  checkDevSandbox()가 운영이면 던진다(csp-session.mts와 같은 가드).

  이메일은 example.com이라 시안의 `yoon***@gmail.com`과 글자가 다르다 —
  auth.mjs가 글자 대조에서 그 칸만 가린다.
*/
import { prisma } from "../../src/lib/prisma";
import { checkDevSandbox } from "../../src/lib/dev-sandbox";

const check = checkDevSandbox();
if (!check.ok) throw new Error(`[consent-session] ${check.reason}`);

const EMAIL = "consent-diff@example.com";

const user = await prisma.user.upsert({
  where: { email: EMAIL },
  /* 온보딩이 끝난 계정이어야 동의 모달만 뜬다 */
  update: {},
  create: {
    email: EMAIL,
    name: "대조용",
    nickname: "대조용",
    onboardedAt: new Date(),
    /* 시안 모달은 Google 계정이다 */
    oauthAccounts: { create: { provider: "google", providerAccountId: "consent-diff" } },
  },
  select: { id: true },
});

await prisma.consent.deleteMany({ where: { userId: user.id, entryId: null } });

const token = crypto.randomUUID();
await prisma.session.create({
  data: { sessionToken: token, userId: user.id, expires: new Date(Date.now() + 60 * 60 * 1000) },
});

console.log(token);
await prisma.$disconnect();
