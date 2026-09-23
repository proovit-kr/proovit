"use server";

import { revalidatePath } from "next/cache";

import { canAccess, getSessionUser, loadAccessContext, loadViewerState } from "@/lib/access";
import type { StageTarget } from "@/lib/notify";
import { sendNotice } from "@/lib/notify-store";

/*
  공지 발송 — 시안 `#mdl-send` 「발송」.

  ⚠️ 발송 후 회수할 수 없다(시안 모달 문구). 권한을 다시 보고, 대상은 서버가
  다시 센다 — 화면이 보여 준 「예상 대상」은 안내일 뿐이다.
*/

export type NoticeState = { message?: string; done?: number };

const STAGES: StageTarget[] = ["all", "s1_s3", "s4", "s5"];

export async function postNotice(
  _prev: NoticeState,
  formData: FormData,
): Promise<NoticeState> {
  const user = await getSessionUser();
  if (!user) return { message: "로그인이 풀렸습니다." };

  const permission = canAccess("adminNotifications", await loadAccessContext());
  if (!permission.ok) return { message: permission.message };

  const viewer = await loadViewerState();
  if (!viewer.season) return { message: "시즌이 없습니다." };

  const stage = String(formData.get("stage") ?? "all") as StageTarget;
  if (!STAGES.includes(stage)) return { message: "잘못된 요청입니다." };

  const result = await sendNotice({
    seasonId: viewer.season.id,
    stage,
    track: String(formData.get("track") ?? "all"),
    channels: { inapp: formData.get("inapp") === "1", mail: formData.get("mail") === "1" },
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    actorId: user.id,
  });
  if (!result.ok) return { message: result.message };

  revalidatePath("/", "layout");
  return {
    done: Date.now(),
    ...(result.mailFailed
      ? { message: `메일 ${result.mailFailed}통은 보내지 못했습니다. 인앱은 모두 나갔습니다.` }
      : {}),
  };
}
