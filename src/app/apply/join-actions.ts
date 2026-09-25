"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { APPLY_CONSENTS } from "@/content/consent";
import { getSessionUser } from "@/lib/access";
import { missingRequiredConsents } from "@/lib/apply-store";
import { getCurrentSeason } from "@/lib/season";
import { InviteCodeSchema, isJoinPhase, TEAM_FAILURE_MESSAGE } from "@/lib/team";
import { acceptInvite } from "@/lib/team-store";

/*
  초대 코드로 팀에 합류한다.

  신청(submitApply)과 가르는 이유는 만드는 것이 다르기 때문이다 — 신청은 팀과
  참가를 만들고, 합류는 **이미 있는 참가에 사람을 붙인다.** 팀 이름·참가작을
  다시 받지 않는다(팀장이 이미 냈다). 받는 것은 참가 동의뿐이다(APPLY_CONSENTS, 09-21부터 둘).

  ✅ **합류는 모집 기간이 끝나도 s2 제출 전까지 받는다**(2026-09-25 수연 지시,
  PRD FR-B3 · OPEN-6 지각 참가). 그 전에는 신청과 같이 모집 기간에만 받았다.
  → 2026-09-26 뒤집음: s2 제출이 아니라 **s1 달력 마감까지**다(수연 지시 「절대
  날짜로」 · team.ts 「합류 기간」).

  판정이 두 겹이다.
    ① 페이즈 — 모집·레이스가 아니면 여기서 끊는다(`isJoinPhase`). 문구는 신청과 같다.
       /apply 화면도 같은 함수로 합류 폼을 연다.
    ② s1 달력 마감·팀의 상태 — `acceptInvite`가 트랜잭션 안에서 `inviteFailure`로
       본다(그 안의 `joinClosedCode`). 초대가 가리키는 팀의 참가와 s1 마감
       (`loadJoinWindow`)을 읽어야 해서 액션이 아니라 store에 있다.
       (2026-09-26 전에는 진도였다 — 모집 중에도 s2를 낸 팀은 닫혔다.)

  ⚠️ **새 참가 신청은 여전히 모집 기간에만 받는다**(submitApply의 `resolveLandingCta`).
  레이스 중에 초대 링크로 팀을 새로 만드는 길은 없다 — 합류는 이미 있는 팀에만 붙는다.
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
  if (!season || !isJoinPhase(season.phase)) {
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

  const result = await acceptInvite(user, parsed.data, season, consent, {
    ip: forwarded?.split(",")[0]?.trim() ?? requestHeaders.get("x-real-ip"),
    userAgent: requestHeaders.get("user-agent"),
  });

  if (!result.ok) {
    return { message: TEAM_FAILURE_MESSAGE[result.code], code: raw };
  }

  /* 합류하면 곧바로 팀의 대시보드가 열린다. redirect는 try 밖에 둔다 */
  redirect("/dashboard");
}
