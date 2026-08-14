"use server";

import { revalidatePath } from "next/cache";

import { canAccess, getSessionUser, loadAccessContext, loadViewerState } from "@/lib/access";
import type { Audience } from "@/lib/notify";
import { sendNotice } from "@/lib/notify-store";
import { safeNext } from "@/lib/access";

/*
  공지 발송.

  ⚠️ 링크는 **우리 서비스 안의 주소만** 받는다. 공지에 외부 주소를 실을 수 있으면
  운영 계정이 털렸을 때 참가자 전원에게 피싱 링크가 나간다. `safeNext`가 로그인
  되돌아갈 주소를 거르는 것과 같은 규칙이고 같은 함수를 쓴다.
*/

export type NoticeState = { message?: string; sent?: number };

export async function sendNotification(
  _prev: NoticeState,
  formData: FormData,
): Promise<NoticeState> {
  const user = await getSessionUser();
  if (!user) return { message: "로그인이 풀렸습니다." };

  const permission = canAccess("adminNotifications", await loadAccessContext());
  if (!permission.ok) return { message: permission.message };

  const viewer = await loadViewerState();
  if (!viewer.season) return { message: "시즌이 없습니다." };

  const audience: Audience =
    String(formData.get("audience") ?? "") === "active" ? "active" : "all";
  const title = String(formData.get("title") ?? "");
  const body = String(formData.get("body") ?? "");
  const rawLink = String(formData.get("linkUrl") ?? "").trim();

  const linkUrl = rawLink === "" ? null : safeNext(rawLink);
  if (rawLink !== "" && linkUrl === null) {
    return { message: "링크는 /로 시작하는 서비스 안 주소만 넣을 수 있습니다." };
  }

  const result = await sendNotice({
    seasonId: viewer.season.id,
    audience,
    title,
    body,
    linkUrl,
    actorId: user.id,
  });
  if (!result.ok) return { message: result.message };

  revalidatePath("/admin/notifications");
  revalidatePath("/notifications");
  return { sent: result.count };
}
