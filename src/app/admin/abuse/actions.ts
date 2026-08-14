"use server";

import { revalidatePath } from "next/cache";

import { AbuseStatus } from "@/generated/prisma/enums";
import { canAccess, getSessionUser, loadAccessContext } from "@/lib/access";
import { resolveAbuseFlag } from "@/lib/admin-store";

/*
  어뷰징 플래그 판정.

  ⚠️ 확정(upheld)은 그 팀의 지표를 깎는 판단이고 실격으로 이어진다. 그래서 사유가
  필수이고 감사 로그가 남는다 — 참가자가 나중에 "왜 내 방문이 빠졌냐"고 물으면
  그 답이 이 기록이다.
*/

export type AbuseState = { message?: string; done?: boolean };

export async function resolveFlag(
  _prev: AbuseState,
  formData: FormData,
): Promise<AbuseState> {
  const user = await getSessionUser();
  if (!user) return { message: "로그인이 풀렸습니다." };

  const permission = canAccess("adminAbuse", await loadAccessContext());
  if (!permission.ok) return { message: permission.message };

  const flagId = String(formData.get("flagId") ?? "");
  const raw = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const adjustedRaw = String(formData.get("adjustedVisitors") ?? "").trim();

  const status =
    raw === AbuseStatus.upheld
      ? AbuseStatus.upheld
      : raw === AbuseStatus.overturned
        ? AbuseStatus.overturned
        : null;
  if (!flagId || !status) return { message: "잘못된 요청입니다." };

  /* 빈 칸은 「조정 없음」이고 0은 「0으로 조정」이다 — 둘을 섞지 않는다 */
  const adjustedVisitors =
    adjustedRaw === "" ? undefined : Number.parseInt(adjustedRaw, 10);
  if (adjustedVisitors !== undefined && Number.isNaN(adjustedVisitors)) {
    return { message: "조정 방문 수는 숫자로 적어 주세요." };
  }

  const result = await resolveAbuseFlag({
    flagId,
    status,
    reason,
    actorId: user.id,
    adjustedVisitors,
  });
  if (!result.ok) return { message: result.message };

  revalidatePath("/admin/abuse");
  revalidatePath("/admin");
  return { done: true };
}
