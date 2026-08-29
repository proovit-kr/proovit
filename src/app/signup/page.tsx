import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { safeNext } from "@/lib/access";
import { auth, signIn } from "@/lib/auth";
import { AUTH_PROVIDERS } from "@/lib/auth-providers";

import { AuthCard } from "../login/AuthCard";

/*
  회원가입 — 시안 `#scr-auth`의 signup 상태.

  시안 화면 레지스트리가 인증을 `/login, /signup` 두 주소로 적는다. 화면은
  하나고 상태만 다르므로 카드를 공유하고 여기서는 상태만 정한다.

  로그인과 갈리는 것은 넷이다: 제목, 부제, 필수 동의 둘, 아래 전환 문장.
  소셜 로그인 자체는 같은 흐름이다 — Auth.js는 가입과 로그인을 구분하지 않고,
  처음 오는 계정이면 auth-adapter가 사용자를 만든다.
*/

export const metadata: Metadata = {
  title: "회원가입",
  description: "PROOVIT 계정 만들기",
  /* 로그인과 같은 이유로 검색에 올리지 않는다 — 랜딩이 유입을 받아야 한다 */
  robots: { index: false, follow: true },
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;
  const next = safeNext(callbackUrl) ?? "/";

  const session = await auth();
  if (session?.user) redirect(next);

  return (
    <AuthCard
      mode="signup"
      providers={AUTH_PROVIDERS}
      errorMessage={error ? "가입에 실패했습니다. 다시 시도해 주세요." : null}
      onSignIn={async (formData: FormData) => {
        "use server";
        const providerId = String(formData.get("provider") ?? "");
        await signIn(providerId, { redirectTo: next });
      }}
    />
  );
}
