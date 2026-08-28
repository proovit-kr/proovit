"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { APPLY_CONSENTS } from "@/content/consent";
import { getSessionUser } from "@/lib/access";
import { missingRequiredConsents } from "@/lib/apply-store";
import { getCurrentSeason, resolveLandingCta } from "@/lib/season";
import { InviteCodeSchema, TEAM_FAILURE_MESSAGE } from "@/lib/team";
import { acceptInvite } from "@/lib/team-store";

/*
  초대 코드로 팀에 합류한다.

  신청(submitApply)과 가르는 이유는 만드는 것이 다르기 때문이다 — 신청은 팀과
  참가를 만들고, 합류는 **이미 있는 참가에 사람을 붙인다.** 팀 이름·참가작을
  다시 받지 않는다(팀장이 이미 냈다). 받는 것은 동의 3종뿐이다.

  ⚠️ 합류도 모집 기간에만 받는다. 신청과 같은 함수(resolveLandingCta)로 판정한다 —
  랜딩이 닫혀 있는데 초대 링크만 열려 있으면 우회로가 된다.
  **모집 마감 후 팀원 추가를 받을지는 8/17에 확인할 것**(규칙 문서에 조항이 없다).
*/

export type JoinState = {
  message?: string;
  /** 되돌려 채울 코드. 없으면 사용자가 방금 친 것을 잃는다 */
  code?: string;
};

export async function joinTeam(
  _prev: JoinState,
  formData: FormData,
): Promise<JoinState> {
  const raw = String(formData.get("code") ?? "");

  /*
    ⚠️ 화면이 로그인 뒤에 있다고 액션의 인증을 생략하지 않는다.
    서버 액션은 그 자체로 호출 가능한 엔드포인트다.
  */
  const user = await getSessionUser();
  if (!user) {
    return { message: "로그인이 풀렸습니다. 다시 로그인해 주세요.", code: raw };
  }

  const parsed = InviteCodeSchema.safeParse(raw);
  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message, code: raw };
  }

  const season = await getCurrentSeason();
  if (!season || resolveLandingCta(season).kind !== "APPLY") {
    return {
      message: "지금은 참가 신청을 받고 있지 않습니다.",
      code: raw,
    };
  }

  /* 동의는 항목마다 따로 읽는다 — 하나로 묶으면 D2가 서버 기록에서 무너진다 */
  const consent = Object.fromEntries(
    APPLY_CONSENTS.map((item) => [
      item.key,
      formData.get(`consent-${item.key}`) === "on",
    ]),
  );
  if (missingRequiredConsents(consent)) {
    return {
      message: "필수 항목에 동의해야 팀에 합류할 수 있어요.",
      code: raw,
    };
  }

  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for");

  const result = await acceptInvite(user, parsed.data, season.id, consent, {
    ip: forwarded?.split(",")[0]?.trim() ?? requestHeaders.get("x-real-ip"),
    userAgent: requestHeaders.get("user-agent"),
  });

  if (!result.ok) {
    return { message: TEAM_FAILURE_MESSAGE[result.code], code: raw };
  }

  /* 합류하면 곧바로 팀의 대시보드가 열린다. redirect는 try 밖에 둔다 */
  redirect("/dashboard");
}
