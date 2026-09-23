"use server";

import { revalidatePath } from "next/cache";

import { SanctionReason } from "@/generated/prisma/enums";
import { canAccess, getSessionUser, loadAccessContext } from "@/lib/access";
import { applySanction, type SanctionStep } from "@/lib/admin-store";

/*
  어뷰징 판정 — 시안 판정 카드의 세 버튼(경고·지표 무효화·실격).

  ⚠️ 셋 다 제재다. 사유가 필수이고 감사 로그·통지가 함께 나간다(admin-store
  `applySanction`). 폼 문자열은 열거값에 있는 것만 통과시킨다.
*/

export type AbuseState = { message?: string; done?: number };

const STEPS: SanctionStep[] = ["warning", "week_invalidated", "disqualified"];

export async function sanctionFlag(
  _prev: AbuseState,
  formData: FormData,
): Promise<AbuseState> {
  const user = await getSessionUser();
  if (!user) return { message: "로그인이 풀렸습니다." };

  const permission = canAccess("adminAbuse", await loadAccessContext());
  if (!permission.ok) return { message: permission.message };

  const flagId = String(formData.get("flagId") ?? "");
  const step = String(formData.get("step") ?? "") as SanctionStep;
  const kind = String(formData.get("kind") ?? "");
  if (!flagId || !STEPS.includes(step) || !(Object.values(SanctionReason) as string[]).includes(kind)) {
    return { message: "잘못된 요청입니다." };
  }

  const result = await applySanction({
    flagId,
    step,
    reasonKind: kind as SanctionReason,
    reason: String(formData.get("reason") ?? ""),
    actorId: user.id,
  });
  if (!result.ok) return { message: result.message };

  /* 실격은 참가자 화면 전부(사이드바·헤더·허브)와 공개 리더보드를 바꾼다 */
  revalidatePath("/", "layout");
  return { done: Date.now() };
}
