"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { accountConsentRows } from "@/lib/account-consent";
import { getSessionUser } from "@/lib/access";
import { hashIp } from "@/lib/apply-store";
import { signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/*
  계정 동의 모달의 두 버튼 — 시안 ver4 `#scr-auth` ②.

  「동의하고 시작하기」와 「동의하지 않고 로그아웃」뿐이다. 모달은 배경 클릭과
  ESC로 닫히지 않으므로(개발 메모) 빠져나가는 길이 이 둘로 한정된다.
*/

/**
 * 필수 동의를 받고 계속 진행한다.
 *
 * ⚠️ **필수 셋을 서버에서 다시 본다.** 화면이 버튼을 잠그지만 그건 편의고,
 * 액션은 직접 호출될 수 있다. 동의 없이 행이 쌓이면 그 기록이 오히려 거짓 증빙이 된다.
 *
 * 저장했으면 true. 화면이 그걸 보고 시안 ③의 토스트를 띄운다.
 */
export async function acceptAccountConsent(formData: FormData): Promise<boolean> {
  const user = await getSessionUser();
  /* 세션이 끊긴 채로 눌린 경우. 조용히 끝낸다 — 모달은 다음 진입에서 다시 뜬다 */
  if (!user) return false;

  const terms = formData.get("consent-terms") === "on";
  const privacy = formData.get("consent-privacy") === "on";
  const age = formData.get("consent-age") === "on";
  if (!terms || !privacy || !age) return false;

  const marketing = formData.get("consent-marketing") === "on";

  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ?? requestHeaders.get("x-real-ip");

  await prisma.consent.createMany({
    data: accountConsentRows({
      userId: user.id,
      marketing,
      ageConfirmed: true,
      ipHash: hashIp(ip),
      userAgent: requestHeaders.get("user-agent")?.slice(0, 500) ?? null,
    }),
  });

  /*
    ⚠️ `redirect`하지 않는다. 시안 ③은 「동의 저장, **보던 페이지로 복귀**」다 —
    모달은 이미 그 페이지 위에 떠 있으므로, 갈 곳은 지금 있는 자리다.
    레이아웃을 다시 그리게만 하면 게이트가 풀리면서 모달이 사라진다.

    layout: "layout"이 필요하다. 모달을 루트 레이아웃이 그리는데 기본값("page")은
    페이지만 무효화해서 모달이 그대로 남는다.
  */
  revalidatePath("/", "layout");
  return true;
}

/**
 * 동의를 거부하고 로그아웃한다.
 *
 * 팀 결정(2026-09-10): **계정 레코드를 지우지 않는다.** 소셜 인증은 이미 끝나
 * `users`·`oauth_accounts` 행이 생긴 상태인데, 이걸 지우면 다음 로그인에서
 * 같은 소셜 계정이 새 userId로 들어와 이전 흔적(감사 로그 참조 등)과 끊긴다.
 * 동의 기록이 없는 상태로 두면 다음 로그인 때 이 모달이 다시 뜬다 —
 * `loadAccountConsentNeed`가 "기록 없음"으로 읽는다.
 */
export async function declineAccountConsent() {
  await signOut({ redirectTo: "/" });
}
