import { describe, expect, it } from "vitest";

import {
  EntryStage,
  EntryStatus,
  InvitationStatus,
  SeasonPhase,
  StageKey,
} from "@/generated/prisma/enums";
import { stageWindows } from "@/lib/submission";
import {
  formatInviteCode,
  InviteCodeSchema,
  inviteFailure,
  inviteValidUntil,
  isJoinPhase,
  joinClosedCode,
  joinDeadlineNote,
  joinWindowClosed,
  joinWindowFrom,
  MAX_TEAM_SIZE,
  normalizeInviteCode,
  soloConfirmable,
  TEAM_FAILURE_MESSAGE,
  type InviteCheck,
  type InviteFailureCode,
  type JoinClosedCode,
  type JoinWindow,
} from "@/lib/team";

/*
  초대 코드 — 시안 `PRV-KP-7F3K` 모양. 저장은 하이픈 없이, 표시는 3-2-4.
  ⚠️ 시안 예시의 L은 우리 문자표에 없다(1/I/L 혼동 방지). 예시는 KP로 쓴다.
*/
describe("초대 코드 형식", () => {
  it("저장된 코드를 PRV-XX-XXXX로 보여준다", () => {
    expect(formatInviteCode("PRVKP7F3K")).toBe("PRV-KP-7F3K");
  });

  it("사람이 어떻게 넣어도 같은 코드로 읽는다", () => {
    expect(normalizeInviteCode(" prv-kp-7f3k ")).toBe("PRVKP7F3K");
    expect(normalizeInviteCode("PRV KP 7F3K")).toBe("PRVKP7F3K");
    /* 접두사를 빼고 넣어도 받는다 */
    expect(normalizeInviteCode("kp-7f3k")).toBe("PRVKP7F3K");
  });

  it("형식이 아니면 거절한다", () => {
    expect(InviteCodeSchema.safeParse("PRV-KP-7F3K").success).toBe(true);
    expect(InviteCodeSchema.safeParse("KP-7F3K").success).toBe(true);
    /* 옛 8자 코드, 헷갈리는 글자(0·O·1·I·L·8·B) */
    expect(InviteCodeSchema.safeParse("MKVH4AHQ").success).toBe(false);
    expect(InviteCodeSchema.safeParse("PRV-L0-7F3K").success).toBe(false);
    expect(InviteCodeSchema.safeParse("").success).toBe(false);
  });
});

/*
  합류 기간 — 2026-09-25 수연 지시 「s1까지 초대 수락」(PRD FR-B3 · OPEN-6).
  → 2026-09-26 수연 지시 「절대 날짜로」: 「s1까지」는 팀의 진도가 아니라 **s1 달력
  마감**(`stages` s1 행의 `closes_at`)이다.

  페이즈 × s1 마감(전·후·비어 있음) × 상태를 전부 돈다. 기대값을 표로 두고 조합은
  루프가 만든다 — 빠진 칸이 생기면 표에서 바로 보인다. 진도(stage)도 전부 돌려
  **진도와 무관함**을 같이 고정한다 — 옛 규칙에서 닫혔던 s2 이상도 마감 전이면 열린다.
*/
const KST = (local: string) => new Date(`${local}:00+09:00`);
/* 시안의 s1 마감 — 10.18 23:59 */
const S1_CLOSES = KST("2026-10-18T23:59");

type Deadline = "before" | "after" | "unset";
const DEADLINES: Deadline[] = ["before", "after", "unset"];

/* s1 마감 기준으로 지금을 놓는다. 「unset」은 마감이 비어 있는(일정 잠정) 시즌이다 */
function windowAt(phase: SeasonPhase, deadline: Deadline): JoinWindow {
  if (deadline === "unset") {
    return { phase, s1ClosesAt: null, now: KST("2026-10-30T12:00") };
  }
  return {
    phase,
    s1ClosesAt: S1_CLOSES,
    now: deadline === "before" ? KST("2026-10-15T09:00") : KST("2026-10-19T09:00"),
  };
}

