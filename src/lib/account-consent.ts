import { ConsentType } from "@/generated/prisma/enums";
import {
  ACCOUNT_MARKETING_CONSENT_VERSION,
  ACCOUNT_PRIVACY_CONSENT_VERSION,
  ACCOUNT_TERMS_CONSENT_VERSION,
} from "@/content/consent";
import { prisma } from "@/lib/prisma";

/*
  계정 단위 동의 — 시안 ver4 `#scr-auth`의 ② 「콜백 뒤 동의 모달」.

  ver3까지는 가입 화면에서 소셜 버튼을 누르기 **전에** 체크를 받았다. 그 방식은
  OAuth 왕복을 건너 동의를 실어 나를 길이 없어 **기록이 남지 않았다**(content/consent.ts의
  옛 경고). ver4는 순서를 뒤집어 인증을 먼저 끝내고, 계정이 생긴 뒤 모달로 받는다 —
  userId가 이미 있으니 그대로 `consents`에 쌓인다.

  ⚠️ **참가 동의(`/apply`)와 다른 층이다.** 참가 동의는 `entryId`가 붙고(시즌마다
  다시 받는다), 계정 동의는 `entryId`가 null이다. 둘을 섞으면 "시즌2에 참가하지 않은
  회원"이 계정 동의까지 잃은 것으로 읽힌다.
*/

/**
 * 계정 동의에서 **반드시** 받아야 하는 종류와 그 현재 버전.
 *
 * 만 14세 확인은 여기 없다 — 이유는 `AGE_IS_A_GATE_NOT_A_RECORD` 주석 참고.
 */
const REQUIRED: { type: ConsentType; version: string }[] = [
  { type: ConsentType.terms, version: ACCOUNT_TERMS_CONSENT_VERSION },
  { type: ConsentType.privacy, version: ACCOUNT_PRIVACY_CONSENT_VERSION },
];

/*
  ⚠️ **만 14세 확인은 저장하지 않는다**(AGE_IS_A_GATE_NOT_A_RECORD).

  `ConsentType`에 `age`가 없다. 사전 신청도 같다 — `leads` 표에 나이 확인 칸이
  없고 `privacy_consent_at`·`marketing_opt_in`만 있다. 즉 이 제품에서 나이 확인은
  **통과 조건**이지 보관하는 동의 기록이 아니다.

  시안 개발 메모는 저장 항목에 「만 14세 확인」을 적었다. 그대로 하려면 enum에
  값을 더해야 하는데 그건 마이그레이션이라 이번 패스에서 하지 않았다. 필수 셋을
  모두 체크해야만 저장이 일어나므로, 계정 동의 행이 있다는 것 자체가 그 시점에
  나이 확인을 받았다는 뜻이 된다 — 다만 그 해석은 코드를 읽어야 나온다.
*/

/** "v1.2" → [1, 2]. 비교할 수 없는 값은 [-1]로 떨어뜨려 항상 재동의시킨다. */
function parseVersion(value: string | null): number[] {
  if (!value) return [-1];
  const body = value.startsWith("v") ? value.slice(1) : value;
  const parts = body.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length === 0 || parts.some(Number.isNaN)) return [-1];
  return parts;
}

/** a가 b보다 낮은가. 자릿수가 달라도 맞춰 본다(v1 < v1.1). */
function isOlderThan(a: string | null, b: string): boolean {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l !== r) return l < r;
  }
  return false;
}

export type AccountConsentNeed = {
  /** 모달을 띄워야 하는가 */
  needed: boolean;
  /**
   * 재동의인가(문안 개정). 처음 가입과 문장이 달라야 한다 —
   * 「한 번만 받아요」를 개정 때 그대로 쓰면 거짓말이 된다.
   */
  reconsent: boolean;
  /** 모달 머리의 계정 표시용. 어느 소셜로 들어왔는지 */
  provider: "kakao" | "google" | null;
  /** 마스킹한 이메일. 원문을 그대로 그리지 않는다 */
  maskedEmail: string;
};

