import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { safeNext } from "@/lib/access";
import { auth, signIn } from "@/lib/auth";
import { AUTH_PROVIDERS } from "@/lib/auth-providers";

import { AuthCard } from "./AuthCard";

/*
  인증 화면 — 시안 ver4 `#scr-auth` ① 「단일 진입 화면」.

  ⚠️ **ver4가 로그인과 회원가입을 합쳤다.** 화면은 하나고 `/signup`은 여기로
  되돌린다. 동의도 이 자리에서 받지 않는다 — 소셜 인증을 마치고 돌아온 뒤
  모달이 받는다(`ConsentGate`). 그래야 기록이 계정에 붙는다.

  ⚠️ 라우트 이름이 문서마다 다르다 — 「필요 페이지 정리」(7/28)와 CLAUDE.md는
  `/signin`, 06 ARCHITECTURE 계열은 이 이름을 쓴다. 8/17 회의에서 정본을 정하고
  그때 한쪽으로 통일한다. 지금 바꾸면 OAuth 콜백 주소까지 다시 등록해야 한다.
*/

export const metadata: Metadata = {
  /* ver4가 화면을 합쳤으므로 제목도 둘을 같이 말해야 한다 */
  title: "로그인 또는 회원가입",
  description: "PROOVIT 참가자·운영자 로그인",
  /*
    검색에 잡힐 이유가 없는 화면이다. 랜딩·리더보드가 유입을 받아야 하는데
    로그인 페이지가 같이 올라오면 관전자가 담벼락부터 만난다.
  */
  robots: { index: false, follow: true },
};

const ERROR_MESSAGES: Record<string, string> = {
  /*
    Auth.js가 ?error= 로 넘겨주는 값들. 원문은 영어 코드라 그대로 두면
    "무엇을 하면 되는지"를 알 수 없다.
  */
  OAuthAccountNotLinked:
    "이미 다른 방법으로 가입한 이메일입니다. 처음 가입할 때 쓰신 방법으로 로그인해 주세요.",
  AccessDenied: "로그인이 취소되었거나 접근이 거부되었습니다.",
  Verification:
    "인증 링크가 만료되었거나 이미 사용되었습니다. 다시 시도해 주세요.",
  Configuration:
    "로그인 설정에 문제가 있어 지금은 진행할 수 없습니다. 잠시 후 다시 시도해 주세요.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;
  /*
    ⚠️ 반드시 걸러서 쓴다. 그대로 넘기면 오픈 리다이렉트가 된다 —
    근거는 access.ts safeNext 주석.
  */
  const next = safeNext(callbackUrl) ?? "/";

  const session = await auth();
  /* 이미 로그인한 사람에게 로그인 화면을 보여줄 이유가 없다. */
  if (session?.user) redirect(next);

  return (
    <AuthCard
      providers={AUTH_PROVIDERS}
      errorMessage={
        error
          ? (ERROR_MESSAGES[error] ??
            "로그인에 실패했습니다. 다시 시도해 주세요.")
          : null
      }
      onSignIn={async (formData: FormData) => {
        "use server";
        const providerId = String(formData.get("provider") ?? "");
        /*
          로그인 후 목적지로 곧장 간다.

          ⚠️ 소셜 가입은 이름을 이메일 아이디로 갈음해둔다(auth-adapter.ts).
          그 임시값을 진짜 이름으로 바꾸는 자리는 이제 /settings뿐이고,
          가입 직후 강제로 거치는 자리는 없다. 시안(v2.1)에 온보딩 화면이 없어서다.
        */
        await signIn(providerId, { redirectTo: next });
      }}
    />
  );
}
