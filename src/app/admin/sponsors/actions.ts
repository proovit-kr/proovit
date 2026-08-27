"use server";

import { revalidatePath } from "next/cache";

import {
  CreditDelivery,
  CreditKind,
  CreditOfferStatus,
  CreditUnlockEvent,
} from "@/generated/prisma/enums";
import { canAccess, getSessionUser, loadAccessContext } from "@/lib/access";
import {
  deliverCreditManually,
  saveCreditOffer,
  uploadCreditCodes,
} from "@/lib/admin-store";
import { loadViewerState } from "@/lib/access";

/*
  스폰서 크레딧 쓰기 셋 — 혜택 저장, 코드 풀 업로드, 수동 발급.

  ⚠️ 셋 다 판정을 다시 한다. 화면이 버튼을 안 그렸다는 사실은 아무것도 막지
  않는다(admin/entries/actions.ts와 같은 규칙).

  ⚠️ 폼 문자열을 그대로 DB에 넘기지 않는다. enum은 값 목록에 대조해서 통과한
  것만 쓴다 — 그러지 않으면 Prisma가 던지는 자리까지 잘못된 값이 흘러간다.
*/

export type SponsorActionState = { message?: string; done?: string };

/** 폼에서 온 문자열을 enum 값으로. 목록에 없으면 null이다 */
function toEnum<T extends Record<string, string>>(
  values: T,
  raw: unknown,
): T[keyof T] | null {
  const value = String(raw ?? "");
  return (Object.values(values) as string[]).includes(value)
    ? (value as T[keyof T])
    : null;
}

/** 비어 있으면 null. 빈 문자열을 DB에 넣으면 "없음"과 ""가 갈린다 */
function orNull(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  return value === "" ? null : value;
}

/** YYYY-MM-DD. 잘못된 값은 null로 떨어뜨린다 — 날짜 하나 때문에 저장을 막지 않는다 */
function toDate(raw: unknown): Date | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00+09:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function guard() {
  const user = await getSessionUser();
  if (!user) return { error: "로그인이 풀렸습니다." } as const;

  const permission = canAccess("adminSponsors", await loadAccessContext());
  if (!permission.ok) return { error: permission.message } as const;

  const viewer = await loadViewerState();
  if (!viewer.season) return { error: "현재 시즌이 없습니다." } as const;

  return { actorId: user.id, seasonId: viewer.season.id } as const;
}

export async function saveOffer(
  _prev: SponsorActionState,
  formData: FormData,
): Promise<SponsorActionState> {
  const gate = await guard();
  if ("error" in gate) return { message: gate.error };

  const kind = toEnum(CreditKind, formData.get("kind"));
  const status = toEnum(CreditOfferStatus, formData.get("status"));
  const unlockEvent = toEnum(CreditUnlockEvent, formData.get("unlockEvent"));
  const deliveryMethod = toEnum(CreditDelivery, formData.get("deliveryMethod"));
  if (!kind || !status || !unlockEvent || !deliveryMethod) {
    return { message: "잘못된 요청입니다." };
  }

  const result = await saveCreditOffer({
    seasonId: gate.seasonId,
    kind,
    status,
    sponsorId: orNull(formData.get("sponsorId")),
    unlockEvent,
    deliveryMethod,
    releaseDate: toDate(formData.get("releaseDate")),
    validUntil: toDate(formData.get("validUntil")),
    inviteUrl: orNull(formData.get("inviteUrl")),
    description: orNull(formData.get("description")),
    value: orNull(formData.get("value")),
    fallbackUrl: orNull(formData.get("fallbackUrl")),
    reason: String(formData.get("reason") ?? ""),
    actorId: gate.actorId,
  });
  if (!result.ok) return { message: result.message };

  revalidatePath("/admin/sponsors");
  revalidatePath("/dashboard/credits");
  return { done: "저장했습니다." };
}

export async function uploadCodes(
  _prev: SponsorActionState,
  formData: FormData,
): Promise<SponsorActionState> {
  const gate = await guard();
  if ("error" in gate) return { message: gate.error };

  const offerId = String(formData.get("offerId") ?? "");
  if (!offerId) return { message: "잘못된 요청입니다." };

  /* 줄바꿈·쉼표 아무거나 받는다. 스폰서가 보내는 모양이 매번 다르다 */
  const codes = String(formData.get("codes") ?? "")
    .split(/[\r\n,;]+/)
    .map((c) => c.trim())
    .filter(Boolean);

  const result = await uploadCreditCodes({
    offerId,
    codes,
    reason: String(formData.get("reason") ?? ""),
    actorId: gate.actorId,
  });
  if (!result.ok) return { message: result.message };

  revalidatePath("/admin/sponsors");
  return {
    done: `${result.added ?? 0}개를 올렸습니다. 중복은 건너뛰었습니다.`,
  };
}

export async function deliverManually(
  _prev: SponsorActionState,
  formData: FormData,
): Promise<SponsorActionState> {
  const gate = await guard();
  if ("error" in gate) return { message: gate.error };

  const offerId = String(formData.get("offerId") ?? "");
  const entryId = String(formData.get("entryId") ?? "");
  if (!offerId || !entryId) return { message: "잘못된 요청입니다." };

  const result = await deliverCreditManually({
    offerId,
    entryId,
    reason: String(formData.get("reason") ?? ""),
    actorId: gate.actorId,
  });
  if (!result.ok) return { message: result.message };

  revalidatePath("/admin/sponsors");
  revalidatePath("/dashboard/credits");
  return { done: "발급 완료로 바꿨습니다." };
}
