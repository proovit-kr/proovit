/*
  지각 편입 링크 — 2026-09-26 수연 지시 「문의가 오면 운영자가 수동 편입하는 화면과 로직」
  (PRD OPEN-6 · FR-D5 · PLN3 3.2).

  돌리는 법:  npm test
  순수 판정만 본다. 코드 생성기(team-store)를 부르는 한 줄 때문에 prisma만 목으로 세운다.
*/
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { SeasonPhase, StageKey } from "@/generated/prisma/enums";
import {
  applyGate,
  formatLatePassCode,
  isLatePassCode,
  LATE_PASS_LENGTH,
  LATE_PASS_PREFIX,
  LATE_PASS_TTL_DAYS,
  lateEntryBlock,
  latePassExpiry,
  latePassFailure,
  latePassHint,
  latePassPendingWhere,
  latePassStatus,
  latePassUrl,
  normalizeLatePassCode,
  type LatePassCheck,
} from "@/lib/late-entry";
import { stageWindows } from "@/lib/submission";
import { InviteCodeSchema } from "@/lib/team";
import { generateCode } from "@/lib/team-store";

const KST = (iso: string) => new Date(`${iso}+09:00`);
const DAY = 86_400_000;

/*
  기획 문서 순서의 시즌1 일정(2026-09-26 수연 결정) — 모집은 09.27에 끝나고 개막 =
  레이스 = s1 시작이 09.28이다. s1 09.28~10.04, s2(1차 게이트) 10.05~10.11.
*/
const STAGES = [
  { stageKey: StageKey.s1, isGate: false, opensAt: KST("2026-09-28T00:00"), closesAt: KST("2026-10-04T23:59") },
  { stageKey: StageKey.s2, isGate: true, opensAt: KST("2026-10-05T00:00"), closesAt: KST("2026-10-11T23:59") },
  { stageKey: StageKey.s3, isGate: false, opensAt: KST("2026-10-12T00:00"), closesAt: KST("2026-10-18T23:59") },
];
/* 편입 기한 — s1 달력 마감(stages s1 행의 closesAt 원값), 곧 s1 구간의 끝 */
const S1_END = KST("2026-10-04T23:59");
/* s1 제출 기한 — 유동 게이트의 실제 마감(1차 게이트). 허브 경고줄이 알려 주는 날짜다 */
const GATE1 = KST("2026-10-11T23:59");
/* 레이스 첫 주 — s1 구간 안 */
const IN_S1 = KST("2026-10-01T12:00");

const SEASON = { id: "season-1", phase: SeasonPhase.racing };

describe("편입 코드", () => {
  it("초대 코드와 같은 생성기에 접두사만 다르다", () => {
    const code = generateCode(LATE_PASS_PREFIX, LATE_PASS_LENGTH);
    expect(code.startsWith(LATE_PASS_PREFIX)).toBe(true);
    expect(code).toHaveLength(LATE_PASS_PREFIX.length + LATE_PASS_LENGTH);
    expect(isLatePassCode(code)).toBe(true);
    /* VarChar(12)에 든다 */
    expect(code.length).toBeLessThanOrEqual(12);
  });

  it("초대 코드로는 읽히지 않는다 — 섞이지 않게", () => {
    const code = generateCode(LATE_PASS_PREFIX, LATE_PASS_LENGTH);
    expect(InviteCodeSchema.safeParse(code).success).toBe(false);
    /* 거꾸로 초대 코드도 편입 코드가 아니다 */
    expect(isLatePassCode(generateCode())).toBe(false);
  });

  it("링크에서 온 값을 대소문자·하이픈·공백과 무관하게 읽는다", () => {
    expect(normalizeLatePassCode(" lte-acde-fghj ")).toBe("LTEACDEFGHJ");
    expect(isLatePassCode("LTEACDEFGHJ")).toBe(true);
  });

  it("모양이 아니면 편입 코드가 아니다", () => {
    expect(isLatePassCode("")).toBe(false);
    expect(isLatePassCode("LTEACDEFGH")).toBe(false); // 7자
    expect(isLatePassCode("LTEACDEFGHJK")).toBe(false); // 9자
    expect(isLatePassCode("LTEACDEFGH0")).toBe(false); // 문자표 밖(0)
    expect(isLatePassCode("PRVACDEFGHJ")).toBe(false);
  });

  it("보여 줄 때 4자씩 끊고, 감사 로그에는 앞 4자만 남긴다", () => {
    expect(formatLatePassCode("LTEACDEFGHJ")).toBe("LTE-ACDE-FGHJ");
    expect(latePassHint("LTEACDEFGHJ")).toBe("LTE-ACDE-…");
  });

  it("링크는 초대 링크와 같은 모양이다", () => {
    expect(latePassUrl("LTEACDEFGHJ")).toBe("/apply?late=LTEACDEFGHJ");
    expect(latePassUrl("LTEACDEFGHJ", "http://localhost:3000")).toBe(
      "http://localhost:3000/apply?late=LTEACDEFGHJ",
    );
  });
});

