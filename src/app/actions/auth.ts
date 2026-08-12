"use server";

import { signOut } from "@/lib/auth";

/*
  로그아웃. NavBar가 클라이언트 컴포넌트라 next-auth/react의 signOut()을 쓸
  수도 있지만, 서버 액션으로 두면 폼 전송만으로 끝나 CSRF 토큰을 직접
  다룰 일이 없다(Next가 액션 호출을 검증한다).

  DB 세션이라 여기서 sessions 행이 실제로 지워진다 — JWT처럼 만료를 기다리지
  않는다. 실격 판정 즉시 무효화가 요건이라 DB 세션을 골랐고, 로그아웃도 같은 길을 쓴다.
*/
export async function logout() {
  await signOut({ redirectTo: "/" });
}
