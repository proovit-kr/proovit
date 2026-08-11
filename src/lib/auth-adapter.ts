import type { Adapter, AdapterAccount, AdapterUser } from "next-auth/adapters";

import { prisma } from "@/lib/prisma";

/*
  Auth.js 어댑터를 직접 쓴다. 공식 @auth/prisma-adapter를 쓰지 않는 이유는 둘이다.

  1. 공식 어댑터는 Account 모델에 access_token·refresh_token·id_token을 요구한다.
     우리는 소셜 로그인을 "이 사람이 누구인가"에만 쓰고 그 토큰으로 할 일이 없다.
     쓰지 않는 자격증명을 보관하면 유출 시 피해만 커진다 — 06 §12의 유출 표면 축소 원칙.
  2. 공식 어댑터에 맞추려면 DB 명세서(동혁, 8/11 종결본)의 oauth_accounts에 컬럼 8개를
     더 넣어야 한다. 명세를 어댑터 사정에 맞춰 고치는 건 순서가 거꾸로다.

  세션은 DB 전략이다. JWT를 쓸 수 없는 이유는 실격 판정 즉시 세션을 무효화해야 하는데
  JWT는 만료 전까지 서버가 회수할 수 없어서다(CLAUDE.md 스택 표).
*/

/** users.name·nickname은 NOT NULL인데 소셜 제공자가 이름을 안 줄 수 있다. */
const NAME_MAX = 60;

/**
 * 가입 시점의 임시 표시명.
 *
 * 카카오는 닉네임을, 구글은 실명을 주지만 둘 다 보장되지 않는다(동의 항목을 끌 수 있다).
 * 비어 있으면 이메일 아이디 부분을 쓴다 — 화면이 빈 문자열로 깨지는 것보다 낫고,
 * 어차피 onboardedAt이 null이라 온보딩 화면이 실제 이름을 다시 받는다.
 */
function provisionalName(name: string | null | undefined, email: string): string {
  const source = name?.trim() || email.split("@")[0] || "참가자";
  return source.slice(0, NAME_MAX);
}

/** DB 행 → Auth.js가 아는 모양. 컬럼명이 다르므로 한 곳에서만 변환한다. */
function toAdapterUser(user: {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  emailVerifiedAt: Date | null;
}): AdapterUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.avatarUrl,
    emailVerified: user.emailVerifiedAt,
  };
}

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  emailVerifiedAt: true,
} as const;