describe("합류 기간(joinClosedCode)", () => {
  const ALL_PHASES = Object.values(SeasonPhase);
  const ALL_STAGES = Object.values(EntryStage);
  const INACTIVE = [
    EntryStatus.eliminated,
    EntryStatus.disqualified,
    EntryStatus.withdrawn,
  ];
  /* 진도를 실어 넘긴다 — 판정이 진도를 안 본다는 것을 루프가 증명한다 */
  const entryOf = (stage: EntryStage, status: EntryStatus) => ({ stage, status });

  it("모집과 레이스만 합류 페이즈다", () => {
    expect(ALL_PHASES.filter(isJoinPhase)).toEqual([
      SeasonPhase.recruiting,
      SeasonPhase.racing,
    ]);
  });

  /*
    합류 페이즈 × s1 마감 — active 팀의 기대값.
    모집 중에는 날짜를 안 본다(모집이 곧 「recruiting~s1」의 앞쪽이다). 레이스 중에는
    마감 전까지 열리고, 마감이 비어 있으면(일정 잠정) 열린 것으로 본다.
  */
  const ACTIVE: Record<"recruiting" | "racing", Record<Deadline, "open" | "JOIN_CLOSED">> = {
    recruiting: { before: "open", after: "open", unset: "open" },
    racing: { before: "open", after: "JOIN_CLOSED", unset: "open" },
  };
  for (const phase of [SeasonPhase.recruiting, SeasonPhase.racing] as const) {
    for (const deadline of DEADLINES) {
      const expected = ACTIVE[phase][deadline];
      it(`${phase} × s1 마감 ${deadline} × active → ${expected} (진도 무관)`, () => {
        for (const stage of ALL_STAGES) {
          const got = joinClosedCode(
            windowAt(phase, deadline),
            entryOf(stage, EntryStatus.active),
          );
          expect(got ?? "open").toBe(expected);
        }
      });
    }
  }

  /*
    탈락·실격·포기한 팀 — 기간이 열려 있으면 TEAM_INACTIVE, s1 마감이 지났으면
    JOIN_CLOSED. 마감은 시즌 전체의 사유라 상태보다 먼저 본다.
  */
  const INACTIVE_EXPECTED: Record<
    "recruiting" | "racing",
    Record<Deadline, "TEAM_INACTIVE" | "JOIN_CLOSED">
  > = {
    recruiting: { before: "TEAM_INACTIVE", after: "TEAM_INACTIVE", unset: "TEAM_INACTIVE" },
    racing: { before: "TEAM_INACTIVE", after: "JOIN_CLOSED", unset: "TEAM_INACTIVE" },
  };
  for (const phase of [SeasonPhase.recruiting, SeasonPhase.racing] as const) {
    for (const deadline of DEADLINES) {
      const expected = INACTIVE_EXPECTED[phase][deadline];
      it(`${phase} × s1 마감 ${deadline} × 탈락·실격·포기 → ${expected}`, () => {
        for (const status of INACTIVE) {
          for (const stage of ALL_STAGES) {
            expect(
              joinClosedCode(windowAt(phase, deadline), entryOf(stage, status)),
            ).toBe(expected);
          }
        }
      });
    }
  }

  /* 마감 시각과 같은 순간이면 이미 닫혔다 — 제출 창과 같은 경계 */
  it("레이스 중 s1 마감 시각 정각부터 닫힌다", () => {
    const active = { status: EntryStatus.active };
    const at = (now: Date): JoinWindow => ({
      phase: SeasonPhase.racing,
      s1ClosesAt: S1_CLOSES,
      now,
    });
    expect(joinClosedCode(at(new Date(S1_CLOSES.getTime() - 1)), active)).toBeNull();
    expect(joinClosedCode(at(S1_CLOSES), active)).toBe("JOIN_CLOSED");
  });

  /* 페이즈로 닫힌 것은 합류 기간 문구(「합류 기간이 끝났어요」)를 쓰지 않는다 */
  it("모집·레이스 밖에서는 s1 마감·진도·상태와 무관하게 페이즈로 닫힌다", () => {
    const closedPhases = ALL_PHASES.filter((phase) => !isJoinPhase(phase));
    expect(closedPhases).toEqual([
      SeasonPhase.draft,
      SeasonPhase.pre_apply,
      SeasonPhase.awarded,
      SeasonPhase.archived,
    ]);
    for (const phase of closedPhases) {
      for (const deadline of DEADLINES) {
        for (const stage of ALL_STAGES) {
          for (const status of [EntryStatus.active, ...INACTIVE]) {
            expect(
              joinClosedCode(windowAt(phase, deadline), entryOf(stage, status)),
            ).toBe("JOIN_PHASE_CLOSED");
          }
        }
      }
    }
  });

  /*
    시즌 전체의 사유만 보는 절반 — /apply가 로그인 앞에서 이것으로 끊는다. 팀 상태를
    뺀 `joinClosedCode`와 모든 칸에서 같아야 한다(active 팀이면 둘이 같은 답이다).
  */
  it("시즌 전체의 마감(joinWindowClosed)은 active 팀의 joinClosedCode와 같다", () => {
    for (const phase of ALL_PHASES) {
      for (const deadline of DEADLINES) {
        const joinWindow = windowAt(phase, deadline);
        expect(joinWindowClosed(joinWindow)).toBe(
          joinClosedCode(joinWindow, { status: EntryStatus.active }),
        );
      }
    }
    /* 팀 상태를 받지 않는다 — 기간만 본다 */
    expect(joinWindowClosed(windowAt(SeasonPhase.racing, "before"))).toBeNull();
    expect(joinWindowClosed(windowAt(SeasonPhase.racing, "after"))).toBe("JOIN_CLOSED");
  });
});

