import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import Kakao from "next-auth/providers/kakao";

import { ProovitAdapter } from "@/lib/auth-adapter";
import { isProviderConfigured } from "@/lib/auth-providers";

/*
  켜져 있는 제공자만 등록한다. 판정은 auth-providers.ts 한 곳에서 하고
  /login 화면도 같은 목록을 읽는다 — 따로 두면 버튼과 실제 제공자가 어긋난다.
*/
function configuredProviders(): Provider[] {
  const providers: Provider[] = [];

  if (isProviderConfigured("kakao")) providers.push(Kakao);
  if (isProviderConfigured("google")) providers.push(Google);

  return providers;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: ProovitAdapter(),
  providers: configuredProviders(),

  /*
    DB 세션이다. JWT를 쓰지 않는 이유는 실격 판정이 곧바로 세션 무효화여야 하는데
    JWT는 만료 전까지 서버가 회수할 수 없어서다.

    maxAge 30일은 시즌1(9/7~10/11) 전체보다 길다 — 시즌 도중 로그아웃당하지 않게.
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

  /*
    Vercel은 요청 호스트를 프록시로 넘겨준다. 이게 없으면 프리뷰 배포마다
    URL이 달라 콜백 검증에서 막힌다.
  */
  trustHost: true,
});
