"use server";

import { revalidatePath } from "next/cache";

import { EntryStatus } from "@/generated/prisma/enums";
import { canAccess, loadAccessContext, getSessionUser } from "@/lib/access";
import { setEntryStatus } from "@/lib/admin-store";

/*
  참가 상태 변경.

  ⚠️ 판정을 두 번 한다 — 화면이 그렸는지와 무관하게 여기서 `canAccess("adminEntries")`를
  다시 부른다. 서버 액션은 그 자체로 호출 가능한 엔드포인트다. 운영자 권한이
  걸린 자리라 특히 그렇다.

  ⚠️ 사유 없이는 처리하지 않는다. 감사 로그의 `reason`이 NOT NULL인 것과 같은 규칙이고,
  검사는 store가 다시 한다(admin-store.ts) — 화면·액션·저장 셋 다 통과해야 바뀐다.
*/

export type EntryActionState = { message?: string; done?: boolean };

export async function changeEntryStatus(
  _prev: EntryActionState,
  formData: FormData,
): Promise<EntryActionState> {
  const user = await getSessionUser();
  if (!user) return { message: "로그인이 풀렸습니다." };

  const ctx = await loadAccessContext();
  const permission = canAccess("adminEntries", ctx);
  if (!permission.ok) return { message: permission.message };

  const entryId = String(formData.get("entryId") ?? "");
  const raw = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "");

  /* 폼에서 온 문자열을 그대로 DB에 넘기지 않는다 */
  const status =
    raw === EntryStatus.disqualified
      ? EntryStatus.disqualified
      : raw === EntryStatus.active
        ? EntryStatus.active
        : raw === EntryStatus.eliminated
          ? EntryStatus.eliminated
          : null;
  if (!entryId || !status) return { message: "잘못된 요청입니다." };

  const result = await setEntryStatus({
    entryId,
    status,
    reason,
    actorId: user.id,
  });
  if (!result.ok) return { message: result.message };

  revalidatePath("/admin/entries");
  revalidatePath("/admin");
  return { done: true };
}