/*
  s1 행을 고르는 일 — 명세의 핵심은 「달력 원값이지 유동 게이트의 실제 마감이 아니다」.
  s1(게이트 아님) 10.18, s2(게이트) 10.25 시즌에서 유동 게이트의 실제 창은 s1을 10.25로
  늘린다. 합류는 10.18에서 닫혀야 한다. 픽스처가 그 차이를 실제로 만드는지도 같이 본다
  (stageWindows가 10.25를 내지 않으면 이 테스트는 아무것도 증명하지 못한다).
*/
describe("합류 기간의 재료(joinWindowFrom)", () => {
  const S2_GATE = KST("2026-10-25T23:59");
  const stages = [
    /* 정렬을 가정하지 않는다 — 뒤섞어 둔다 */
    { stageKey: StageKey.s2, isGate: true, opensAt: null, closesAt: S2_GATE },
    {
      stageKey: StageKey.s1,
      isGate: false,
      opensAt: KST("2026-10-12T00:00"),
      closesAt: S1_CLOSES,
    },
    { stageKey: StageKey.s3, isGate: false, opensAt: null, closesAt: KST("2026-11-01T23:59") },
  ];
  const NOW = KST("2026-10-20T09:00");

  it("픽스처: 유동 게이트의 실제 창은 s1을 s2 게이트 마감까지 늘린다", () => {
    expect(stageWindows(stages).s1?.closesAt).toEqual(S2_GATE);
  });

  it("s1 행의 closes_at 원값(10.18)을 쓴다 — 실제 창(10.25)이 아니다", () => {
    expect(joinWindowFrom(stages, SeasonPhase.racing, NOW)).toEqual({
      phase: SeasonPhase.racing,
      s1ClosesAt: S1_CLOSES,
      now: NOW,
    });
    /* 그래서 10.20에는 실제 창이 열려 있어도 합류는 닫혀 있다 */
    expect(
      joinClosedCode(joinWindowFrom(stages, SeasonPhase.racing, NOW), {
        status: EntryStatus.active,
      }),
    ).toBe("JOIN_CLOSED");
  });

  it("s1 행이 없거나 마감이 비어 있으면 null(일정 잠정)", () => {
    const withoutS1 = stages.filter((stage) => stage.stageKey !== StageKey.s1);
    expect(joinWindowFrom(withoutS1, SeasonPhase.racing, NOW).s1ClosesAt).toBeNull();
    const unset = stages.map((stage) =>
      stage.stageKey === StageKey.s1 ? { ...stage, closesAt: null } : stage,
    );
    expect(joinWindowFrom(unset, SeasonPhase.racing, NOW).s1ClosesAt).toBeNull();
  });
});

/*
  레이스 중 살아 있는 초대 밑의 안내 — 날짜는 제출 화면의 `formatDeadline` 규칙
  (자정 마감은 전날 24:00). 레이스 중·마감 전·마감이 정해졌을 때만 붙는다.
  「s1 마감」이라고 부르지 않는다 — 허브의 「s1 마감」(유동 게이트의 실제 마감)과
  다른 날이다(2026-09-26 리뷰 지적).
*/
describe("합류 마감 안내(joinDeadlineNote)", () => {
  it("레이스 중 마감 전이면 합류 마감 날짜를 적는다", () => {
    expect(joinDeadlineNote(windowAt(SeasonPhase.racing, "before"))).toBe(
      "팀원 합류는 10.18 23:59까지예요.",
    );
  });

  it("자정 마감은 전날 24:00으로 적는다", () => {
    expect(
      joinDeadlineNote({
        phase: SeasonPhase.racing,
        s1ClosesAt: KST("2026-10-19T00:00"),
        now: KST("2026-10-15T09:00"),
      }),
    ).toBe("팀원 합류는 10.18 24:00까지예요.");
  });

  it("합류 문구는 「s1 마감」이라는 이름을 쓰지 않는다", () => {
    expect(TEAM_FAILURE_MESSAGE.JOIN_CLOSED).not.toContain("s1");
    expect(joinDeadlineNote(windowAt(SeasonPhase.racing, "before"))).not.toContain("s1");
  });

  it("마감이 지났거나 비어 있으면, 레이스가 아니면 붙이지 않는다", () => {
    expect(joinDeadlineNote(windowAt(SeasonPhase.racing, "after"))).toBeNull();
    expect(joinDeadlineNote(windowAt(SeasonPhase.racing, "unset"))).toBeNull();
    for (const phase of Object.values(SeasonPhase)) {
      if (phase === SeasonPhase.racing) continue;
      for (const deadline of DEADLINES) {
        expect(joinDeadlineNote(windowAt(phase, deadline))).toBeNull();
      }
    }
  });
});

