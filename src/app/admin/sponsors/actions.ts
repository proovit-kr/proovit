"use server";

import { revalidatePath } from "next/cache";

import {
  CreditDelivery,
  CreditKind,
  CreditOfferStatus,
  CreditUnlockEvent,
} from "@/generated/prisma/enums";
import { canAccess, getSessionUser, loadAccessContext, loadViewerState } from "@/lib/access";
import {
  batchDeliverCredits,
  deliverCreditManually,
  saveCreditOffer,
  setCreditOfferStatus,
  setSponsorLogo,
  uploadCreditCodes,
} from "@/lib/admin-store";
import { noticeCreditDelivered } from "@/lib/credits-store";
import { evidenceStorage } from "@/lib/evidence-storage";

/*
  스폰서 크레딧 쓰기 — 혜택 저장·상태 전환·로고 교체·코드 풀 업로드·수동 발급·일괄 발송.

  ⚠️ 전부 판정을 다시 한다. 화면이 버튼을 안 그렸다는 사실은 아무것도 막지
  않는다(admin/entries/actions.ts와 같은 규칙). enum은 값 목록에 대조해서 통과한
  것만 쓴다.
*/

export type SponsorActionState = { message?: string; done?: number };

function toEnum<T extends Record<string, string>>(values: T, raw: unknown): T[keyof T] | null {
  const value = String(raw ?? "");
  return (Object.values(values) as string[]).includes(value) ? (value as T[keyof T]) : null;
}

/** 비어 있으면 null. 빈 문자열을 DB에 넣으면 "없음"과 ""가 갈린다 */
function orNull(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  return value === "" ? null : value;
}

/** YYYY-MM-DD. 잘못된 값은 null로 떨어뜨린다 */
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

const done = () => {
  revalidatePath("/", "layout");
  return { done: Date.now() };
};

export async function saveOffer(_prev: SponsorActionState, formData: FormData): Promise<SponsorActionState> {
  const gate = await guard();
  if ("error" in gate) return { message: gate.error };

  const kind = toEnum(CreditKind, formData.get("kind"));
  const status = toEnum(CreditOfferStatus, formData.get("status"));
  const unlockEvent = toEnum(CreditUnlockEvent, formData.get("unlockEvent"));
  const deliveryMethod = toEnum(CreditDelivery, formData.get("deliveryMethod"));
  if (!kind || !status || !unlockEvent || !deliveryMethod) return { message: "잘못된 요청입니다." };

  const result = await saveCreditOffer({
    seasonId: gate.seasonId,
    kind,
    status,
    sponsorName: orNull(formData.get("sponsorName")),
    unlockEvent,
    deliveryMethod,
    releaseDate: toDate(formData.get("releaseDate")),
    validUntil: toDate(formData.get("validUntil")),
    inviteUrl: orNull(formData.get("inviteUrl")),
    howtoUrl: orNull(formData.get("howtoUrl")),
    redeemNote: orNull(formData.get("redeemNote")),
    description: orNull(formData.get("description")),
    value: orNull(formData.get("value")),
    fallbackUrl: orNull(formData.get("fallbackUrl")),
    reason: String(formData.get("reason") ?? ""),
    actorId: gate.actorId,
  });
  return result.ok ? done() : { message: result.message };
}

export async function changeOfferStatus(_prev: SponsorActionState, formData: FormData): Promise<SponsorActionState> {
  const gate = await guard();
  if ("error" in gate) return { message: gate.error };
  const status = toEnum(CreditOfferStatus, formData.get("status"));
  const offerId = String(formData.get("offerId") ?? "");
  if (!status || !offerId) return { message: "잘못된 요청입니다." };
  const result = await setCreditOfferStatus({
    offerId, status, reason: String(formData.get("reason") ?? ""), actorId: gate.actorId,
  });
  return result.ok ? done() : { message: result.message };
}

