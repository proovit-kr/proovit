import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("조회키 암호화", () => {
  const before = { p: process.env.PAYMENT_KEY_SECRET, a: process.env.AUTH_SECRET };
  beforeEach(() => {
    process.env.PAYMENT_KEY_SECRET = "test-secret-1";
  });
  afterEach(() => {
    process.env.PAYMENT_KEY_SECRET = before.p;
    process.env.AUTH_SECRET = before.a;
  });

  it("잠근 것을 풀면 같고, 잠근 값에 평문이 없다", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/payment-crypto");
    const enc = encryptSecret("sk_live_abcdef123456");
    expect(enc.startsWith("v1.")).toBe(true);
    expect(enc).not.toContain("abcdef");
    expect(decryptSecret(enc)).toBe("sk_live_abcdef123456");
  });

  it("같은 평문도 매번 다르게 잠긴다(iv)", async () => {
    const { encryptSecret } = await import("@/lib/payment-crypto");
    expect(encryptSecret("sk_live_abcdef123456")).not.toBe(encryptSecret("sk_live_abcdef123456"));
  });

  it("키가 바뀌면 못 풀고 null이다", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/payment-crypto");
    const enc = encryptSecret("sk_live_abcdef123456");
    process.env.PAYMENT_KEY_SECRET = "rotated";
    expect(decryptSecret(enc)).toBeNull();
    expect(decryptSecret("garbage")).toBeNull();
  });
});
