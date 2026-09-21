/*
  참가 접수의 **경계** — 무엇이 트랜잭션 안이고 무엇이 밖인가.

  돌리는 법:  npm test
  DB도 Resend도 부르지 않는다. prisma·season·mail·team-store를 전부 목으로 세우고
  「누가 언제 불렸나」만 본다.

  여기서 지키는 것 셋(09-21 결정).
    1. 초대 **레코드**는 접수와 같은 트랜잭션 안이다
    2. 초대 **메일**은 그 밖이고, 실패해도 접수가 살아남는다
    3. 연락처(users.phone)는 더 이상 건드리지 않는다

  ⚠️ 목을 빠뜨려도 진짜 메일이 나가지 않는다 — mail.ts가 NODE_ENV!==production이면
  보내지 않는다. 그래도 여기서는 명시적으로 목을 세운다.
*/
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: vi.fn() } }));
vi.mock("@/lib/season", () => ({
  getCurrentSeason: vi.fn(),
  resolveLandingCta: vi.fn(),
}));
vi.mock("@/lib/mail", () => ({ sendTeamInvite: vi.fn() }));
vi.mock("@/lib/team-store", () => ({ createInviteIn: vi.fn() }));

import { sendTeamInvite } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { getCurrentSeason, resolveLandingCta } from "@/lib/season";
import { createInviteIn } from "@/lib/team-store";
import { submitApplication } from "@/lib/apply-store";

const USER = {
  id: "user-1",
  email: "leader@proovit.kr",
  nickname: "리더",
};

const CONSENT = { metrics: true, evidence: true };
const CONTEXT = { ip: null, userAgent: null };

const FORM = {
  isSolo: false,
  track: "free",
  teamName: "리틀포션",
  ideaTitle: "1인 카페 레시피 구독",
  ideaSummary: "",
  inviteEmail: "teammate@example.com",
};

/** 트랜잭션 클라이언트 흉내. 쓰지 않기로 한 모델(user)도 일부러 얹어 둔다. */
function makeTx() {
  return {
    teamMember: { findFirst: vi.fn().mockResolvedValue(null) },
    team: {
      create: vi.fn().mockResolvedValue({ id: "team-1", name: "리틀포션" }),
      update: vi.fn().mockResolvedValue({ id: "team-1", name: "리틀포션" }),
    },
    entry: { create: vi.fn().mockResolvedValue({ id: "entry-1" }) },
    consent: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    user: { update: vi.fn() },
  };
}

type Tx = ReturnType<typeof makeTx>;
let tx: Tx;

