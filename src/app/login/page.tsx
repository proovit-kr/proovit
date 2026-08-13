import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Button } from "@/components/Button";
import { Footer } from "@/components/Footer";
import { Logo } from "@/components/NavBar";
import { safeNext } from "@/lib/access";
import { auth, signIn } from "@/lib/auth";
import { AUTH_PROVIDERS } from "@/lib/auth-providers";

import styles from "./login.module.css";

/*
  로그인 화면.

  ⚠️ 라우트 이름이 문서마다 다르다 — 「필요 페이지 정리」(7/28)와 CLAUDE.md는
  `/signin`, 06 ARCHITECTURE 계열은 이 이름을 쓴다. 8/17 회의에서 정본을 정하고
  그때 한쪽으로 통일한다. 지금 바꾸면 OAuth 콜백 주소까지 다시 등록해야 한다.
*/

export const metadata: Metadata = {
  title: "로그인",
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
  /*
    이미 로그인한 사람에게 로그인 화면을 보여줄 이유가 없다.
    온보딩을 마쳤으면 /onboarding이 곧바로 next로 흘려보낸다.
  */
  if (session?.user) redirect(`/onboarding?next=${encodeURIComponent(next)}`);

  const errorMessage = error
    ? (ERROR_MESSAGES[error] ?? "로그인에 실패했습니다. 다시 시도해 주세요.")
    : null;

  return (
    <main className={`page ${styles.page}`}>
      <div className={`container container--narrow grow ${styles.wrap}`}>
        <div className={styles.head}>
          <Logo />
          <h1 className={styles.title}>로그인</h1>
          <p className={styles.lead}>
            참가 신청과 스테이지 제출은 로그인 후에 진행됩니다.
          </p>
        </div>

        {errorMessage ? (
          <p className={styles.error} role="alert">
            {errorMessage}
          </p>
        ) : null}

        {AUTH_PROVIDERS.length > 0 ? (
          <div className={styles.providers}>
            {AUTH_PROVIDERS.map((provider) => (
              <form
                key={provider.id}
                action={async () => {
                  "use server";
                  /*
                    로그인 후 목적지로 곧장 가지 않고 /onboarding을 거친다.
                    소셜 가입은 이름을 이메일 아이디로 갈음해두기 때문에
                    (auth-adapter.ts) 그 자리를 지나야 실제 이름이 채워진다.
                    이미 마친 사람에게는 서버 리다이렉트 한 번이라 티가 안 난다.
                  */
                  await signIn(provider.id, {
                    redirectTo: `/onboarding?next=${encodeURIComponent(next)}`,
                  });
                }}
              >
                <Button
                  type="submit"
                  variant={provider.id === "google" ? "primary" : "soft"}
                  size="lg"
                  block
                >
                  {provider.label}로 계속하기
                </Button>
              </form>
            ))}
          </div>
        ) : (
          /*
            키가 하나도 없는 상태. 프리뷰 배포나 키 발급 전 로컬이 여기 걸린다.
            버튼 없는 빈 화면을 두면 고장으로 보이므로 이유를 적는다.
          */
          <p className={styles.empty}>
            로그인 수단이 아직 연결되지 않았습니다. 잠시 후 다시 시도해 주세요.
          </p>
        )}

        <p className={styles.note}>
          로그인하면 서비스 이용약관과 개인정보처리방침에 동의한 것으로 봅니다.
          {/*
            ⚠️ 이 문장은 이용약관에만 유효한 방식이다. 개인정보 수집·이용 동의는
            개인정보보호법 제22조 제1항이 "동의 여부를 명확하게 표시할 수 있는 방법"을
            요구하므로 간주 동의로 갈음할 수 없다 — 필수 동의 3종은 /apply에서
            체크박스로 따로 받는다. 문안 확정은 윤서 몫이라 자리만 잡아둔다.
          */}
        </p>
      </div>
      <Footer />
    </main>
  );
}
