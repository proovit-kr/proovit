import type { DefaultSession } from "next-auth";

/*
  기본 Session.user에는 id가 없다(name·email·image뿐).
  auth.ts의 session 콜백이 user.id를 실어주므로 타입에도 반영한다.
  이게 없으면 서버 컴포넌트마다 as로 우회하게 되고, 그러면 실제로 id가
  빠졌을 때 타입이 잡아주지 못한다.
*/
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