beforeEach(() => {
  vi.clearAllMocks();
  tx = makeTx();

  vi.mocked(prisma.$transaction).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((run: any) => run(tx)) as any,
  );
  vi.mocked(getCurrentSeason).mockResolvedValue({
    id: "season-1",
    title: "시즌 1",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(resolveLandingCta).mockReturnValue({ kind: "APPLY" } as any);
  vi.mocked(createInviteIn).mockResolvedValue({
    ok: true,
    code: "ACDEFGHJ",
    expiresAt: new Date("2026-09-28T00:00:00Z"),
  });
  vi.mocked(sendTeamInvite).mockResolvedValue({ ok: true, skipped: true });
});

describe("혼자 참가", () => {
  it("초대를 만들지도 보내지도 않는다", async () => {
    const result = await submitApplication(
      USER,
      { ...FORM, isSolo: true, inviteEmail: "" },
      CONSENT,
      CONTEXT,
    );

    expect(result).toEqual({ ok: true, entryId: "entry-1" });
    expect(createInviteIn).not.toHaveBeenCalled();
    expect(sendTeamInvite).not.toHaveBeenCalled();
  });

  it("쓰다 만 초대 주소가 남아 있어도 무시한다", async () => {
    const result = await submitApplication(
      USER,
      { ...FORM, isSolo: true, inviteEmail: "team" },
      CONSENT,
      CONTEXT,
    );

    expect(result.ok).toBe(true);
    expect(createInviteIn).not.toHaveBeenCalled();
  });
});

describe("팀 참가", () => {
  it("초대 레코드는 트랜잭션 안에서 만든다", async () => {
    await submitApplication(USER, FORM, CONSENT, CONTEXT);

    expect(createInviteIn).toHaveBeenCalledTimes(1);
    /* 첫 인자가 트랜잭션 클라이언트여야 한다 — 밖에서 만들면 여기서 갈린다 */
    expect(vi.mocked(createInviteIn).mock.calls[0]?.[0]).toBe(tx);
    expect(vi.mocked(createInviteIn).mock.calls[0]?.[1]).toBe("team-1");
    expect(vi.mocked(createInviteIn).mock.calls[0]?.[2]).toBe(
      "teammate@example.com",
    );
  });

  it("메일은 트랜잭션이 끝난 뒤에 나간다", async () => {
    let inviteCreatedAt = 0;
    let mailSentAt = 0;
    let tick = 0;

    vi.mocked(prisma.$transaction).mockImplementation((async (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      run: any,
    ) => {
      const value = await run(tx);
      tick += 1; /* 트랜잭션이 닫힌 시점 */
      return value;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);
    vi.mocked(createInviteIn).mockImplementation(async () => {
      inviteCreatedAt = tick;
      return {
        ok: true,
        code: "ACDEFGHJ",
        expiresAt: new Date("2026-09-28T00:00:00Z"),
      };
    });
    vi.mocked(sendTeamInvite).mockImplementation(async () => {
      mailSentAt = tick;
      return { ok: true, skipped: true };
    });

    await submitApplication(USER, FORM, CONSENT, CONTEXT);

    expect(inviteCreatedAt).toBe(0); // 닫히기 전
    expect(mailSentAt).toBe(1); // 닫힌 뒤
  });

  it("메일에 코드·기한·팀명이 실린다", async () => {
    await submitApplication(USER, FORM, CONSENT, CONTEXT);

    expect(sendTeamInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "teammate@example.com",
        inviterNickname: "리더",
        teamName: "리틀포션",
        ideaTitle: "1인 카페 레시피 구독",
        seasonTitle: "시즌 1",
        code: "ACDEFGHJ",
      }),
    );
  });

  it("발송이 실패해도 접수는 살아 있다", async () => {
    vi.mocked(sendTeamInvite).mockResolvedValue({
      ok: false,
      reason: "REJECTED",
    });

    const result = await submitApplication(USER, FORM, CONSENT, CONTEXT);

    expect(result).toEqual({ ok: true, entryId: "entry-1" });
    expect(tx.entry.create).toHaveBeenCalledTimes(1);
  });

  it("발송이 예외를 던져도 접수는 살아 있다", async () => {
    vi.mocked(sendTeamInvite).mockRejectedValue(new Error("Resend 죽음"));

    const result = await submitApplication(USER, FORM, CONSENT, CONTEXT);

    expect(result).toEqual({ ok: true, entryId: "entry-1" });
  });

  it("초대를 못 만들어도 접수는 살아 있다 — 이미 살아 있는 초대가 있는 경우", async () => {
    vi.mocked(createInviteIn).mockResolvedValue({
      ok: false,
      code: "INVITE_EXISTS",
    });

    const result = await submitApplication(USER, FORM, CONSENT, CONTEXT);

    expect(result).toEqual({ ok: true, entryId: "entry-1" });
    expect(sendTeamInvite).not.toHaveBeenCalled();
  });
});

describe("막히는 자리", () => {
  it("본인 주소를 초대하면 접수 자체가 열리지 않는다", async () => {
    const result = await submitApplication(
      USER,
      { ...FORM, inviteEmail: "Leader@Proovit.kr" },
      CONSENT,
      CONTEXT,
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors?.inviteEmail).toBeTruthy();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(sendTeamInvite).not.toHaveBeenCalled();
  });

  it("팀 참가인데 초대 칸이 비면 막는다", async () => {
    const result = await submitApplication(
      USER,
      { ...FORM, inviteEmail: "" },
      CONSENT,
      CONTEXT,
    );

    expect(result.ok).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("테마 트랙은 서버에서 거부한다", async () => {
    const result = await submitApplication(
      USER,
      { ...FORM, track: "theme" },
      CONSENT,
      CONTEXT,
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors?.track).toBeTruthy();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("필수 동의가 빠지면 CONSENT_REQUIRED다", async () => {
    const result = await submitApplication(
      USER,
      FORM,
      { metrics: true, evidence: false },
      CONTEXT,
    );

    expect(result.ok === false && result.code).toBe("CONSENT_REQUIRED");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("모집 중이 아니면 NOT_RECRUITING이다", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(resolveLandingCta).mockReturnValue({ kind: "CLOSED" } as any);

    const result = await submitApplication(USER, FORM, CONSENT, CONTEXT);

    expect(result.ok === false && result.code).toBe("NOT_RECRUITING");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("연락처", () => {
  it("users.phone을 더 이상 건드리지 않는다 — 09-21에 뺐다", async () => {
    await submitApplication(USER, FORM, CONSENT, CONTEXT);
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});

describe("동의 로그", () => {
  it("같은 트랜잭션에 두 행이 한 번에 쌓인다", async () => {
    await submitApplication(USER, FORM, CONSENT, CONTEXT);

    expect(tx.consent.createMany).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(tx.consent.createMany).mock.calls[0]?.[0] as {
      data: unknown[];
    };
    expect(arg.data).toHaveLength(2);
  });
});
