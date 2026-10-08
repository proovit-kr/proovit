import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    consent: { findMany: vi.fn() },
    oauthAccount: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

import { ConsentSource, ConsentType } from "@/generated/prisma/enums";
import { ACCOUNT_AGE_CONSENT_VERSION, ACCOUNT_PRIVACY_CONSENT_VERSION, ACCOUNT_TERMS_CONSENT_VERSION } from "@/content/consent";
import { accountConsentRows, loadAccountConsentNeed } from "@/lib/account-consent";
import { canAccess } from "@/lib/access-policy";
import { prisma } from "@/lib/prisma";

const args = { userId: "user-1", marketing: false, ageConfirmed: true as const, ipHash: "hash", userAgent: "browser" };
const current = [
  { type: ConsentType.terms, granted: true, version: ACCOUNT_TERMS_CONSENT_VERSION, source: null },
  { type: ConsentType.privacy, granted: true, version: ACCOUNT_PRIVACY_CONSENT_VERSION, source: null },
  { type: ConsentType.age, granted: true, version: ACCOUNT_AGE_CONSENT_VERSION, source: ConsentSource.self_declaration },
];

function mockRows(rows: { type: ConsentType; granted: boolean; version: string; source: ConsentSource | null }[]) {
  vi.mocked(prisma.consent.findMany).mockResolvedValue(rows as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRows(current);
  vi.mocked(prisma.oauthAccount.findFirst).mockResolvedValue({ provider: "google" } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: "tester@example.com" } as never);
});

describe("연령 직접 확인 기록", () => {
  it("별도의 버전·방식이 있는 age 행을 남기고 불필요한 접속 증빙은 받지 않는다", () => {
    expect(accountConsentRows(args)).toHaveLength(4);
    expect(accountConsentRows(args).find((r) => r.type === ConsentType.age)).toEqual({
      userId: "user-1", entryId: null, type: ConsentType.age, granted: true,
      version: ACCOUNT_AGE_CONSENT_VERSION, source: ConsentSource.self_declaration, ipHash: null, userAgent: null,
    });
  });
  it("실행 중 false가 들어오면 기록을 만들지 않는다", () => {
    expect(() => accountConsentRows({ ...args, ageConfirmed: false as unknown as true })).toThrow();
  });
  it("개발용 동의는 실제 사용자 확인과 구분한다", () => {
    expect(accountConsentRows({ ...args, ageSource: ConsentSource.dev_fixture }).find((r) => r.type === ConsentType.age)?.source).toBe(ConsentSource.dev_fixture);
  });
  it("마케팅 거부도 별도로 기록한다", () => {
    expect(accountConsentRows(args).find((r) => r.type === ConsentType.marketing)?.granted).toBe(false);
  });
});

describe("계정 동의 관문", () => {
  it("신규 회원은 처음 동의를 받는다", async () => {
    mockRows([]);
    expect(await loadAccountConsentNeed("user-1")).toMatchObject({ needed: true, reconsent: false, provider: "google" });
  });
  it("과거 약관 동의를 연령 확인으로 소급하지 않는다", async () => {
    mockRows(current.slice(0, 2));
    expect(await loadAccountConsentNeed("user-1")).toMatchObject({ needed: true, reconsent: true });
  });
  it("현재 필수 동의와 연령 확인이 있으면 통과한다", async () => {
    expect(await loadAccountConsentNeed("user-1")).toMatchObject({ needed: false, reconsent: false });
  });
  it("방식 없는 연령 기록은 다시 확인받는다", async () => {
    mockRows(current.map((r) => ({ ...r, source: null })));
    expect((await loadAccountConsentNeed("user-1")).needed).toBe(true);
  });
  it("가장 최근의 연령 철회를 반영한다", async () => {
    mockRows([{ ...current[2], granted: false }, ...current]);
    expect((await loadAccountConsentNeed("user-1")).needed).toBe(true);
  });
  it("낡은 연령 문안은 재확인받는다", async () => {
    mockRows(current.map((r) => r.type === ConsentType.age ? { ...r, version: "v0.1" } : r));
    expect(await loadAccountConsentNeed("user-1")).toMatchObject({ needed: true, reconsent: true });
  });
  it("계정 동의만 조회한다", async () => {
    await loadAccountConsentNeed("user-1");
    expect(prisma.consent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1", entryId: null, type: { in: [ConsentType.terms, ConsentType.privacy, ConsentType.age] } },
    }));
  });
});

describe("동의 전 서버 접근 차단", () => {
  const ctx = { user: { id: "user-1", onboarded: true, isAdmin: true, accountConsentComplete: false }, season: null, entry: null };
  it("대시보드와 운영 콘솔의 직접 접근을 차단한다", () => {
    expect(canAccess("dashboard", ctx)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(canAccess("admin", ctx)).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
  it("공개 화면과 탈퇴·로그아웃용 계정 설정은 남겨 둔다", () => {
    expect(canAccess("landing", ctx)).toEqual({ ok: true });
    expect(canAccess("settings", ctx)).toEqual({ ok: true });
  });
});
