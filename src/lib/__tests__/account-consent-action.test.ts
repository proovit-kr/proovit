import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/access", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/apply-store", () => ({ hashIp: vi.fn(() => "hashed") }));
vi.mock("@/lib/prisma", () => ({ prisma: { consent: { createMany: vi.fn() } } }));

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { acceptAccountConsent } from "@/app/actions/consent";
import { getSessionUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";

function form(keys = ["terms", "privacy", "age"]) {
  const data = new FormData();
  for (const key of keys) data.set("consent-" + key, "on");
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionUser).mockResolvedValue({ id: "user-1" } as never);
  vi.mocked(headers).mockResolvedValue(new Headers({ "user-agent": "browser" }) as never);
  vi.mocked(prisma.consent.createMany).mockResolvedValue({ count: 4 });
});

describe("가입 시 연령 확인", () => {
  it("14세 체크를 빼고 직접 호출해도 저장하지 않는다", async () => {
    expect(await acceptAccountConsent(form(["terms", "privacy"]))).toBe(false);
    expect(prisma.consent.createMany).not.toHaveBeenCalled();
  });
  it("세션 없이 호출하면 저장하지 않는다", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    expect(await acceptAccountConsent(form())).toBe(false);
    expect(prisma.consent.createMany).not.toHaveBeenCalled();
  });
  it("필수 체크를 직접 하면 연령 기록을 같은 저장에 포함한다", async () => {
    expect(await acceptAccountConsent(form())).toBe(true);
    expect(prisma.consent.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([
      expect.objectContaining({ userId: "user-1", type: "age", granted: true, source: "self_declaration" }),
      expect.objectContaining({ type: "marketing", granted: false }),
    ]) });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});
