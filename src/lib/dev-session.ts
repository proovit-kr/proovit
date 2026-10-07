import { ConsentSource } from "@/generated/prisma/enums";
import { randomBytes } from "node:crypto";

import { cookies, headers } from "next/headers";

import { accountConsentRows, loadAccountConsentNeed } from "@/lib/account-consent";
import { prisma } from "@/lib/prisma";

/*
  개발 바의 「로그인」 줄 — 테스트 계정 하나로 로그인했다 치는 것.

  소셜 로그인 없이 시드의 「민재」(`minjae@demo.proovit.local`, 오늘의루틴
  팀장)로 들어간다. 시드의 수연팀은 make-demo-account.ts가 진짜 계정에 넘겨서
  (리틀포션) 데모 수연에게는 팀이 없다 — 시즌 1에서 가장 멀리 간(s4) 데모 팀의
  팀장이 민재다. 여러 사람을 오가는 줄이 아니다(2026-09-21 수연 결정 — 「계정 줄 따로
  둘 필요 없어. 목 계정 하나만 두고 로그인 칩 누르면 그 계정으로 로그인 됐다
  치고 싶은 거야」).

  지어내는 것은 **쿠키가 아니라 `sessions` 행**이다 — Auth.js가 소셜 콜백 뒤에
  만드는 것과 같은 행을 같은 자리에 만들므로, 그 뒤의 만료·무효화 판정은
  평소와 똑같이 돈다. 「비로그인」은 그 행을 지우고 쿠키를 뗀다 — 소셜로 들어온
  진짜 세션이 살아 있어도 같이 나간다(다시 들어오려면 소셜 로그인).

  ⚠️ `next/headers`를 쓰므로 **dev-sandbox.ts에 넣지 않는다.** 그쪽은
  대조 스크립트(lb-state.mts 등)가 node로 직접 불러서 Next 런타임 밖에서 돈다.

  ⚠️ 쿠키를 읽는 자리는 개발 바 안뿐이다. 루트 레이아웃에서 쿠키를 읽으면
  앱 전체의 정적 렌더가 꺼지는데, 개발 바는 운영에서 `checkDevSandbox()`에
  막혀 여기까지 오지 않는다(DevBar.tsx).
*/

/** 테스트 계정. 시드의 데모 팀 중 시즌 1에서 가장 멀리 간 팀(오늘의루틴, s4)의 팀장 */
export const TEST_ACCOUNT_EMAIL = "minjae@demo.proovit.local";

/*
  Auth.js v5의 기본 이름. https는 `__Secure-` 접두사가 붙고 **그 이름만 읽는다** —
  프리뷰 배포(https)에서 접두사 없이 심으면 로그인이 안 된 것처럼 보인다.
*/
const SESSION_COOKIE = "authjs.session-token";
const SECURE_SESSION_COOKIE = "__Secure-authjs.session-token";

const MONTH = 30 * 24 * 60 * 60;

/**
 * 운영자 테스트 계정 — 시드의 「운영」(admin 역할). 개발 바 「운영자」 칩이 이 계정으로
 * 들어가 운영 콘솔을 본다(2026-09-23 수연 — 「개발 바에 운영자 칩은 없는데 어케 봐?」).
 */
export const TEST_ADMIN_EMAIL = "admin@demo.proovit.local";

/** 테스트 계정으로 로그인 */
export async function loginAsTestAccount(): Promise<void> {
  await loginAs(TEST_ACCOUNT_EMAIL);
}

/** 운영자 테스트 계정으로 로그인 */
export async function loginAsTestAdmin(): Promise<void> {
  await loginAs(TEST_ADMIN_EMAIL);
}

async function loginAs(email: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) {
    throw new Error(`[dev] 테스트 계정(${email})이 없다 — npm run db:seed`);
  }

  await logout();

  /*
    계정 동의가 없거나 낡았으면 여기서 채운다 — 개발 바로 계정을 오갈 때마다 약관
    동의 모달이 뜨지 않게(2026-09-23 수연 지시). 모달이 쓰는 것과 같은 행을 쌓으므로
    판정(`loadAccountConsentNeed`)은 평소대로 돈다. 동의 모달 자체를 볼 때는 소셜로
    새로 들어오거나 대조 전용 계정(`consent-session.mts`)을 쓴다.
  */
  if ((await loadAccountConsentNeed(user.id)).needed) {
    await prisma.consent.createMany({
      data: accountConsentRows({ userId: user.id, marketing: false, ageConfirmed: true, ageSource: ConsentSource.dev_fixture, ipHash: null, userAgent: "dev-bar" }),
    });
  }

  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      sessionToken: token,
      userId: user.id,
      expires: new Date(Date.now() + MONTH * 1000),
    },
  });

  const proto = (await headers()).get("x-forwarded-proto") ?? "http";
  const secure = proto === "https";
  const jar = await cookies();
  jar.set(secure ? SECURE_SESSION_COOKIE : SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: MONTH,
  });
}

/** 비로그인 — 세션 행을 지우고 쿠키를 뗀다 */
export async function logout(): Promise<void> {
  const jar = await cookies();
  for (const name of [SESSION_COOKIE, SECURE_SESSION_COOKIE]) {
    const token = jar.get(name)?.value;
    if (!token) continue;
    await prisma.session.deleteMany({ where: { sessionToken: token } });
    jar.delete(name);
  }
}
