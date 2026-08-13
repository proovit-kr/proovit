import { cache } from "react";

import { notFound, redirect } from "next/navigation";

import {
  DepositStatus,
  DeployStatus,
  MemberRole,
  type EntryStage,
  type EntryStatus,
  type SeasonPhase,
} from "@/generated/prisma/client";
import {
  canAccess,
  type AccessContext,
  type AccessResult,
  type OnboardingProgress,
  type RouteKey,
} from "@/lib/access-policy";
import { apiFail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { parseFeatureFlags, type FeatureFlags } from "@/lib/feature-flags";
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
 * 로그인한 사람에 대해 화면·API가 알아야 할 전부.
 *
 * `AccessContext`(판정용)보다 넓다 — 대시보드는 판정만으로 못 그린다.
 * 팀 이름·진도·온보딩 진척이 함께 있어야 "지금 무엇을 해야 하는지"가 나온다.
 */
export type ViewerState = {
  user: {
    id: string;
    nickname: string;
    onboarded: boolean;
    roles: string[];
  } | null;
  season: {
    slug: string;
    title: string;
    phase: SeasonPhase;
    flags: FeatureFlags;
  } | null;
  team: { id: string; name: string; isLeader: boolean } | null;
  entry: {
    id: string;
    stage: EntryStage;
    status: EntryStatus;
    isTester: boolean;
  } | null;
  onboarding: OnboardingProgress;
};

const EMPTY_ONBOARDING: OnboardingProgress = {
  teamReady: false,
  measurementReady: false,
  depositReady: false,
};

/**
 * 판정·렌더에 필요한 것을 **한 번에** 읽는다. 화면마다 조각조각 조회하면 같은
 * 판정에 다른 재료가 들어가고, 그게 곧 화면마다 다른 결론이 된다.
 *
 * 비로그인·미참가도 정상 입력이다 — 공개 화면이 같은 함수를 쓴다.
 *
 * ⚠️ 비로그인이면 쿼리가 시즌 하나로 끝난다. 랜딩의 관전 트래픽이 대부분
 * 비로그인이라 이 단락이 중요하다(`/api/v1/me`가 쿠키부터 보는 것과 같은 이유).
 */
export const loadViewerState = cache(
  async function loadViewerState(): Promise<ViewerState> {
    const [user, season] = await Promise.all([
      getSessionUser(),
      getCurrentSeason(),
    ]);

    const seasonState = season
      ? {
          slug: season.slug,
          title: season.title,
          phase: season.phase,
          flags: parseFeatureFlags(season.featureFlags),
        }
      : null;

    if (!user || !season) {
      return {
        user: user
          ? {
              id: user.id,
              nickname: user.nickname,
              onboarded: user.onboardedAt !== null,
              roles: [],
            }
          : null,
        season: seasonState,
        team: null,
        entry: null,
        onboarding: EMPTY_ONBOARDING,
      };
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
              id: true,
              name: true,
              isSolo: true,
              _count: { select: { members: true } },
              entries: {
                where: { seasonId: season.id },
                select: {
                  id: true,
                  stage: true,
                  status: true,
                  isTester: true,
                  /* 온보딩의 나머지 절반. 검증까지 끝나야 배포 완료로 친다 */
                  hostname: {
                    select: { deployStatus: true, ownershipVerifiedAt: true },
                  },
                  deposit: { select: { status: true } },
                },
                take: 1,
              },
            },
          },
        },
      }),
    ]);

    const team = membership?.team ?? null;
    const entry = team?.entries[0] ?? null;

    return {
      user: {
        id: user.id,
        nickname: user.nickname,
        onboarded: user.onboardedAt !== null,
        roles: roles.map((r) => r.role.key),
      },
      season: seasonState,
      team: team
        ? {
            id: team.id,
            name: team.name,
            isLeader: membership?.role === MemberRole.leader,
          }
        : null,
      entry: entry
        ? {
            id: entry.id,
            stage: entry.stage,
            status: entry.status,
            isTester: entry.isTester,
          }
        : null,
      onboarding: {
        /*
        ⚠️ 가정이다 — PLN3·PLN7 어디에도 "팀 구성 완료"의 정의가 없다.
        1인 팀은 신청만으로 끝나고, 2인 팀은 초대가 수락돼야 끝난다고 봤다.
        초대를 보내고 수락 전인 팀을 완료로 치면 온보딩 체크리스트가
        할 일이 남았는데도 사라진다. 8/17에 확인할 것.
      */
        teamReady: team ? team.isSolo || team._count.members >= 2 : false,
        measurementReady:
          entry?.hostname?.deployStatus === DeployStatus.active &&
          entry.hostname.ownershipVerifiedAt !== null,
        depositReady: entry?.deposit?.status === DepositStatus.paid,
      },
    };
  },
);

/** 판정에 필요한 만큼만 잘라낸다. canAccess는 이 좁은 모양만 안다 */
export function toAccessContext(viewer: ViewerState): AccessContext {
  return {
    user: viewer.user
      ? {
          id: viewer.user.id,
          onboarded: viewer.user.onboarded,
          isAdmin: viewer.user.roles.includes("admin"),
        }
      : null,
    season: viewer.season
      ? { phase: viewer.season.phase, flags: viewer.season.flags }
      : null,
    entry:
      viewer.entry && viewer.team
        ? {
            stage: viewer.entry.stage,
            status: viewer.entry.status,
            isLeader: viewer.team.isLeader,
          }
        : null,
  };
}

/** 한 번 읽어 판정 컨텍스트만 필요할 때 */
export async function loadAccessContext(): Promise<AccessContext> {
  return toAccessContext(await loadViewerState());
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

/**
 * 서버 컴포넌트의 한 줄 관문.
 *
 * 화면마다 `loadViewerState` → `toAccessContext` → `assertAccess` 세 줄을 쓰면
 * 그중 하나를 빠뜨린 화면이 반드시 생긴다. 스물여덟 개를 한꺼번에 까는 지금은
 * 특히 그렇다. 한 줄로 묶어 빠뜨릴 자리를 없앤다.
 *
 * `loadViewerState`가 React cache로 감싸여 있어 레이아웃과 페이지가 각각 불러도
 * 요청당 한 번만 DB를 읽는다.
 */
export async function guardPage(
  route: RouteKey,
  next?: string,
): Promise<{ viewer: ViewerState; access: AccessResult }> {
  const viewer = await loadViewerState();
  return { viewer, access: assertAccess(route, toAccessContext(viewer), next) };
}
