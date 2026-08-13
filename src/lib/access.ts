import { notFound, redirect } from "next/navigation";

import { MemberRole } from "@/generated/prisma/client";
import {
  canAccess,
  type AccessContext,
  type AccessResult,
  type RouteKey,
} from "@/lib/access-policy";
import { apiFail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { parseFeatureFlags } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import { getCurrentSeason } from "@/lib/season";

/*
  판정 표와 순수 함수는 access-policy.ts에 있다(그쪽 머리 주석 참조).
  바깥에서는 이 파일 하나만 import하면 되도록 여기서 다시 내보낸다 —
  "접근 판정은 한 자리"(CLAUDE.md §3)를 파일이 둘이어도 지키는 방법이다.
*/
export * from "@/lib/access-policy";

/*
  서버 측 접근 판정의 유일한 자리다 (06 §5.2 · CLAUDE.md §3).
  서버 컴포넌트와 Route Handler가 **같은 함수**를 부른다 — 프론트에 판정을
  흩뿌리면 미통과 팀에게 화면이 순간 노출된다.

  두 층이다.
  ① 세션 관문(`requireUser`·`requireOnboardedUser`) — 로그인·온보딩. 리다이렉트한다.
  ② `canAccess()` — 시즌 페이즈 × 참가 진도 × 생존 상태 × 기능 플래그 4축 판정.
     순수 함수라 던지지도 리다이렉트하지도 않고 판정만 돌려준다.

  ②를 순수 함수로 두는 이유: 서버 컴포넌트는 404를 부르고 Route Handler는 JSON
  봉투를 내려야 하는데, 판정 안에서 응답까지 만들면 둘 중 한쪽을 못 쓴다.
  판정과 응답을 갈라두면 같은 표를 화면과 API가 함께 쓴다.

  근거 문서는 **PLN3 화면정의서 v0.1(8/13)** 이다 — 2장 카탈로그 30행과
  3장 phase×stage 분기표. 06 §5.1 가드표는 4주·2게이트 시절이라 쓰지 않는다.
  응답 규약: 권한 없음 403 / 없거나 플래그 off 404 / 단계 불일치 409 STAGE_LOCKED.
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

// ═════════════════════════════════════════════════════════════
// 판정에 필요한 것을 DB에서 모으고, 결과를 응답으로 바꾸는 다리
// ═════════════════════════════════════════════════════════════

/**
 * 판정 컨텍스트를 한 번에 읽는다. 화면마다 조각조각 조회하면 같은 판정에
 * 다른 재료가 들어가고, 그게 곧 화면마다 다른 결론이 된다.
 *
 * 비로그인·미참가도 정상 입력이다 — 공개 화면이 같은 함수를 쓰기 때문이다.
 */
export async function loadAccessContext(): Promise<AccessContext> {
  const [user, season] = await Promise.all([
    getSessionUser(),
    getCurrentSeason(),
  ]);

  const seasonCtx = season
    ? { phase: season.phase, flags: parseFeatureFlags(season.featureFlags) }
    : null;

  if (!user || !season) {
    return { user: null, season: seasonCtx, entry: null };
  }

  const [roles, membership] = await Promise.all([
    prisma.userRole.findMany({
      where: {
        userId: user.id,
        /* 전역 역할(season_id = null)과 이번 시즌 역할을 함께 본다 */
        OR: [{ seasonId: null }, { seasonId: season.id }],
      },
      select: { role: { select: { key: true } } },
    }),
    prisma.teamMember.findFirst({
      where: {
        userId: user.id,
        team: { entries: { some: { seasonId: season.id } } },
      },
      select: {
        role: true,
        team: {
          select: {
            entries: {
              where: { seasonId: season.id },
              select: { stage: true, status: true },
              take: 1,
            },
          },
        },
      },
    }),
  ]);

  const entry = membership?.team.entries[0] ?? null;

  return {
    user: {
      id: user.id,
      onboarded: user.onboardedAt !== null,
      isAdmin: roles.some((r) => r.role.key === "admin"),
    },
    season: seasonCtx,
    entry: entry
      ? {
          stage: entry.stage,
          status: entry.status,
          isLeader: membership?.role === MemberRole.leader,
        }
      : null,
  };
}

/**
 * 서버 컴포넌트용. 막히면 화면을 그리지 않고 끊는다.
 *
 * 401은 로그인으로 보내고, 나머지는 404로 덮는다 — 화면에서는 403과 404를
 * 가르는 실익이 없고(둘 다 "못 본다"), 404 쪽이 존재를 덜 흘린다.
 * 409는 화면이 직접 안내를 그려야 하는 경우가 많아 결과를 그대로 돌려준다.
 */
export function assertAccess(
  route: RouteKey,
  ctx: AccessContext,
  next?: string,
): AccessResult {
  const result = canAccess(route, ctx);
  if (result.ok) return result;

  if (result.code === "UNAUTHENTICATED") {
    const target = safeNext(next);
    redirect(
      target ? `/login?callbackUrl=${encodeURIComponent(target)}` : "/login",
    );
  }
  if (result.code === "FORBIDDEN" || result.code === "NOT_FOUND") notFound();

  /* STAGE_LOCKED · ENTRY_INACTIVE — 화면이 사유를 그린다 */
  return result;
}

/** Route Handler용. 판정 실패를 그대로 API 봉투로 바꾼다 */
export function accessFailure(result: AccessResult): Response | null {
  if (result.ok) return null;
  return apiFail(result.code, result.message, {
    details: result.details as Record<string, unknown> | undefined,
  });
}