const LOGO_TYPES: Record<string, string> = {
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function uploadLogo(_prev: SponsorActionState, formData: FormData): Promise<SponsorActionState> {
  const gate = await guard();
  if ("error" in gate) return { message: gate.error };
  const offerId = String(formData.get("offerId") ?? "");
  const file = formData.get("logo");
  if (!offerId || !(file instanceof File) || file.size === 0) return { message: "로고 파일을 골라 주세요." };
  const ext = LOGO_TYPES[file.type];
  if (!ext) return { message: "svg·png·jpg·webp만 올릴 수 있습니다." };
  if (file.size > 1024 * 1024) return { message: "로고는 1MB까지입니다." };
  const storage = evidenceStorage();
  if (!storage) return { message: "파일 저장소가 연결되지 않았습니다." };
  const key = `sponsor/logo/${crypto.randomUUID()}.${ext}`;
  await storage.put(key, new Uint8Array(await file.arrayBuffer()), file.type);
  const result = await setSponsorLogo({ offerId, key, filename: file.name, actorId: gate.actorId });
  return result.ok ? done() : { message: result.message };
}

export async function uploadCodes(_prev: SponsorActionState, formData: FormData): Promise<SponsorActionState> {
  const gate = await guard();
  if ("error" in gate) return { message: gate.error };
  const offerId = String(formData.get("offerId") ?? "");
  if (!offerId) return { message: "잘못된 요청입니다." };

  /* CSV 파일이든 붙여 넣은 글이든 받는다. 줄바꿈·쉼표 아무거나 — 스폰서가 보내는 모양이 매번 다르다 */
  const file = formData.get("csv");
  const raw =
    file instanceof File && file.size > 0 ? await file.text() : String(formData.get("codes") ?? "");
  const codes = raw.split(/[\r\n,;]+/).map((c) => c.trim()).filter(Boolean);

  const result = await uploadCreditCodes({
    offerId, codes, reason: String(formData.get("reason") ?? ""), actorId: gate.actorId,
  });
  return result.ok ? done() : { message: result.message };
}

export async function deliverManually(_prev: SponsorActionState, formData: FormData): Promise<SponsorActionState> {
  const gate = await guard();
  if ("error" in gate) return { message: gate.error };
  const offerId = String(formData.get("offerId") ?? "");
  const entryId = String(formData.get("entryId") ?? "");
  if (!offerId || !entryId) return { message: "잘못된 요청입니다." };
  const result = await deliverCreditManually({
    offerId, entryId, reason: String(formData.get("reason") ?? ""), actorId: gate.actorId,
  });
  return result.ok ? done() : { message: result.message };
}

/**
 * 일괄 발송 — 발급한 뒤 팀원에게 인앱 알림과 메일을 보낸다(메일은 트랜잭션 밖).
 * 대상 팀은 화면이 보낸 목록을 믿지 않고 다시 고른다 — 그 카드가 「발급 가능」인 팀.
 */
export async function batchDeliver(_prev: SponsorActionState, formData: FormData): Promise<SponsorActionState> {
  const gate = await guard();
  if ("error" in gate) return { message: gate.error };
  const offerId = String(formData.get("offerId") ?? "");
  const requested = String(formData.get("entryIds") ?? "").split(",").filter(Boolean);

  const { loadAdminCreditConsole } = await import("@/lib/credits-store");
  const view = await loadAdminCreditConsole(gate.seasonId);
  const offer = view.offers.find((o) => o.id === offerId);
  if (!offer) return { message: "혜택을 찾을 수 없습니다." };
  const allowed = new Set(
    view.claims
      .filter((r) => r.cells.some((c) => c.kind === offer.kind && c.available))
      .map((r) => r.entryId),
  );
  const entryIds = requested.filter((id) => allowed.has(id));

  const result = await batchDeliverCredits({ offerId, entryIds, actorId: gate.actorId });
  if (!result.ok) return { message: result.message };

  /* 발급 예정(C1은 게이트 1 전)은 지금 알리지 않는다 — 보낼 때 알린다 */
  const { mailFailed } = await noticeCreditDelivered({
    offerId,
    deliveries: result.delivered.filter((d) => !d.scheduled),
  });
  const failedTeams = view.claims
    .filter((r) => mailFailed.includes(r.entryId))
    .map((r) => r.teamName);

  revalidatePath("/", "layout");
  const notes = [
    result.soldOut ? "코드 풀이 비어 일부 팀은 보내지 못했습니다." : null,
    failedTeams.length ? `메일을 보내지 못한 팀: ${failedTeams.join(", ")}.` : null,
  ].filter(Boolean);
  return { done: Date.now(), ...(notes.length ? { message: notes.join(" ") } : {}) };
}
