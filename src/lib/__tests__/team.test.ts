import { describe, expect, it } from "vitest";

import {
  EntryStage,
  EntryStatus,
  InvitationStatus,
  SeasonPhase,
} from "@/generated/prisma/enums";
import {
  formatInviteCode,
  InviteCodeSchema,
  inviteFailure,
  isJoinPhase,
  joinClosedCode,
  MAX_TEAM_SIZE,
  normalizeInviteCode,
  type InviteCheck,
  type InviteFailureCode,
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
  페이즈 × 진도 × 상태를 전부 돈다. 기대값을 표로 두고 조합은 루프가 만든다 —
  빠진 칸이 생기면 표에서 바로 보인다.

  ⚠️ `entry.stage`는 마지막으로 **낸** 단계다. s1은 「s1을 냈고 s2는 아직」이라 열려
  있고, s2부터 닫힌다.
*/
describe("합류 기간(joinClosedCode)", () => {
  const ALL_PHASES = Object.values(SeasonPhase);
  const ALL_STAGES = Object.values(EntryStage);
  const INACTIVE = [
    EntryStatus.eliminated,
    EntryStatus.disqualified,
    EntryStatus.withdrawn,
  ];
  const active = (stage: EntryStage) => ({ stage, status: EntryStatus.active });

  it("모집과 레이스만 합류 페이즈다", () => {
    expect(ALL_PHASES.filter(isJoinPhase)).toEqual([
      SeasonPhase.recruiting,
      SeasonPhase.racing,
    ]);
  });

  /*
    합류 페이즈의 active 팀 — 진도별 기대값. 모집과 레이스가 **같은 표**다.
    모집 중에도 제출은 막혀 있지 않아(`stages.opens_at`이 비면 열린다) s2를 낸
    팀이 있을 수 있고, 그 팀은 모집 중에도 닫힌다.
  */
  const BY_STAGE: Record<EntryStage, "open" | "JOIN_CLOSED"> = {
    applied: "open", // 지각 참가 — s1을 아직 안 냈다
    s1: "open", // s1을 냈고 s2는 아직
    s2: "JOIN_CLOSED", // s2를 냈다(게이트 판정 대기)
    s3: "JOIN_CLOSED",
    s4: "JOIN_CLOSED",
    s5: "JOIN_CLOSED",
    completed: "JOIN_CLOSED",
  };
  for (const phase of [SeasonPhase.recruiting, SeasonPhase.racing]) {
    for (const stage of ALL_STAGES) {
      it(`${phase} × ${stage} → ${BY_STAGE[stage]}`, () => {
        const got = joinClosedCode(phase, active(stage));
        expect(got ?? "open").toBe(BY_STAGE[stage]);
      });
    }
  }

  /* 진도보다 상태를 먼저 본다 — s2 이상인 비활성 팀도 TEAM_INACTIVE다 */
  it("탈락·실격·포기한 팀은 모집·레이스 모두, 진도와 무관하게 닫힌다", () => {
    for (const phase of [SeasonPhase.recruiting, SeasonPhase.racing]) {
      for (const status of INACTIVE) {
        for (const stage of ALL_STAGES) {
          expect(joinClosedCode(phase, { stage, status })).toBe("TEAM_INACTIVE");
        }
      }
    }
  });

  /* 페이즈로 닫힌 것은 진도 문구(「s2 제출 전까지」)를 쓰지 않는다 */
  it("모집·레이스 밖에서는 진도·상태와 무관하게 페이즈로 닫힌다", () => {
    const closedPhases = ALL_PHASES.filter((phase) => !isJoinPhase(phase));
    expect(closedPhases).toEqual([
      SeasonPhase.draft,
      SeasonPhase.pre_apply,
      SeasonPhase.awarded,
      SeasonPhase.archived,
    ]);
    for (const phase of closedPhases) {
      for (const stage of ALL_STAGES) {
        for (const status of [EntryStatus.active, ...INACTIVE]) {
          expect(joinClosedCode(phase, { stage, status })).toBe(
            "JOIN_PHASE_CLOSED",
          );
        }
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

  it("없는 코드", () => {
    expect(inviteFailure(null, SeasonPhase.racing, now)).toBe("INVITE_NOT_FOUND");
  });

  /*
    사유가 전부 겹친 초대에서 앞의 사유를 하나씩 걷어 낸다. 걷을 때마다 바로 다음
    사유가 나와야 한다 — 그러면 순서가 표 그대로임이 증명된다.
  */
  it("사유가 겹치면 앞의 것부터 말한다", () => {
    const steps: [Partial<InviteCheck>, InviteFailureCode | null][] = [
      [{}, "INVITE_USED"],
      [{ status: InvitationStatus.pending }, "INVITE_NOT_FOUND"],
      [
        { entry: { stage: EntryStage.s2, status: EntryStatus.active } },
        "JOIN_CLOSED",
      ],
      [
        { entry: { stage: EntryStage.s1, status: EntryStatus.active } },
        "INVITE_EXPIRED",
      ],
      [{ expiresAt: future }, "ALREADY_MEMBER"],
      [{ alreadyMember: false }, "TEAM_FULL"],
      [{ memberCount: MAX_TEAM_SIZE - 1 }, null],
    ];

    let invite: InviteCheck = {
      status: InvitationStatus.revoked,
      expiresAt: past,
      memberCount: MAX_TEAM_SIZE,
      entry: null,
      alreadyMember: true,
    };
    for (const [patch, expected] of steps) {
      invite = { ...invite, ...patch };
      expect(inviteFailure(invite, SeasonPhase.racing, now)).toBe(expected);
    }
  });

  it("합류 마감은 만료보다 먼저다 — 페이즈·상태로 닫힌 것도 같다", () => {
    const expired: InviteCheck = {
      status: InvitationStatus.pending,
      expiresAt: past,
      memberCount: 1,
      entry: { stage: EntryStage.applied, status: EntryStatus.withdrawn },
      alreadyMember: false,
    };
    expect(inviteFailure(expired, SeasonPhase.racing, now)).toBe("TEAM_INACTIVE");
    expect(inviteFailure(expired, SeasonPhase.awarded, now)).toBe(
      "JOIN_PHASE_CLOSED",
    );
  });

  it("만료 시각과 같은 순간이면 이미 만료다", () => {
    const atEdge: InviteCheck = {
      status: InvitationStatus.pending,
      expiresAt: now,
      memberCount: 1,
      entry: { stage: EntryStage.applied, status: EntryStatus.active },
      alreadyMember: false,
    };
    expect(inviteFailure(atEdge, SeasonPhase.recruiting, now)).toBe(
      "INVITE_EXPIRED",
    );
  });
});