/*
  초대 판정 순서 — 조회 화면(findInvite)과 수락(acceptInvite)이 같은 함수를 부른다.
  여기서 순서를 고정해 두면 화면이 말한 사유와 제출 뒤의 사유가 어긋나지 않는다.
*/
describe("초대 판정 순서(inviteFailure)", () => {
  const now = new Date("2026-10-20T00:00:00Z");
  const past = new Date("2026-10-19T00:00:00Z");
  const future = new Date("2026-10-27T00:00:00Z");
  const racingOpen = windowAt(SeasonPhase.racing, "before");
  const racingClosed = windowAt(SeasonPhase.racing, "after");

  it("없는 코드", () => {
    expect(inviteFailure(null, racingOpen, now)).toBe("INVITE_NOT_FOUND");
  });

  /*
    사유가 전부 겹친 초대에서 앞의 사유를 하나씩 걷어 낸다. 걷을 때마다 바로 다음
    사유가 나와야 한다 — 그러면 순서가 표 그대로임이 증명된다. 합류 마감은 초대가
    아니라 기간(s1 달력 마감)에서 걷는다.
  */
  it("사유가 겹치면 앞의 것부터 말한다", () => {
    const steps: [Partial<InviteCheck>, JoinWindow, InviteFailureCode | null][] = [
      [{}, racingClosed, "INVITE_USED"],
      [{ status: InvitationStatus.pending }, racingClosed, "INVITE_NOT_FOUND"],
      [{ entry: { status: EntryStatus.active } }, racingClosed, "JOIN_CLOSED"],
      [{}, racingOpen, "INVITE_EXPIRED"],
      [{ expiresAt: future }, racingOpen, "ALREADY_MEMBER"],
      [{ alreadyMember: false }, racingOpen, "TEAM_FULL"],
      [{ memberCount: MAX_TEAM_SIZE - 1 }, racingOpen, null],
    ];

    let invite: InviteCheck = {
      status: InvitationStatus.revoked,
      expiresAt: past,
      memberCount: MAX_TEAM_SIZE,
      entry: null,
      alreadyMember: true,
    };
    for (const [patch, joinWindow, expected] of steps) {
      invite = { ...invite, ...patch };
      expect(inviteFailure(invite, joinWindow, now)).toBe(expected);
    }
  });

  it("합류 마감은 만료보다 먼저다 — 페이즈·상태로 닫힌 것도 같다", () => {
    const expired: InviteCheck = {
      status: InvitationStatus.pending,
      expiresAt: past,
      memberCount: 1,
      entry: { status: EntryStatus.withdrawn },
      alreadyMember: false,
    };
    expect(inviteFailure(expired, racingOpen, now)).toBe("TEAM_INACTIVE");
    expect(inviteFailure(expired, racingClosed, now)).toBe("JOIN_CLOSED");
    expect(
      inviteFailure(expired, windowAt(SeasonPhase.awarded, "before"), now),
    ).toBe("JOIN_PHASE_CLOSED");
  });

  it("만료 시각과 같은 순간이면 이미 만료다", () => {
    const atEdge: InviteCheck = {
      status: InvitationStatus.pending,
      expiresAt: now,
      memberCount: 1,
      entry: { status: EntryStatus.active },
      alreadyMember: false,
    };
    expect(
      inviteFailure(atEdge, windowAt(SeasonPhase.recruiting, "before"), now),
    ).toBe("INVITE_EXPIRED");
  });

  /*
    시계가 둘이다 — 합류 기간은 기간의 `now`(개발 시계), 만료는 따로 받은 진짜 지금.
    개발 바가 날짜를 앞으로 옮겨도 진짜 시계로 살아 있는 초대가 만료로 나오지 않고,
    진짜 시계가 마감 전이어도 개발 시계가 마감 뒤면 닫힌다.
  */
  it("만료는 진짜 지금으로, s1 마감은 개발 시계로 잰다", () => {
    const realNow = KST("2026-10-10T09:00");
    const invite: InviteCheck = {
      status: InvitationStatus.pending,
      expiresAt: KST("2026-10-12T09:00"),
      memberCount: 1,
      entry: { status: EntryStatus.active },
      alreadyMember: false,
    };
    /* 개발 시계는 만료 뒤(10.15)지만 s1 마감 전 — 진짜 지금으로는 안 만료 */
    expect(inviteFailure(invite, racingOpen, realNow)).toBeNull();
    /* 개발 시계가 s1 마감 뒤(10.19) — 진짜 지금이 마감 전이어도 닫힌다 */
    expect(inviteFailure(invite, racingClosed, realNow)).toBe("JOIN_CLOSED");
  });
});