describe("편입 기한 — s1의 달력 마감(s1 구간의 끝)", () => {
  /*
    편입 기한은 late-entry-store `loadLateEntryDeadline` → stage-read
    `stageCalendarClosesAt`(s1)이 읽는다 — 그 연결은 apply-store.test가 본다. 여기서는
    허브 경고줄의 「s1 마감」(stage-read `stageDueAt`)과 다른 날짜라는 것만 못 박는다.
  */
  it("허브 경고줄의 s1 마감(실제 마감, 1차 게이트)보다 이르다", () => {
    expect(STAGES[0]?.closesAt).toEqual(S1_END);
    expect(stageWindows(STAGES)[StageKey.s1]?.closesAt).toEqual(GATE1);
    expect(S1_END < GATE1).toBe(true);
  });

  it("링크 기한은 7일과 편입 기한 중 이른 쪽이다", () => {
    /* s1 구간이 한 주라 레이스 중에 만들면 시즌1에서는 늘 s1 마감이 먼저다 */
    expect(latePassExpiry(IN_S1, S1_END)).toEqual(S1_END);

    const far = KST("2026-12-31T23:59");
    expect(latePassExpiry(IN_S1, far)).toEqual(new Date(IN_S1.getTime() + LATE_PASS_TTL_DAYS * DAY));
  });

  it("편입 기한이 비면 7일만", () => {
    expect(latePassExpiry(IN_S1, null)).toEqual(new Date(IN_S1.getTime() + 7 * DAY));
  });
});

describe("편입을 받는 때", () => {
  const during = IN_S1;

  it("모집 중에는 링크가 필요 없다", () => {
    expect(lateEntryBlock(SeasonPhase.recruiting, S1_END, during)).toBe("RECRUITING");
  });

  it("레이스가 아니면 닫혀 있다", () => {
    for (const phase of [
      SeasonPhase.draft,
      SeasonPhase.pre_apply,
      SeasonPhase.awarded,
      SeasonPhase.archived,
    ]) {
      expect(lateEntryBlock(phase, S1_END, during)).toBe("PHASE_CLOSED");
    }
  });

  it("레이스 중 s1 구간 안이면 연다", () => {
    expect(lateEntryBlock(SeasonPhase.racing, S1_END, during)).toBeNull();
  });

  it("s1 구간이 끝나면 닫는다 — s1 제출 기한(1차 게이트)이 남았어도", () => {
    /* 10.06은 허브 경고줄의 「s1 마감」(10.11) 전이지만 s1 구간(~10.04)은 끝났다 */
    const s2Week = KST("2026-10-06T12:00");
    expect(s2Week < GATE1).toBe(true);
    expect(lateEntryBlock(SeasonPhase.racing, S1_END, s2Week)).toBe("S1_CLOSED");
  });

  it("마감 시각부터 닫는다", () => {
    expect(lateEntryBlock(SeasonPhase.racing, S1_END, S1_END)).toBe("S1_CLOSED");
    expect(lateEntryBlock(SeasonPhase.racing, S1_END, new Date(S1_END.getTime() + 1))).toBe("S1_CLOSED");
    expect(lateEntryBlock(SeasonPhase.racing, S1_END, new Date(S1_END.getTime() - 1))).toBeNull();
  });

  it("일정이 비면 레이스 내내 연다(링크 기한 7일만 남는다)", () => {
    expect(lateEntryBlock(SeasonPhase.racing, null, during)).toBeNull();
  });
});

describe("링크 판정", () => {
  const now = IN_S1;
  const PASS: LatePassCheck = {
    seasonId: "season-1",
    usedAt: null,
    revokedAt: null,
    expiresAt: S1_END,
  };

  it("살아 있으면 통과한다", () => {
    expect(latePassFailure(PASS, SEASON, S1_END, now)).toBeNull();
  });

  it("없거나 다른 시즌의 링크는 「없음」이다", () => {
    expect(latePassFailure(null, SEASON, S1_END, now)).toBe("LATE_PASS_NOT_FOUND");
    expect(latePassFailure({ ...PASS, seasonId: "season-0" }, SEASON, S1_END, now)).toBe(
      "LATE_PASS_NOT_FOUND",
    );
  });

  it("사용됨·취소됨", () => {
    expect(latePassFailure({ ...PASS, usedAt: now }, SEASON, S1_END, now)).toBe("LATE_PASS_USED");
    expect(latePassFailure({ ...PASS, revokedAt: now }, SEASON, S1_END, now)).toBe(
      "LATE_PASS_REVOKED",
    );
  });

  it("기한이 지났으면 만료", () => {
    expect(
      latePassFailure({ ...PASS, expiresAt: now }, SEASON, S1_END, now),
    ).toBe("LATE_PASS_EXPIRED");
  });

  it("편입 기간이 끝났으면 만료보다 「기간 아님」이 먼저다 — 새 링크도 못 만든다", () => {
    const after = new Date(S1_END.getTime() + DAY);
    expect(latePassFailure({ ...PASS, expiresAt: S1_END }, SEASON, S1_END, after)).toBe(
      "LATE_PASS_CLOSED",
    );
  });

  it("레이스가 아니면 「기간 아님」 — 시상 뒤에 남은 링크", () => {
    expect(
      latePassFailure(PASS, { ...SEASON, phase: SeasonPhase.awarded }, S1_END, now),
    ).toBe("LATE_PASS_CLOSED");
  });

  it("사용됨이 기간·만료보다 먼저다 — 쓴 사람에게 「기간 아님」을 말하지 않는다", () => {
    const after = new Date(S1_END.getTime() + DAY);
    expect(
      latePassFailure({ ...PASS, usedAt: now, expiresAt: now }, SEASON, S1_END, after),
    ).toBe("LATE_PASS_USED");
  });
});

