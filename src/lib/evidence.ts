import type { StageKey } from "@/generated/prisma/enums";

/*
  증빙 파일의 **순수** 규칙 — 키의 모양, 받는 종류와 크기, 이름 다듬기. 화면
  (클라이언트)과 서버가 함께 읽는다. 저장·읽기는 evidence-storage.ts에 있다.

  파일 하나가 키 하나다: `{entryId}/{stageKey}/{slot}/{id}-{name}`.
    · 누구 것인지(entryId)·어느 판(stageKey)·어느 칸(slot)이 키에 박혀 있어
      표가 따로 없다. 제출 행의 `evidence_urls`가 그 행이 가진 키의 전부다.
    · 올릴 때 서버가 키를 만들고, 저장할 때 서버가 접두사를 다시 본다 — 남의
      팀 키나 다른 판의 키는 폼에 실어 보내도 저장되지 않는다(submission-store.ts).
    · 화면은 키로 `/api/evidence/{key}`를 연다. 공개 주소가 없다 — 증빙은 팀과
      운영자만 본다.

  ⚠️ 증빙은 **지표의 근거가 아니다**(PLN5 §8, 스키마 주석). 심사가 눈으로 확인하는
  자료일 뿐이고 숫자는 서버 집계가 유일한 근거다.
*/

/** 시안 s1 「PDF, 이미지, 10MB 이하」 */
export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
/** 칸 하나에 올릴 수 있는 파일 수 — 시안 칩이 둘이라 여유를 뒀다(내가 정함, 2026-09-22) */
export const EVIDENCE_COUNT_MAX = 5;
export const EVIDENCE_NAME_MAX = 80;
export const EVIDENCE_KEY_MAX = 300;

/** 칸 — 증빙 파일(모든 판), 문제 정의 상세의 파일(s1) */
export const EVIDENCE_SLOTS = ["evidence", "problem"] as const;
export type EvidenceSlot = (typeof EVIDENCE_SLOTS)[number];
export function isEvidenceSlot(value: string): value is EvidenceSlot {
  return (EVIDENCE_SLOTS as readonly string[]).includes(value);
}

/** 받는 종류. 확장자는 저장할 때 종류에 맞춰 붙인다 — Content-Type을 안 믿는다 */
export const EVIDENCE_KINDS = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
} as const;
export type EvidenceKind = keyof typeof EVIDENCE_KINDS;
/** `<input type="file" accept>` */
export const EVIDENCE_ACCEPT = Object.values(EVIDENCE_KINDS).join(",");

const has = (bytes: Uint8Array, at: number, sig: number[]) =>
  sig.every((b, i) => bytes[at + i] === b);

/** 첫 바이트로 종류를 본다. 브라우저가 준 MIME은 이름만 보고 붙인 값이라 안 믿는다 */
export function sniffKind(bytes: Uint8Array): EvidenceKind | null {
  if (has(bytes, 0, [0x25, 0x50, 0x44, 0x46])) return "pdf"; // %PDF
  if (has(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (has(bytes, 0, [0xff, 0xd8, 0xff])) return "jpg";
  if (has(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && has(bytes, 8, [0x57, 0x45, 0x42, 0x50])) {
    return "webp"; // RIFF….WEBP
  }
  if (has(bytes, 0, [0x47, 0x49, 0x46, 0x38])) return "gif"; // GIF8
  return null;
}

/** 확장자로 종류를 본다 — 저장된 키를 내보낼 때 Content-Type을 고르는 용도 */
export function kindOfName(name: string): EvidenceKind | null {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext === "jpeg") return "jpg";
  return ext && ext in EVIDENCE_KINDS ? (ext as EvidenceKind) : null;
}

/* 경로 구분자·제어 문자·주소에서 뜻이 있는 글자 */
const UNSAFE = /[\\/\x00-\x1f\x7f%#?]+/g;

/**
 * 올린 이름을 키에 넣을 수 있게 다듬는다 — 경로 문자·제어 문자를 빼고, 길이를
 * 자르고, 확장자는 **실제 종류**로 바꿔 단다(`.png`라 해 놓고 PDF인 파일).
 */
export function safeFileName(name: string, kind: EvidenceKind): string {
  const base = name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(UNSAFE, "")
    .trim()
    .slice(0, EVIDENCE_NAME_MAX);
  return `${base || "file"}.${kind}`;
}

export type EvidenceKeyParts = {
  entryId: string;
  stageKey: StageKey;
  slot: EvidenceSlot;
  id: string;
  name: string;
};

export function evidencePrefix(entryId: string, stageKey: StageKey, slot?: EvidenceSlot) {
  return slot ? `${entryId}/${stageKey}/${slot}/` : `${entryId}/${stageKey}/`;
}

export function buildEvidenceKey(parts: EvidenceKeyParts): string {
  return `${evidencePrefix(parts.entryId, parts.stageKey, parts.slot)}${parts.id}-${parts.name}`;
}

const KEY_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(s[1-5])\/(evidence|problem)\/([0-9a-f]{32})-([^/]+)$/;

/** 키를 조각으로. 모양이 다르면 null — 위조된 키는 여기서 걸린다 */
export function parseEvidenceKey(key: string): EvidenceKeyParts | null {
  if (key.length > EVIDENCE_KEY_MAX) return null;
  const m = key.match(KEY_RE);
  if (!m) return null;
  return {
    entryId: m[1],
    stageKey: m[2] as StageKey,
    slot: m[3] as EvidenceSlot,
    id: m[4],
    name: m[5],
  };
}

/** 칩에 그릴 이름 — 시안 「📎 problem-definition.pdf」 */
export function evidenceName(key: string): string {
  return parseEvidenceKey(key)?.name ?? key.split("/").pop() ?? key;
}

/** 화면이 여는 주소. 키의 각 조각을 따로 인코딩한다(한글 이름) */
export function evidenceHref(key: string): string {
  return `/api/evidence/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/** 제출 행의 키들을 칸별로 가른다 */
export function splitEvidence(keys: readonly string[]): Record<EvidenceSlot, string[]> {
  const out: Record<EvidenceSlot, string[]> = { evidence: [], problem: [] };
  for (const key of keys) {
    const parsed = parseEvidenceKey(key);
    if (parsed) out[parsed.slot].push(key);
  }
  return out;
}

/** 이 참가 기록·이 판의 것이 아닌 키. 하나라도 있으면 저장을 거부한다 */
export function foreignEvidence(
  keys: readonly string[],
  entryId: string,
  stageKey: StageKey,
): string[] {
  const prefix = evidencePrefix(entryId, stageKey);
  return keys.filter((key) => !parseEvidenceKey(key) || !key.startsWith(prefix));
}