/*
  초대 메일의 「유효 기한」 — 만료와 합류 마감(s1 달력 마감) 중 이른 쪽(2026-09-26 리뷰
  지적: 10.15에 발급하면 만료는 10.22인데 합류는 10.18 23:59에 닫힌다).
*/
describe("메일에 적는 초대 기한(inviteValidUntil)", () => {
  const issued = KST("2026-10-15T09:00");
  const sevenDays = KST("2026-10-22T09:00");

  it("s1 마감이 만료보다 앞이면 s1 마감을 적는다 — 모집 중에 보낸 초대도 같다", () => {
    for (const phase of [SeasonPhase.recruiting, SeasonPhase.racing]) {
      expect(
        inviteValidUntil(sevenDays, { phase, s1ClosesAt: S1_CLOSES, now: issued }),
      ).toEqual(S1_CLOSES);
    }
  });

  it("만료가 s1 마감보다 앞이면 만료를 적는다", () => {
    const early = KST("2026-10-12T09:00");
    expect(
      inviteValidUntil(early, {
        phase: SeasonPhase.racing,
        s1ClosesAt: S1_CLOSES,
        now: KST("2026-10-05T09:00"),
      }),
    ).toEqual(early);
  });

  it("s1 마감이 비어 있거나 이미 지났으면 만료를 적는다", () => {
    expect(
      inviteValidUntil(sevenDays, { phase: SeasonPhase.racing, s1ClosesAt: null, now: issued }),
    ).toEqual(sevenDays);
    /* 모집이 s1 마감 뒤까지 늘어난 시즌 — 지난 날짜를 적으면 받을 수 있는 초대가 죽어 보인다 */
    expect(
      inviteValidUntil(sevenDays, {
        phase: SeasonPhase.recruiting,
        s1ClosesAt: KST("2026-10-14T23:59"),
        now: issued,
      }),
    ).toEqual(sevenDays);
  });
});

/*
  개인 참가로 확정 — 합류가 s1 달력 마감으로 닫혔는데 혼자 남은 비솔로 팀만(2026-09-26
  리뷰 지적: 마감 뒤 허브의 「팀 구성하기」가 누를 것 없는 화면으로 보냈다).
*/
describe("개인 참가 확정(soloConfirmable)", () => {
  const CLOSED: (JoinClosedCode | null)[] = [
    null,
    "JOIN_CLOSED",
    "JOIN_PHASE_CLOSED",
    "TEAM_INACTIVE",
  ];

  it("s1 마감으로 닫힌 1인 비솔로 팀만 확정할 수 있다", () => {
    for (const closed of CLOSED) {
      for (const memberCount of [1, MAX_TEAM_SIZE]) {
        for (const isSolo of [false, true]) {
          const expected =
            closed === "JOIN_CLOSED" && memberCount === 1 && !isSolo;
          expect(soloConfirmable({ closed, memberCount, isSolo })).toBe(expected);
        }
      }
    }
  });

  it("레이스 중 s1 마감 전후로 갈린다 — 판정 재료는 합류와 같다", () => {
    const team = { status: EntryStatus.active };
    const at = (deadline: Deadline) =>
      soloConfirmable({
        closed: joinClosedCode(windowAt(SeasonPhase.racing, deadline), team),
        memberCount: 1,
        isSolo: false,
      });
    expect(at("before")).toBe(false);
    expect(at("after")).toBe(true);
    expect(at("unset")).toBe(false);
  });
});
