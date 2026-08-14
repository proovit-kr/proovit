"use server";

import { revalidatePath } from "next/cache";

import { SeasonPhase } from "@/generated/prisma/enums";
import { canAccess, getSessionUser, loadAccessContext } from "@/lib/access";
import { setSeasonPhase } from "@/lib/admin-store";

/*
  페이즈 수동 전환.

  ⚠️ 이건 예외 경로다. 정본은 크론이 `season_schedules`를 읽어 전환하는 것이고
  (ADR-010), 여기는 앞당기거나 되돌릴 때만 쓴다. 그래서 사유가 필수다.

  ⚠️ **페이즈 하나가 화면 서른 개의 열림/닫힘을 바꾼다.** `/apply`가 열리고
  리더보드가 공개되고 제출이 잠긴다. 실수로 누르면 참가자가 즉시 본다 —
  그래서 확인 절차를 한 겹 두고 감사 로그를 남긴다.
*/

export type SeasonActionState = { message?: string; done?: boolean };

export async function changeSeasonPhase(
  _prev: SeasonActionState,
  formData: FormData,
): Promise<SeasonActionState> {
  const user = await getSessionUser();
  if (!user) return { message: "로그인이 풀렸습니다." };

  const permission = canAccess("adminSeasons", await loadAccessContext());
  if (!permission.ok) return { message: permission.message };

  const seasonId = String(formData.get("seasonId") ?? "");
  const raw = String(formData.get("phase") ?? "");
  const reason = String(formData.get("reason") ?? "");

  /* 폼 문자열을 그대로 넘기지 않는다 — 열거값에 있는 것만 통과시킨다 */
  const phase = (Object.values(SeasonPhase) as string[]).includes(raw)
    ? (raw as SeasonPhase)
    : null;
  if (!seasonId || !phase) return { message: "잘못된 요청입니다." };

  const result = await setSeasonPhase({
    seasonId,
    phase,
    reason,
    actorId: user.id,
  });
  if (!result.ok) return { message: result.message };

  /*
    페이즈는 공개 화면의 판정에도 들어간다 — 랜딩 CTA·리더보드 공개 여부가 바뀐다.
    운영 화면만 새로 그리면 관전자는 옛 화면을 계속 본다.
  */
  revalidatePath("/admin/seasons");
  revalidatePath("/admin");
  revalidatePath("/");
  return { done: true };
}