describe("참가 신청을 받는가 — 화면과 액션이 같이 쓰는 판정", () => {
  const now = IN_S1;
  const PASS: LatePassCheck = {
    seasonId: "season-1",
    usedAt: null,
    revokedAt: null,
    expiresAt: S1_END,
  };
  const base = { applyOpen: false, season: SEASON, code: "LTEACDEFGHJ", pass: PASS, deadline: S1_END, now };

  it("모집 중이면 링크와 무관하게 평소 신청이다", () => {
    expect(applyGate({ ...base, applyOpen: true, season: { ...SEASON, phase: SeasonPhase.recruiting } })).toEqual({
      kind: "open",
    });
    expect(applyGate({ ...base, applyOpen: true, pass: null })).toEqual({ kind: "open" });
  });

  it("레이스 중 링크 없이 오면 닫혀 있다 — 사유 없이", () => {
    expect(applyGate({ ...base, code: "" })).toEqual({ kind: "closed", failure: null });
  });

  it("시즌이 없으면 닫혀 있다", () => {
    expect(applyGate({ ...base, season: null })).toEqual({ kind: "closed", failure: null });
  });

  it("유효한 링크면 그 코드로 받는다", () => {
    expect(applyGate(base)).toEqual({ kind: "late", code: "LTEACDEFGHJ" });
  });

  it("죽은 링크면 사유와 함께 닫는다", () => {
    expect(applyGate({ ...base, pass: { ...PASS, revokedAt: now } })).toEqual({
      kind: "closed",
      failure: "LATE_PASS_REVOKED",
    });
    expect(applyGate({ ...base, pass: null })).toEqual({
      kind: "closed",
      failure: "LATE_PASS_NOT_FOUND",
    });
  });
});

describe("대기 중인 링크 — 쓰기 조건과 목록 상태가 같은 규칙", () => {
  const now = IN_S1;

  /* `latePassPendingWhere`를 한 행에 대 보는 작은 판정기. Prisma의 뜻대로 읽는다 */
  function matches(
    where: ReturnType<typeof latePassPendingWhere>,
    pass: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  ): boolean {
    return (
      pass.usedAt === where.usedAt &&
      pass.revokedAt === where.revokedAt &&
      pass.expiresAt.getTime() > where.expiresAt.gt.getTime()
    );
  }

  const CASES = [
    { usedAt: null, revokedAt: null, expiresAt: S1_END },
    { usedAt: now, revokedAt: null, expiresAt: S1_END },
    { usedAt: null, revokedAt: now, expiresAt: S1_END },
    { usedAt: null, revokedAt: null, expiresAt: now },
    { usedAt: null, revokedAt: null, expiresAt: new Date(now.getTime() - 1) },
  ];

  it("목록이 「대기」라고 하는 것만 쓰거나 취소할 수 있다", () => {
    for (const pass of CASES) {
      expect(matches(latePassPendingWhere(now), pass)).toBe(latePassStatus(pass, now) === "pending");
    }
  });

  it("기한이 남았어도 편입 기간이 끝났으면 「만료」다 — 참가자 쪽 판정과 같게", () => {
    const live = CASES[0]!;
    expect(latePassStatus(live, now, "PHASE_CLOSED")).toBe("expired");
    expect(latePassStatus(live, now, "S1_CLOSED")).toBe("expired");
    /* 모집 중이면 링크가 평소 신청으로 이어져 여전히 쓸 수 있다 */
    expect(latePassStatus(live, now, "RECRUITING")).toBe("pending");
    expect(latePassStatus(live, now, null)).toBe("pending");
    /* 쓰였거나 취소된 것은 기간과 무관하게 그대로 */
    expect(latePassStatus(CASES[1]!, now, "PHASE_CLOSED")).toBe("used");
    expect(latePassStatus(CASES[2]!, now, "PHASE_CLOSED")).toBe("revoked");
  });

  it("상태 이름", () => {
    expect(CASES.map((p) => latePassStatus(p, now))).toEqual([
      "pending",
      "used",
      "revoked",
      "expired",
      "expired",
    ]);
  });
});
