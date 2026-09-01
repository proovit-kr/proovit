import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import Kakao from "next-auth/providers/kakao";
import type { KakaoProfile } from "next-auth/providers/kakao";

import { ProovitAdapter } from "@/lib/auth-adapter";
import { isProviderConfigured } from "@/lib/auth-providers";
import { prisma } from "@/lib/prisma";

/*
  켜져 있는 제공자만 등록한다. 판정은 auth-providers.ts 한 곳에서 하고
  /login 화면도 같은 목록을 읽는다 — 따로 두면 버튼과 실제 제공자가 어긋난다.
*/
function configuredProviders(): Provider[] {
  const providers: Provider[] = [];

  if (isProviderConfigured("kakao")) {
    providers.push(
      Kakao({
        /*
          기본 profile()은 id·name·email·image만 넘긴다. 그대로 두면
          emailVerified가 비어서 **카카오로 가입한 사람 전원이 미인증**이 된다
          (구글에서 같은 자리를 놓쳤던 것과 똑같은 함정이다. 아래 linkAccount 주석 참고).

          카카오는 `kakao_account.is_email_verified`로 인증 여부를 준다.
          is_email_valid는 「형식이 유효한가」라서 인증 여부가 아니다 — 섞지 말 것.

          ⚠️ scope는 여기서 지정하지 않는다. next-auth의 카카오 제공자는
          authorize 요청에 scope를 비워 보내고, 카카오는 **콘솔의 동의항목 설정**을
          그대로 따른다. 이메일은 콘솔에서 필수 동의로 열어 두었다(앱 1541124).
        */
        profile(profile: KakaoProfile) {
          const account = profile.kakao_account;
          return {
            id: profile.id.toString(),
            name: account?.profile?.nickname,
            email: account?.email,
            image: account?.profile?.profile_image_url,
            emailVerified: account?.is_email_verified ? new Date() : null,
          };
        },
      }),
    );
  }

  if (isProviderConfigured("google")) {
    providers.push(
      Google({
        /*
          구글이 주는 email_verified 클레임을 여기서 실어 보낸다.
          이 값을 쓰는 곳은 아래 events.linkAccount다 — createUser가 아니다.
          이유는 그쪽 주석에 있다.
        */
        profile(profile) {
          return {
            id: profile.sub,
            name: profile.name,
            email: profile.email,
            image: profile.picture,
            emailVerified: profile.email_verified ? new Date() : null,
          };
        },
      }),
    );
  }

  return providers;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: ProovitAdapter(),
  providers: configuredProviders(),

  /*
    DB 세션이다. JWT를 쓰지 않는 이유는 실격 판정이 곧바로 세션 무효화여야 하는데
    JWT는 만료 전까지 서버가 회수할 수 없어서다.

    maxAge 30일은 시즌1(9/28~11/1, 35일)보다 짧다. 덮는 것은 updateAge 쪽이다 —
    하루에 한 번이라도 들어오면 그때부터 다시 30일이라 시즌 내내 안 끊긴다.
    35일을 통째로 덮으려고 maxAge를 늘리지 말 것: 실격 판정이 세션 무효화여야 해서
    DB 세션을 쓰는 건데, 만료가 길수록 방치된 세션이 오래 남는다.
    updateAge 24시간은 세션을 하루에 한 번만 연장한다는 뜻이다. 매 요청마다
    UPDATE를 치면 시즌 중 트래픽이 몰릴 때 sessions 테이블이 병목이 된다.
  */
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },

  pages: {
    // ⚠️ CLAUDE.md의 라우트 목록은 /signin으로 적혀 있다. 정본 확인 필요.
    signIn: "/login",
  },

  callbacks: {
    /*
      DB 세션에서는 이 콜백이 (session, user) 쌍으로 불린다.
      user.id를 실어주지 않으면 서버 컴포넌트가 "누구인지"를 알 수 없어
      canAccess()가 매번 이메일로 다시 조회해야 한다.
    */
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },

  events: {
    /*
      소셜 가입자의 이메일 인증 상태를 여기서 남긴다.

      ⚠️ provider의 profile()에서 emailVerified를 채워도 소용이 없다.
      Auth.js가 신규 OAuth 가입에서 `createUser({ ...profile, emailVerified: null })`로
      **강제로 덮어쓴다**(@auth/core handle-login.js). 그 필드는 Email 제공자 전용이라는
      전제로 짜여 있어서다. 그래서 계정이 연결된 직후인 이 이벤트에서 바로잡는다.

      안 하면 users.email_verified_at이 영원히 비어서 **소셜로 가입한 사람 전원이
      미인증 상태**가 된다. 나중에 인증을 조건으로 거는 화면이 생기면 한 명도 통과 못 한다.

      linkAccount는 계정이 **새로 연결될 때만** 불린다. 재로그인마다 쓰기가 생기지 않는다.
    */
    async linkAccount({ user, profile }) {
      const verified =
        "emailVerified" in profile ? profile.emailVerified : null;
      if (!verified) return;

      /*
        updateMany + emailVerifiedAt: null 조건인 이유 — 이미 인증된 사용자가
        소셜 계정을 하나 더 붙일 때 최초 인증 시각을 덮어쓰지 않기 위함이다.
        "언제 인증됐나"는 분쟁에서 근거가 되는 값이라 뒤로 밀면 안 된다.
      */
      await prisma.user.updateMany({
        where: { id: user.id, emailVerifiedAt: null },
        data: { emailVerifiedAt: verified },
      });
    },
  },

  /*
    Vercel은 요청 호스트를 프록시로 넘겨준다. 이게 없으면 프리뷰 배포마다
    URL이 달라 콜백 검증에서 막힌다.
  */
  trustHost: true,
});
