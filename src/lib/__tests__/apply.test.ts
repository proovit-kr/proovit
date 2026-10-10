/*
  참가 신청의 **순수 규칙** — 길이·트랙·초대 이메일·동의 행.

  돌리는 법:  npm test
  DB도 세션도 건드리지 않는다. 트랜잭션과 메일 쪽은 apply-store.test.ts다.

  여기서 지키는 것은 09-21에 바뀐 계약 넷이다.
    1. phone이 빠졌다 — 스키마에 그 칸이 없다
    2. 길이가 시안 숫자(팀명 60 · 아이디어명 120)다
    3. 트랙은 free만 받는다. 화면이 disabled여도 서버가 다시 막는다
    4. 동의는 metrics·evidence 둘이고, 로그 행의 종류·버전이 그 둘이다
*/
import { describe, expect, it, vi } from "vitest";

/* apply-store는 @/lib/prisma를 읽는데, 그 모듈은 DATABASE_URL이 없으면
   불러오는 것만으로 던진다. 여기서 쓰는 것은 순수 함수뿐이라 빈 것으로 막는다. */
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { ConsentType } from "@/generated/prisma/enums";
import {
  APPLY_CONSENTS,
  EVIDENCE_CONSENT_VERSION,
  METRICS_CONSENT_VERSION,
} from "@/content/consent";
import {
  ApplySchema,
  IDEA_TITLE_MAX,
  TEAM_NAME_MAX,
  validateInviteEmail,
} from "@/lib/apply";
import { applyConsentRows, missingRequiredConsents } from "@/lib/apply-store";

const VALID = {
  isSolo: true,
  track: "free",
  teamName: "리틀포션",
  ideaTitle: "1인 카페 레시피 구독",
  ideaSummary: "",
};

describe("ApplySchema", () => {
  it("제대로 채우면 통과한다", () => {
    const parsed = ApplySchema.safeParse(VALID);
    expect(parsed.success).toBe(true);
  });

  it("연락처 칸이 없다 — 09-21에 뺐다", () => {
    const parsed = ApplySchema.safeParse(VALID);
    expect(parsed.success && "phone" in parsed.data).toBe(false);
  });

  it("길이는 시안 숫자다 (팀명 60 · 아이디어명 120)", () => {
    expect(TEAM_NAME_MAX).toBe(60);
    expect(IDEA_TITLE_MAX).toBe(120);

    const ok = ApplySchema.safeParse({
      ...VALID,
      teamName: "가".repeat(60),
      ideaTitle: "나".repeat(120),
    });
    expect(ok.success).toBe(true);

    const tooLong = ApplySchema.safeParse({
      ...VALID,
      teamName: "가".repeat(61),
      ideaTitle: "나".repeat(121),
    });
    expect(tooLong.success).toBe(false);
  });

  it("테마 트랙은 거부한다 — 화면이 disabled인 것은 방어선이 아니다", () => {
    const parsed = ApplySchema.safeParse({ ...VALID, track: "theme" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(["track"]);
    }
  });

  it("모르는 트랙 문자열도 거부한다", () => {
    expect(ApplySchema.safeParse({ ...VALID, track: "sponsor" }).success).toBe(
      false,
    );
  });
});

describe("validateInviteEmail", () => {
  const self = "leader@proovit.kr";

  it("혼자 참가면 빈 칸이어도 통과한다", () => {
    expect(
      validateInviteEmail({ isSolo: true, inviteEmail: "", selfEmail: self }),
    ).toBeNull();
  });

  it("혼자 참가면 쓰다 만 글자가 남아 있어도 막지 않는다", () => {
    expect(
      validateInviteEmail({ isSolo: true, inviteEmail: "abc", selfEmail: self }),
    ).toBeNull();
  });

  it("팀 참가인데 비어 있으면 막는다", () => {
    expect(
      validateInviteEmail({ isSolo: false, inviteEmail: "  ", selfEmail: self }),
    ).toBeTruthy();
  });

  it("이메일 형식이 아니면 막는다", () => {
    expect(
      validateInviteEmail({
        isSolo: false,
        inviteEmail: "teammate",
        selfEmail: self,
      }),
    ).toBeTruthy();
  });

  it("본인 주소는 막는다 — 대소문자를 가리지 않는다", () => {
    expect(
      validateInviteEmail({
        isSolo: false,
        inviteEmail: " LEADER@Proovit.KR ",
        selfEmail: self,
      }),
    ).toBeTruthy();
  });

  it("남의 주소는 통과한다", () => {
    expect(
      validateInviteEmail({
        isSolo: false,
        inviteEmail: "teammate@example.com",
        selfEmail: self,
      }),
    ).toBeNull();
  });
});

describe("참가 동의", () => {
  it("항목은 metrics·evidence 둘이고 둘 다 필수다", () => {
    expect(APPLY_CONSENTS.map((c) => c.key)).toEqual(["metrics", "evidence"]);
    expect(APPLY_CONSENTS.every((c) => c.required)).toBe(true);
  });

  it("초안이라 버전이 v0.x다 — 승인되면 올리고 D6에 따라 재동의를 받는다", () => {
    expect(METRICS_CONSENT_VERSION).toMatch(/^v0\./);
    expect(EVIDENCE_CONSENT_VERSION).toMatch(/^v0\./);
  });

  it("evidence 문안에 고지 4요소가 있다", () => {
    const evidence = APPLY_CONSENTS.find((c) => c.key === "evidence");
    const labels = evidence?.facts?.map((f) => f.label) ?? [];
    expect(labels).toContain("수집 항목");
    expect(labels).toContain("수집·이용 목적");
    expect(labels).toContain("보유·이용 기간");
    expect(evidence?.facts?.every((f) => f.value.length > 0)).toBe(true);
    // 거부권
    expect(evidence?.notes?.some((n) => n.includes("거부할 권리"))).toBe(true);
  });

  it("동의 행은 둘이고 종류·버전이 항목과 맞는다", () => {
    const rows = applyConsentRows({
      userId: "user-1",
      entryId: "entry-1",
      consent: { metrics: true, evidence: true },
      ipHash: null,
      userAgent: null,
    });

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.type)).toEqual([
      ConsentType.metrics_public,
      ConsentType.evidence,
    ]);
    expect(rows.map((r) => r.version)).toEqual([
      METRICS_CONSENT_VERSION,
      EVIDENCE_CONSENT_VERSION,
    ]);
    expect(rows.every((r) => r.granted)).toBe(true);
  });

  it("체크를 안 한 항목도 행으로 남는다 — append-only 로그다", () => {
    const rows = applyConsentRows({
      userId: "user-1",
      entryId: "entry-1",
      consent: { metrics: true, evidence: false },
      ipHash: null,
      userAgent: null,
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.granted)).toEqual([true, false]);
  });

  it("필수가 하나라도 빠지면 막는다", () => {
    expect(missingRequiredConsents({ metrics: true, evidence: true })).toBe(
      false,
    );
    expect(missingRequiredConsents({ metrics: true })).toBe(true);
    expect(missingRequiredConsents({ evidence: true })).toBe(true);
    expect(missingRequiredConsents({})).toBe(true);
  });
});