export function ProovitAdapter(): Adapter {
  return {
    async createUser(user) {
      /*
        제공자가 이메일을 주지 않는 경우가 실제로 있다 — 카카오는 「카카오계정(이메일)」
        동의항목이 비즈 앱 + 비즈니스 정보 심사를 통과해야 열린다(2026-08-12 확인).

        여기서 막지 않으면 Prisma NOT NULL 위반이 그대로 올라가 사용자에게는
        원인을 알 수 없는 오류 화면만 뜬다. 무엇보다 이메일을 가짜값으로 채우는
        우회를 하면 안 된다 — 마감 통지가 조용히 실패하는데 그 통지가 분쟁의 근거다.
      */
      if (!user.email) {
        throw new Error(
          "이메일을 주지 않는 제공자로는 가입할 수 없습니다. " +
            "해당 제공자의 이메일 제공 권한을 먼저 확보하세요.",
        );
      }

      const name = provisionalName(user.name, user.email);
      const created = await prisma.user.create({
        // id는 넘기지 않는다. gen_random_uuid()가 정본이다.
        data: {
          email: user.email,
          name,
          // 닉네임은 리더보드에 노출되는 값이라 실명과 분리돼 있지만,
          // 가입 시점에는 구분할 재료가 없어 같은 값으로 시작하고 온보딩에서 나뉜다.
          nickname: name,
          avatarUrl: user.image ?? null,
          emailVerifiedAt: user.emailVerified ?? null,
        },
        select: USER_SELECT,
      });
      return toAdapterUser(created);
    },

    async getUser(id) {
      const user = await prisma.user.findUnique({
        where: { id },
        select: USER_SELECT,
      });
      return user ? toAdapterUser(user) : null;
    },

    async getUserByEmail(email) {
      // email은 citext라 대소문자를 가리지 않는다. 소셜 제공자마다 표기가 달라 필요하다.
      const user = await prisma.user.findUnique({
        where: { email },
        select: USER_SELECT,
      });
      return user ? toAdapterUser(user) : null;
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const account = await prisma.oauthAccount.findUnique({
        where: { provider_providerAccountId: { provider, providerAccountId } },
        select: { user: { select: USER_SELECT } },
      });
      return account ? toAdapterUser(account.user) : null;
    },

    async updateUser({ id, ...data }) {
      const updated = await prisma.user.update({
        where: { id },
        data: {
          // undefined는 Prisma가 "안 건드림"으로 읽는다. null과 구분해야 한다.
          email: data.email ?? undefined,
          name: data.name ?? undefined,
          avatarUrl: data.image ?? undefined,
          emailVerifiedAt: data.emailVerified ?? undefined,
        },
        select: USER_SELECT,
      });
      return toAdapterUser(updated);
    },

    async deleteUser(id) {
      // oauth_accounts·sessions·consents는 onDelete: Cascade라 함께 지워진다.
      await prisma.user.delete({ where: { id } });
    },

    async linkAccount(account) {
      /*
        토큰류(access_token·refresh_token·id_token·scope 등)를 일부러 버린다.
        저장하지 않는 것이 이 어댑터를 직접 쓰는 이유다.
      */
      await prisma.oauthAccount.create({
        data: {
          userId: account.userId,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
        },
      });
    },

    async unlinkAccount({ provider, providerAccountId }) {
      await prisma.oauthAccount.delete({
        where: { provider_providerAccountId: { provider, providerAccountId } },
      });
    },

    async getAccount(providerAccountId, provider) {
      const account = await prisma.oauthAccount.findUnique({
        where: { provider_providerAccountId: { provider, providerAccountId } },
        select: { userId: true, provider: true, providerAccountId: true },
      });
      if (!account) return null;

      /*
        type 컬럼을 두지 않았기 때문에 여기서 되돌려준다.
        구글은 OIDC, 카카오는 OAuth 2.0이다. 값이 둘뿐이라 표를 하나 더 만들 이유가 없고,
        제공자가 늘면 아래 맵에 한 줄 추가하면 된다.
      */
      const type: AdapterAccount["type"] =
        account.provider === "google" ? "oidc" : "oauth";

      return { ...account, type };
    },

    async createSession(session) {
      return prisma.session.create({
        data: session,
        select: { sessionToken: true, userId: true, expires: true },
      });
    },

    async getSessionAndUser(sessionToken) {
      const session = await prisma.session.findUnique({
        where: { sessionToken },
        select: {
          sessionToken: true,
          userId: true,
          expires: true,
          user: { select: USER_SELECT },
        },
      });
      if (!session) return null;

      const { user, ...rest } = session;
      return { session: rest, user: toAdapterUser(user) };
    },

    async updateSession({ sessionToken, ...data }) {
      return prisma.session.update({
        where: { sessionToken },
        data,
        select: { sessionToken: true, userId: true, expires: true },
      });
    },

    async deleteSession(sessionToken) {
      /*
        로그아웃 요청이 두 번 오거나(탭 두 개) 이미 만료 정리된 세션을 지우려 할 때
        delete는 P2025로 터진다. 없으면 목적은 이미 달성된 상태라 성공으로 본다.
      */
      await prisma.session.deleteMany({ where: { sessionToken } });
    },

    async createVerificationToken(token) {
      return prisma.verificationToken.create({ data: token });
    },

    async useVerificationToken({ identifier, token }) {
      /*
        이름 그대로 "쓰고 없앤다" — 1회용이라 조회와 삭제가 한 동작이어야 한다.
        먼저 읽고 나중에 지우면 그 사이에 같은 링크를 두 번 열 수 있다.

        DELETE ... RETURNING을 직접 쓰는 이유: Prisma의 delete()는 대상 행이 없으면
        예외를 던지는데, 여기서 "없음"은 장애가 아니라 정상 경로다(만료된 링크,
        이미 쓴 링크). 예외를 잡아 삼켜도 Prisma가 prisma:error를 먼저 찍어버려서
        운영 로그에 매번 가짜 에러가 쌓인다 — 진짜 사고를 덮는다.
        deleteMany는 로그가 조용한 대신 지워진 행을 돌려주지 않아 쓸 수 없다.
      */
      const rows = await prisma.$queryRaw<
        { identifier: string; token: string; expires: Date }[]
      >`DELETE FROM verification_tokens
         WHERE identifier = ${identifier} AND token = ${token}
         RETURNING identifier, token, expires`;

      return rows[0] ?? null;
    },
  };
}
