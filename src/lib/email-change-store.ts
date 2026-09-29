import { Prisma } from "@/generated/prisma/client";
import {
  CODE_TTL_MIN,
  MAX_MISSES,
  MISS_PREFIX,
  PREFIX,
  RESEND_WAIT_SEC,
  checkNewEmail,
  cleanCode,
  codeHash,
  newCode,
  normalizeEmail,
  type EmailChangeFailure,
} from "@/lib/email-change";
import { sendEmailChangeCode } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

/*
  이메일 변경의 DB 절반. 규칙과 까닭은 email-change.ts 머리 주석.
*/

type Result = { ok: true } | { ok: false; code: EmailChangeFailure };

const pendingOf = (userId: string) => ({ identifier: { startsWith: `${PREFIX}${userId}:` } });

/** 새 주소로 코드를 보낸다. 앞서 받은 코드와 틀린 횟수는 지운다 */
export async function requestEmailChange(
  user: { id: string; email: string },
  raw: string,
  now = new Date(),
): Promise<Result & { email?: string }> {
  const bad = checkNewEmail(raw, user.email);
  if (bad) return { ok: false, code: bad };
  const email = normalizeEmail(raw);

  const owner = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (owner && owner.id !== user.id) return { ok: false, code: "TAKEN" };

  /* 방금 보낸 코드가 있으면 기다리게 한다. 만료 시각에서 거꾸로 발급 시각을 구한다 */
  const last = await prisma.verificationToken.findFirst({
    where: pendingOf(user.id),
    orderBy: { expires: "desc" },
    select: { expires: true },
  });
  if (last) {
    const issuedAt = last.expires.getTime() - CODE_TTL_MIN * 60_000;
    if (now.getTime() - issuedAt < RESEND_WAIT_SEC * 1000) return { ok: false, code: "TOO_SOON" };
  }

  const code = newCode();
  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: pendingOf(user.id) }),
    prisma.verificationToken.deleteMany({ where: { identifier: `${MISS_PREFIX}${user.id}` } }),
    prisma.verificationToken.create({
      data: {
        identifier: `${PREFIX}${user.id}:${email}`,
        token: codeHash(user.id, code),
        expires: new Date(now.getTime() + CODE_TTL_MIN * 60_000),
      },
    }),
  ]);

  await sendEmailChangeCode({ email, code, minutes: CODE_TTL_MIN });
  return { ok: true, email };
}

/** 코드가 맞으면 주소를 바꾸고 인증된 것으로 적는다 */
export async function confirmEmailChange(
  userId: string,
  raw: string,
  now = new Date(),
): Promise<Result> {
  const pending = await prisma.verificationToken.findFirst({
    where: { ...pendingOf(userId), expires: { gt: now } },
    select: { identifier: true, token: true },
  });
  if (!pending) return { ok: false, code: "NO_CODE" };

  const misses = await prisma.verificationToken.count({
    where: { identifier: `${MISS_PREFIX}${userId}` },
  });
  if (misses >= MAX_MISSES) return { ok: false, code: "LOCKED" };

  if (pending.token !== codeHash(userId, cleanCode(raw))) {
    /* 틀린 입력 한 번이 한 행. token 열이 unique라 무작위 값을 넣는다 */
    await prisma.verificationToken.create({
      data: {
        identifier: `${MISS_PREFIX}${userId}`,
        token: `${MISS_PREFIX}${crypto.randomUUID()}`,
        expires: new Date(now.getTime() + CODE_TTL_MIN * 60_000),
      },
    });
    return { ok: false, code: misses + 1 >= MAX_MISSES ? "LOCKED" : "WRONG_CODE" };
  }

  const email = pending.identifier.slice(`${PREFIX}${userId}:`.length);
  try {
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { email, emailVerifiedAt: now } }),
      prisma.verificationToken.deleteMany({ where: pendingOf(userId) }),
      prisma.verificationToken.deleteMany({ where: { identifier: `${MISS_PREFIX}${userId}` } }),
    ]);
  } catch (e) {
    /* 코드를 받는 사이 다른 계정이 그 주소를 가져갔다 */
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, code: "TAKEN" };
    }
    throw e;
  }
  return { ok: true };
}
