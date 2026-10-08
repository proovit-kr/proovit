import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/access", () => ({ getSessionUser: vi.fn(), loadViewerState: vi.fn() }));
vi.mock("@/lib/account-consent", () => ({ loadAccountConsentNeed: vi.fn() }));
vi.mock("@/lib/apply-store", () => ({ missingRequiredConsents: vi.fn() }));
vi.mock("@/lib/season", () => ({ getCurrentSeason: vi.fn() }));
vi.mock("@/lib/team-store", () => ({ acceptInvite: vi.fn() }));
vi.mock("@/lib/evidence-storage", () => ({ evidenceStorage: vi.fn() }));
vi.mock("@/lib/evidence", () => ({ parseEvidenceKey: vi.fn(() => ({ entryId: "entry-1", name: "proof.pdf" })) }));

import { joinTeam } from "@/app/apply/join-actions";
import { submitApply } from "@/app/apply/actions";
import { GET } from "@/app/api/evidence/[...key]/route";
import { getSessionUser, loadViewerState } from "@/lib/access";
import { loadAccountConsentNeed } from "@/lib/account-consent";
import { acceptInvite } from "@/lib/team-store";
import { evidenceStorage } from "@/lib/evidence-storage";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionUser).mockResolvedValue({ id: "user-1" } as never);
  vi.mocked(loadAccountConsentNeed).mockResolvedValue({ needed: true } as never);
});

describe("동의 전 직접 호출 우회 차단", () => {
  it("초대 링크로도 가입 동의·연령 확인을 건너뛰어 팀원이 될 수 없다", async () => {
    const form = new FormData();
    form.set("code", "invite-code");
    const result = await joinTeam({}, form);
    expect(result.message).toContain("만 14세 이상 확인");
    expect(acceptInvite).not.toHaveBeenCalled();
  });
  it("새 참가 액션도 먼저 가입 동의·연령 확인을 요구한다", async () => {
    const result = await submitApply({}, new FormData());
    expect(result.message).toContain("만 14세 이상 확인");
  });
  it("운영자도 연령 확인 전 비공개 증빙 URL에 직접 접근할 수 없다", async () => {
    vi.mocked(loadViewerState).mockResolvedValue({
      user: { id: "user-1", roles: ["admin"], accountConsentComplete: false },
    } as never);
    const result = await GET(new Request("http://localhost/api/evidence/test"), { params: Promise.resolve({ key: ["test"] }) });
    expect(result.status).toBe(403);
    expect(evidenceStorage).not.toHaveBeenCalled();
  });
});
