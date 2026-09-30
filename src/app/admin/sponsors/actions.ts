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
import { parseCodeList } from "@/lib/credits";
import { noticeCreditDelivered } from "@/lib/credits-store";
import { evidenceStorage } from "@/lib/evidence-storage";

/*
  스폰서 크레딧 쓰기 — 혜택 저장·상태 전환·로고 교체·코드 풀 업로드·수동 발급·일괄 발송.

  ⚠️ 전부 판정을 다시 한다. 화면이 버튼을 안 그렸다는 사실은 아무것도 막지
  않는다(admin/entries/actions.ts와 같은 규칙). enum은 값 목록에 대조해서 통과한
  것만 쓴다.
*/

/**
 * `message`는 실패(모달 안에 뜬다), `notice`는 끝난 뒤 알릴 것(모달이 닫힌 자리에
 * 뜬다 — 일괄 발송이 일부만 됐거나 메일이 실패한 것 같은). 전에는 둘 다 `message`라
 * 모달이 닫히면서 안내가 같이 사라졌다(2026-09-30 감사).
 */
export type SponsorActionState = {
  message?: string;
  notice?: string;
  /** `notice`가 어느 카드의 것인가 — 다른 카드로 옮기면 안 보인다 */
  noticeFor?: string;
  done?: number;
};

function toEnum<T extends Record<string, string>>(values: T, raw: unknown): T[keyof T] | null {
  const value = String(raw ?? "");
  return (Object.values(values) as string[]).includes(value) ? (value as T[keyof T]) : null;
}

/** 비어 있으면 null. 빈 문자열을 DB에 넣으면 "없음"과 ""가 갈린다 */
function orNull(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  return value === "" ? null : value;
}

/**
 * 날짜 칸 — 「2026-10-12」. 점·빗금(「2026.10.12」)도 받는다. 있는 날짜인지 되짚는다
 * (「02-30」은 거절). 비었으면 null, 틀렸으면 거절한다 — 전에는 틀린 값을 조용히
 * null로 떨어뜨려 지급 예정일이 사라지고 코드가 곧바로 나갔다(2026-09-30 감사).
 */
function parseDay(raw: unknown): { ok: true; value: Date | null } | { ok: false } {
  const value = String(raw ?? "").trim();
  if (!value) return { ok: true, value: null };
  const m = value.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (!m) return { ok: false };
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    return { ok: false };
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return { ok: true, value: new Date(`${y}-${pad(mo)}-${pad(d)}T00:00:00+09:00`) };
}

async function guard() {
  const user = await getSessionUser();
  if (!user) return { error: "로그인이 풀렸습니다." } as const;
  const permission = canAccess("adminSponsors", await loadAccessContext());
  if (!permission.ok) return { error: permission.message } as const;
  const viewer = await loadViewerState();
  if (!viewer.season) return { error: "현재 시즌이 없습니다." } as const;
  return {
    actorId: user.id,
    seasonId: viewer.season.id,
    creditsOn: viewer.season.flags.credits,
  } as const;
}

/*
  크레딧 센터(credits)가 꺼져 있으면 참가자의 혜택 화면이 404다 — 보내도 팀은 코드를
  못 보고, 알림·메일의 링크도 404로 간다. 보내기 전에 막는다.
*/
const CREDITS_OFF =
  "크레딧 센터(credits)가 꺼져 있어 참가자가 받은 코드를 볼 수 없습니다. 시즌 관리에서 켠 뒤 보내 주세요.";

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

  const releaseDate = parseDay(formData.get("releaseDate"));
  const validUntil = parseDay(formData.get("validUntil"));
  if (!releaseDate.ok) return { message: "releaseDate는 2026-10-12처럼 적어 주세요." };
  if (!validUntil.ok) return { message: "validUntil은 2026-11-30처럼 적어 주세요." };
  if (releaseDate.value && validUntil.value && validUntil.value < releaseDate.value) {
    return { message: "validUntil이 releaseDate보다 앞입니다." };
  }

  const result = await saveCreditOffer({
    seasonId: gate.seasonId,
    /* 「등록」 카드는 새로 만들 때만 저장한다 — 있는 카드를 빈 값으로 덮지 않게 */
    mode: formData.get("mode") === "create" ? "create" : "edit",
    kind,
    status,
    sponsorName: orNull(formData.get("sponsorName")),
    unlockEvent,
    deliveryMethod,
    releaseDate: releaseDate.value,
    validUntil: validUntil.value,
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

  /* CSV 파일이든 붙여 넣은 글이든 받는다 — 모양은 credits.ts `parseCodeList`가 가린다 */
  const file = formData.get("csv");
  const raw =
    file instanceof File && file.size > 0 ? await file.text() : String(formData.get("codes") ?? "");
  const parsed = parseCodeList(raw);
  if (!parsed.ok) return { message: parsed.message };

  const result = await uploadCreditCodes({
    offerId, codes: parsed.codes, reason: String(formData.get("reason") ?? ""), actorId: gate.actorId,
  });
  if (!result.ok) return { message: result.message };
  const unique = new Set(parsed.codes).size;
  const added = result.added ?? 0;
  return {
    ...done(),
    noticeFor: offerId,
    notice:
      `코드 ${added}건을 올렸습니다.` +
      (unique > added ? ` 이미 있던 ${unique - added}건은 건너뛰었습니다.` : ""),
  };
}

export async function deliverManually(_prev: SponsorActionState, formData: FormData): Promise<SponsorActionState> {
  const gate = await guard();
  if ("error" in gate) return { message: gate.error };
  if (!gate.creditsOn) return { message: CREDITS_OFF };
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
  if (!gate.creditsOn) return { message: CREDITS_OFF };
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
  const sent = result.delivered.filter((d) => !d.scheduled).length;
  const later = result.delivered.length - sent;
  /* 예정이 언제 나가는지는 카드마다 다르다 — C1은 그 팀의 게이트 1, 그 밖은 지급 예정일 */
  const when = offer.kind === CreditKind.c1 ? "게이트 1이 가려지면" : "지급 예정일에";
  const notes = [
    `${sent}팀에 보냈습니다.`,
    later ? `${later}팀은 발급 예정으로 적었습니다(${when} 나갑니다).` : null,
    result.soldOut
      ? result.delivered.length === 0
        ? "코드 풀이 비어 보내지 못했습니다."
        : "코드 풀이 비어 나머지 팀은 보내지 못했습니다."
      : null,
    failedTeams.length ? `메일을 보내지 못한 팀: ${failedTeams.join(", ")}.` : null,
  ].filter(Boolean);
  return { done: Date.now(), notice: notes.join(" ") };
}
