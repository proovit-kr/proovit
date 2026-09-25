"use server";

import { revalidatePath } from "next/cache";

import { EntryStatus } from "@/generated/prisma/enums";
import { canAccess, loadAccessContext, getSessionUser } from "@/lib/access";
import { createLatePass, revokeLatePass, setEntryStatus } from "@/lib/admin-store";
import { fmtMDHM } from "@/lib/header-state";

/*
  참가 상태 변경.

  ⚠️ 판정을 두 번 한다 — 화면이 그렸는지와 무관하게 여기서 `canAccess("adminEntries")`를
  다시 부른다. 서버 액션은 그 자체로 호출 가능한 엔드포인트다. 운영자 권한이
  걸린 자리라 특히 그렇다.

  ⚠️ 사유 없이는 처리하지 않는다. 감사 로그의 `reason`이 NOT NULL인 것과 같은 규칙이고,
  검사는 store가 다시 한다(admin-store.ts) — 화면·액션·저장 셋 다 통과해야 바뀐다.
*/

export type EntryActionState = { message?: string; done?: number };

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

  /* 상태는 참가자 화면(허브·사이드바·헤더)과 공개 리더보드에도 걸린다 */
  revalidatePath("/", "layout");
  return { done: Date.now() };
}

/*
  지각 편입 링크 — 참가 관리의 「지각 편입」 칸(시안에 없는 칸, LatePassPanel).
  2026-09-26 수연 지시 · PRD OPEN-6. `op` 하나로 가른다.

    create  1회용 편입 링크를 만든다
    revoke  대기 중인 링크를 취소한다

  위 상태 변경과 같은 두 겹이다 — 여기서 `canAccess("adminEntries")`를 다시 보고,
  사유·기간·대기 여부는 store가 다시 본다(admin-store `createLatePass`·`revokeLatePass`).
*/

export type LatePassActionState = {
  message?: string;
  done?: number;
  /** 방금 만든 링크. 주소는 화면이 서버가 정한 origin으로 조립한다(page.tsx `latePassOrigin`) */
  created?: { code: string; expires: string };
};

export async function manageLatePass(
  _prev: LatePassActionState,
  formData: FormData,
): Promise<LatePassActionState> {
  const user = await getSessionUser();
  if (!user) return { message: "로그인이 풀렸습니다." };

  const permission = canAccess("adminEntries", await loadAccessContext());
  if (!permission.ok) return { message: permission.message };

  const op = String(formData.get("op") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!seasonId) return { message: "잘못된 요청입니다." };

  if (op === "create") {
    const result = await createLatePass({ seasonId, reason, actorId: user.id });
    if (!result.ok) return { message: result.message };
    revalidatePath("/admin/entries");
    return {
      done: Date.now(),
      created: { code: result.code, expires: fmtMDHM(result.expiresAt) },
    };
  }

  if (op === "revoke") {
    const passId = String(formData.get("passId") ?? "");
    if (!passId) return { message: "잘못된 요청입니다." };
    const result = await revokeLatePass({ seasonId, passId, reason, actorId: user.id });
    if (!result.ok) return { message: result.message };
    revalidatePath("/admin/entries");
    return { done: Date.now() };
  }

  return { message: "잘못된 요청입니다." };
}