/**
 * 이메일을 시안 표기(`yoon***@gmail.com`)로 가린다.
 *
 * 로컬 파트의 앞 네 글자까지만 남긴다. 네 글자보다 짧으면 첫 글자만 남겨
 * 짧은 주소가 통째로 드러나지 않게 한다.
 */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const keep = local.length > 4 ? 4 : 1;
  return `${local.slice(0, keep)}***${domain}`;
}

/**
 * 이 사람에게 동의 모달을 띄워야 하는가.
 *
 * 띄우는 조건은 시안 개발 메모 그대로다 — 기록이 아예 없거나, 기록된 버전이
 * 현재 문안보다 낮을 때. 기존 회원은 통과한다.
 *
 * ⚠️ 철회(`granted=false`)도 "기록 없음"과 같게 본다. `consents`는 append-only라
 * 철회 뒤에는 granted=false 행이 마지막에 쌓이는데, 그 상태로 서비스를 계속 쓰게
 * 두면 동의 없이 이용하는 계정이 생긴다.
 */
export async function loadAccountConsentNeed(
  userId: string,
): Promise<AccountConsentNeed> {
  const [rows, oauth, user] = await Promise.all([
    /*
      계정 동의만 본다(entryId: null). 참가 동의가 있어도 계정 동의를 대신하지
      못한다 — 받은 문안이 다르다.
    */
    prisma.consent.findMany({
      where: {
        userId,
        entryId: null,
        type: { in: REQUIRED.map((r) => r.type) },
      },
      orderBy: { createdAt: "desc" },
      select: { type: true, granted: true, version: true },
    }),
    prisma.oauthAccount.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { provider: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
  ]);

  /* 종류마다 가장 최근 것 하나만 본다. 조회가 createdAt 내림차순이라 첫 행이다. */
  const latest = new Map<ConsentType, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latest.has(row.type)) latest.set(row.type, row);
  }

  let missing = false;
  let stale = false;
  for (const need of REQUIRED) {
    const row = latest.get(need.type);
    if (!row || !row.granted) {
      missing = true;
      continue;
    }
    if (isOlderThan(row.version, need.version)) stale = true;
  }

  const provider =
    oauth?.provider === "kakao" || oauth?.provider === "google"
      ? oauth.provider
      : null;

  return {
    needed: missing || stale,
    /* 빠진 것 없이 버전만 낮으면 재동의다 */
    reconsent: !missing && stale,
    provider,
    maskedEmail: user?.email ? maskEmail(user.email) : "",
  };
}

/**
 * 동의 모달에서 받은 값을 `consents`에 쌓는다.
 *
 * 덮어쓰지 않고 행을 더한다 — "그때 무엇에 동의했는지"가 사라지면 입증이 불가능해진다
 * (apply-store.ts의 같은 판단).
 */
export function accountConsentRows(args: {
  userId: string;
  marketing: boolean;
  ipHash: string | null;
  userAgent: string | null;
}) {
  const base = {
    userId: args.userId,
    /* 계정 동의라 참가에 붙이지 않는다 */
    entryId: null,
    ipHash: args.ipHash,
    userAgent: args.userAgent,
  };

  return [
    {
      ...base,
      type: ConsentType.terms,
      granted: true,
      version: ACCOUNT_TERMS_CONSENT_VERSION,
    },
    {
      ...base,
      type: ConsentType.privacy,
      granted: true,
      version: ACCOUNT_PRIVACY_CONSENT_VERSION,
    },
    /*
      선택 항목은 거부도 기록한다. "물어봤고 아니라고 했다"가 남아야 나중에
      마케팅 발송 대상에서 왜 빠졌는지 설명할 수 있다(D5의 증빙).
    */
    {
      ...base,
      type: ConsentType.marketing,
      granted: args.marketing,
      version: ACCOUNT_MARKETING_CONSENT_VERSION,
    },
  ];
}
