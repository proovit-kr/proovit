/*
  운영자 화면의 **순수** 절반. DB도 세션도 모른다 — 클라이언트 컴포넌트가 읽는다.

  ⚠️ 이 파일이 따로 있는 이유는 취향이 아니라 강제다. 상수 하나를 admin-store.ts에
  두고 폼(클라이언트)에서 가져왔더니 그쪽이 prisma를 import하는 바람에
  `node:module`이 브라우저 번들에 딸려가 **운영자 화면 셋이 통째로 500**이 났다.
  access-policy.ts / access.ts를 가른 것과 같은 이유다.
*/

/**
 * 사유 최소 길이.
 *
 * 형식적으로 채운 한 글자는 근거가 못 된다. 실격·페이즈 전환은 나중에 반드시
 * "왜 그랬냐"를 묻게 되고, 그때 답이 되는 문장이어야 한다.
 */
export const REASON_MIN = 5;

/**
 * 이메일 가림 — 시안 리드 표(3120행) 「y***@g***.com」.
 * 앞 한 글자와 도메인 첫 글자, 마지막 점 뒤(최상위 도메인)만 남긴다.
 * 운영자 화면에서도 주소 전체를 띄우지 않는다 — 어깨 너머와 화면 공유로 새는 길을 막는다.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  return `${local[0]}***@${host[0] ?? ""}***${tld}`;
}

/*
  「페이즈 일정」 칸의 `<input type="datetime-local">` 값 — 「2026-10-28T00:00」.

  이 값에는 시간대가 없다. 브라우저 시간대로 읽으면 해외에서 연 운영자가 저장한
  시각이 몇 시간씩 밀리므로 **언제나 KST(+09:00)로 읽고 쓴다.** 마감과 개막은
  한국 시각으로 공지된다(header-state.ts 시각 표기와 같은 기준).
*/
const KST_INPUT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** 날짜 → 「2026-10-28T00:00」(KST) */
export function kstInputValue(date: Date): string {
  const p: Record<string, string> = {};
  for (const { type, value } of KST_INPUT.formatToParts(date)) p[type] = value;
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * 「2026-10-28T00:00」 → KST로 읽은 날짜. 모양이 틀리거나 없는 날이면 null.
 *
 * ⚠️ `new Date("2026-02-30T00:00+09:00")`은 오류 없이 3월 2일이 된다. 되돌려
 * 적어 같은지 한 번 더 본다.
 */
export function parseKstInput(value: string): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::00)?$/.exec(value.trim());
  if (!m) return null;
  const at = new Date(`${m[1]}:00+09:00`);
  if (Number.isNaN(at.getTime())) return null;
  return kstInputValue(at) === m[1] ? at : null;
}
