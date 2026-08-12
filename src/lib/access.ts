import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/*
  서버 측 접근 판정의 유일한 자리다 (06 §5.2 · CLAUDE.md §3).
  서버 컴포넌트와 Route Handler가 **같은 함수**를 부른다 — 프론트에 판정을
  흩뿌리면 미통과 팀에게 화면이 순간 노출된다.

  지금 있는 것은 두 관문뿐이다: 로그인했는가 · 온보딩을 마쳤는가.
  시즌 phase와 참가팀 stage 조합 판정(canAccess 본체)은 8/17 회의에서
  화면 규모 정본이 정해진 뒤 이 파일에 얹는다. 응답 규약은 그때도 같다 —
  권한 없음 403 / 없거나 플래그 off 404 / 단계 불일치 409 STAGE_LOCKED.
*/

/** 게이트가 판정에 쓰는 최소 필드. 넓히려면 여기부터 넓힌다. */
const GATE_FIELDS = {
  id: true,
  email: true,
  name: true,
  nickname: true,
  onboardedAt: true,
  emailVerifiedAt: true,
} as const;

export type GateUser = {
  id: string;
  email: string;
  name: string;
  nickname: string;
  onboardedAt: Date | null;
  emailVerifiedAt: Date | null;
};

/*
  ⚠️ 되돌아갈 주소는 반드시 걸러서 쓴다.

  ?next= 를 그대로 redirect에 넘기면 오픈 리다이렉트가 된다 — 공격자가
  `/login?callbackUrl=https://evil.example` 링크를 뿌리면 우리 도메인을
  거쳐 남의 사이트로 튕긴다. 참가자에게 상금·결제가 걸린 서비스라
  로그인 흐름을 흉내 내는 피싱의 발판이 되기 쉽다.

  통과 조건: `/`로 시작하고, `//`(프로토콜 상대 주소)와 `/\`가 아니어야 한다.
*/
export function safeNext(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}

/** 로그인 여부만 본다. 비로그인이면 null. */
export async function getSessionUser(): Promise<GateUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  /*
    세션에 담긴 값을 믿지 않고 매번 DB를 읽는다. DB 세션을 고른 이유가
    "실격 판정이 곧바로 무효화여야 한다"인데, 세션 쿠키의 사본을 신뢰하면
    그 이유가 무너진다. 조회는 PK 한 건이라 비용이 거의 없다.
  */
  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: GATE_FIELDS,
  });
}

/** 로그인 필수. 아니면 /login으로 보내고 끝난 뒤 next로 되돌린다. */
export async function requireUser(next?: string): Promise<GateUser> {
  const user = await getSessionUser();
  if (user) return user;

  const target = safeNext(next);
  redirect(
    target ? `/login?callbackUrl=${encodeURIComponent(target)}` : "/login",
  );
}

/**
 * 로그인 + 온보딩 완료 필수.
 * 참가 신청·대시보드·심사 콘솔처럼 사람 이름이 드러나는 화면은 전부 이걸 쓴다.
 */
export async function requireOnboardedUser(next?: string): Promise<GateUser> {
  const user = await requireUser(next);
  if (user.onboardedAt) return user;

  const target = safeNext(next);
  redirect(
    target ? `/onboarding?next=${encodeURIComponent(target)}` : "/onboarding",
  );
}
