import { afterEach, describe, expect, it, vi } from "vitest";

/*
  운영 DB가 꺼져 있을 때의 판정만 본다 — 실제 연결은 테스트하지 않는다.
  켜지는 조건(값이 있고 DATABASE_URL과 다름)이 틀리면 운영 배포가 자기 DB를
  두 번 붙거나, 로컬이 영원히 dev 수를 보여 준다.
*/
describe("prodLeadsEnabled", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
    vi.resetModules();
  });

  it("PROD_DATABASE_URL이 없으면 꺼진다", async () => {
    delete process.env.PROD_DATABASE_URL;
    const { prodLeadsEnabled, prodLeadCount, prodLeadStats } = await import("@/lib/prod-leads");
    expect(prodLeadsEnabled()).toBe(false);
    expect(await prodLeadCount("season-1")).toBeNull();
    expect(await prodLeadStats("season-1", new Date())).toBeNull();
  });

  it("DATABASE_URL과 같은 주소면 꺼진다", async () => {
    process.env.DATABASE_URL = "postgresql://same";
    process.env.PROD_DATABASE_URL = "postgresql://same";
    const { prodLeadsEnabled } = await import("@/lib/prod-leads");
    expect(prodLeadsEnabled()).toBe(false);
  });

  it("다른 주소가 있으면 켜진다", async () => {
    process.env.DATABASE_URL = "postgresql://dev";
    process.env.PROD_DATABASE_URL = "postgresql://prod";
    const { prodLeadsEnabled } = await import("@/lib/prod-leads");
    expect(prodLeadsEnabled()).toBe(true);
  });
});
