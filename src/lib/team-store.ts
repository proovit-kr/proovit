import { randomInt } from "node:crypto";

import {
  InvitationStatus,
  MemberRole,
  Prisma,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { applyConsentRows, hashIp } from "@/lib/apply-store";
import {
  INVITE_ALPHABET,
  INVITE_CODE_LENGTH,
  INVITE_TTL_DAYS,
  MAX_TEAM_SIZE,
  normalizeInviteCode,
  type TeamFailureCode,
} from "@/lib/team";

/*
  팀 쓰기. **서버 전용이다** — 규칙(정원·코드 형식)은 team.ts에 있고 그쪽은
  클라이언트도 읽는다.

  권한 판정은 여기 없다. `canManageTeam()`·`canLeaveTeam()`이 access-policy.ts에
  있고 **화면과 서버 액션이 그 하나를 부른다**(CLAUDE.md §3). 이 파일은
  "권한이 있다고 치고" 팀의 규칙만 지킨다 — 정원, 초대 하나, 팀장 하나.
*/

export type TeamActionResult =
  | { ok: true }
  | { ok: false; code: TeamFailureCode };

export type TeamMemberView = {
  userId: string;
  nickname: string;
  isLeader: boolean;
  joinedAt: Date;
};

export type TeamInviteView = {
  id: string;
  code: string;
  email: string | null;
  expiresAt: Date;
};

export type TeamPanel = {
  name: string;
  isSolo: boolean;
  members: TeamMemberView[];
  /** 살아 있는 초대 하나. 만료·취소된 것은 화면에 올리지 않는다 */
  invite: TeamInviteView | null;
  full: boolean;
};

/**
 * 팀 화면이 필요한 전부를 한 번에 읽는다.
 *
 * 실명을 내리지 않는다 — 팀원 목록에 필요한 것은 닉네임이고, 실명은 심사·정산에서만
 * 쓴다. 화면에 있으면 스크린샷으로 나간다.
 */
export async function loadTeamPanel(teamId: string): Promise<TeamPanel | null> {
  const now = new Date();
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      name: true,
      isSolo: true,
      members: {
        orderBy: { createdAt: "asc" },
        select: {
          userId: true,
          role: true,
          createdAt: true,
          user: { select: { nickname: true } },
        },
      },
      invitations: {
        where: { status: InvitationStatus.pending, expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, inviteCode: true, email: true, expiresAt: true },
      },
    },
  });
  if (!team) return null;

  const members = team.members.map((m) => ({
    userId: m.userId,
    nickname: m.user.nickname,
    isLeader: m.role === MemberRole.leader,
    joinedAt: m.createdAt,
  }));
  const pending = team.invitations[0];

  return {
    name: team.name,
    isSolo: team.isSolo,
    members,
    invite: pending
      ? {
          id: pending.id,
          code: pending.inviteCode,
          email: pending.email,
          expiresAt: pending.expiresAt,
        }
      : null,
    full: members.length >= MAX_TEAM_SIZE,
  };
}

/**
 * 초대 코드.
 *
 * `randomInt`를 쓴다 — `Math.random()`은 예측 가능해서, 남의 팀 코드를 맞혀
 * 팀에 들어가는 길이 생긴다. 코드 하나로 팀 소속이 결정되므로 인증 토큰과
 * 같은 급으로 다룬다.
 */
function generateCode(): string {
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  }
  return code;
}

export type CreateInviteResult =
  | { ok: true; code: string }
  | { ok: false; code: TeamFailureCode };

/**
 * 초대 발급. 한 팀에 살아 있는 초대는 하나다.
 *
 * 둘 이상 허용하면 정원이 2인데 초대가 2건 나가 **둘이 동시에 수락**할 수 있다.
 * 수락 쪽에서 정원을 다시 보지만, 그 경합을 애초에 만들지 않는 편이 낫다.
 */
export async function createInvite(
  teamId: string,
  email?: string,
): Promise<CreateInviteResult> {
  const now = new Date();

  const [memberCount, alive] = await Promise.all([
    prisma.teamMember.count({ where: { teamId } }),
    prisma.teamInvitation.findFirst({
      where: {
        teamId,
        status: InvitationStatus.pending,
        expiresAt: { gt: now },
      },
      select: { id: true },
    }),
  ]);

  if (memberCount >= MAX_TEAM_SIZE) return { ok: false, code: "TEAM_FULL" };
  if (alive) return { ok: false, code: "INVITE_EXISTS" };

  /* 기한이 지난 pending은 여기서 정리한다 — 크론을 하나 늘리지 않는다 */
  await prisma.teamInvitation.updateMany({
    where: {
      teamId,
      status: InvitationStatus.pending,
      expiresAt: { lte: now },
    },
    data: { status: InvitationStatus.expired },
  });

  const expiresAt = new Date(
    now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  /*
    코드 충돌은 유니크 제약이 잡는다. 8자·27글자 문자표라 확률이 낮지만
    "낮다"에 기대지 않고 몇 번 다시 뽑는다.
  */
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    try {
      await prisma.$transaction([
        prisma.teamInvitation.create({
          data: { teamId, inviteCode: code, email: email ?? null, expiresAt },
        }),
        /*
          초대를 보낸 순간부터 1인 팀이 아니다. 이 값이 온보딩 체크리스트의
          「팀 구성 완료」 판정에 들어가므로(access.ts) 여기서 함께 바꾼다.
        */
        prisma.team.update({ where: { id: teamId }, data: { isSolo: false } }),
      ]);
      return { ok: true, code };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("초대 코드를 만들지 못했습니다(코드 충돌 5회).");
}

/** 초대 취소. 이미 수락된 초대는 되돌리지 않는다 — 그건 강퇴다 */
export async function revokeInvite(
  teamId: string,
  invitationId: string,
): Promise<TeamActionResult> {
  const updated = await prisma.teamInvitation.updateMany({
    where: { id: invitationId, teamId, status: InvitationStatus.pending },
    data: { status: InvitationStatus.revoked },
  });
  if (updated.count === 0) return { ok: false, code: "INVITE_NOT_FOUND" };
  return { ok: true };
}

/**
 * 팀장 이양.
 *
 * ⚠️ 순서가 강제된다. `team_members_one_leader`(팀당 leader 1명 부분 유니크
 * 인덱스)가 있어서 **먼저 내려놓고 그다음 올려야** 한다. 반대로 하면 한순간
 * 팀장이 둘이 되어 인덱스가 거부한다. 한 트랜잭션 안이라 중간 상태는 안 보인다.
 */
export async function transferLeader(
  teamId: string,
  actorId: string,
  targetUserId: string,
): Promise<TeamActionResult> {
  if (actorId === targetUserId) return { ok: true };

  const target = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: targetUserId } },
    select: { id: true },
  });
  if (!target) return { ok: false, code: "NOT_MEMBER" };

  await prisma.$transaction([
    prisma.teamMember.update({
      where: { teamId_userId: { teamId, userId: actorId } },
      data: { role: MemberRole.member },
    }),
    prisma.teamMember.update({
      where: { teamId_userId: { teamId, userId: targetUserId } },
      data: { role: MemberRole.leader },
    }),
  ]);
  return { ok: true };
}

// ═════════════════════════════════════════════════════════════
// 합류 — 초대받은 쪽
// ═════════════════════════════════════════════════════════════

export type InviteLookup =
  | {
      ok: true;
      teamName: string;
      /** 합류하면 붙게 되는 참가작. 무엇에 합류하는지 보여줘야 한다 */
      ideaTitle: string;
      code: string;
    }
  | { ok: false; code: TeamFailureCode };

/**
 * 초대 코드 조회 — 화면이 「무엇에 합류하는지」를 보여주기 위한 읽기다.
 *
 * ⚠️ 이 결과를 권한으로 쓰지 않는다. 실제 합류는 `acceptInvite`가 같은 조건을
 * **다시** 보고 트랜잭션 안에서 처리한다. 여기와 수락 사이에 정원이 찰 수 있다.
 */
export async function findInvite(
  rawCode: string,
  seasonId: string,
): Promise<InviteLookup> {
  const code = normalizeInviteCode(rawCode);
  const invite = await prisma.teamInvitation.findUnique({
    where: { inviteCode: code },
    select: {
      status: true,
      expiresAt: true,
      team: {
        select: {
          name: true,
          _count: { select: { members: true } },
          entries: {
            where: { seasonId },
            select: { ideaTitle: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!invite) return { ok: false, code: "INVITE_NOT_FOUND" };
  if (invite.status !== InvitationStatus.pending) {
    return { ok: false, code: "INVITE_USED" };
  }
  if (invite.expiresAt <= new Date()) {
    return { ok: false, code: "INVITE_EXPIRED" };
  }
  if (invite.team._count.members >= MAX_TEAM_SIZE) {
    return { ok: false, code: "TEAM_FULL" };
  }
  /* 이번 시즌에 참가하지 않은 팀의 초대 — 붙을 참가가 없다 */
  const entry = invite.team.entries[0];
  if (!entry) return { ok: false, code: "INVITE_NOT_FOUND" };

  return {
    ok: true,
    teamName: invite.team.name,
    ideaTitle: entry.ideaTitle,
    code,
  };
}

/**
 * 합류. 팀원 행을 만들고, 초대를 닫고, **그 사람의 동의 3종을 남긴다.**
 *
 * 셋이 한 트랜잭션인 이유는 동의다 — 팀원이 되고 동의 로그가 빠지면 「동의 없이
 * 수집한 개인정보」가 되고 그 입증 책임이 우리에게 있다(apply-store와 같은 이유).
 *
 * 팀장의 동의가 팀원 것을 대신하지 못한다(D2). 그래서 합류 화면도 체크박스를 받는다.
 */
export async function acceptInvite(
  user: { id: string },
  rawCode: string,
  seasonId: string,
  consent: Record<string, boolean>,
  context: { ip: string | null; userAgent: string | null },
): Promise<TeamActionResult> {
  const code = normalizeInviteCode(rawCode);
  const ipHash = hashIp(context.ip);
  const userAgent = context.userAgent?.slice(0, 500) ?? null;

  try {
    return await prisma.$transaction(async (tx) => {
      const invite = await tx.teamInvitation.findUnique({
        where: { inviteCode: code },
        select: {
          id: true,
          teamId: true,
          status: true,
          expiresAt: true,
          team: {
            select: {
              members: { select: { userId: true } },
              entries: { where: { seasonId }, select: { id: true }, take: 1 },
            },
          },
        },
      });

      if (!invite) {
        return { ok: false as const, code: "INVITE_NOT_FOUND" as const };
      }
      if (invite.status !== InvitationStatus.pending) {
        return { ok: false as const, code: "INVITE_USED" as const };
      }
      if (invite.expiresAt <= new Date()) {
        await tx.teamInvitation.update({
          where: { id: invite.id },
          data: { status: InvitationStatus.expired },
        });
        return { ok: false as const, code: "INVITE_EXPIRED" as const };
      }
      if (invite.team.members.some((m) => m.userId === user.id)) {
        return { ok: false as const, code: "ALREADY_MEMBER" as const };
      }
      if (invite.team.members.length >= MAX_TEAM_SIZE) {
        return { ok: false as const, code: "TEAM_FULL" as const };
      }

      const entry = invite.team.entries[0];
      if (!entry) {
        return { ok: false as const, code: "INVITE_NOT_FOUND" as const };
      }

      /*
        ⚠️ 이번 시즌에 이미 다른 팀으로 참가한 사람은 합류할 수 없다.
        한 사람이 두 팀에 있으면 상호 테스터 배정과 지표 제외가 무너지고,
        같은 사람이 두 번 시상 대상이 된다.
      */
      const mine = await tx.entry.findFirst({
        where: { seasonId, team: { members: { some: { userId: user.id } } } },
        select: { id: true },
      });
      if (mine) return { ok: false as const, code: "ALREADY_APPLIED" as const };

      await tx.teamMember.create({
        data: {
          teamId: invite.teamId,
          userId: user.id,
          role: MemberRole.member,
        },
      });
      await tx.teamInvitation.update({
        where: { id: invite.id },
        data: { status: InvitationStatus.accepted },
      });
      await tx.consent.createMany({
        data: applyConsentRows({
          userId: user.id,
          entryId: entry.id,
          consent,
          ipHash,
          userAgent,
        }),
      });

      return { ok: true as const };
    });
  } catch (error) {
    /* @@unique([teamId, userId]) — 두 탭에서 동시에 눌렀을 때의 최종 방어선 */
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, code: "ALREADY_MEMBER" };
    }
    throw error;
  }
}

/**
 * 강퇴(팀장이 팀원을 내보낸다) · 탈퇴(팀원이 스스로 나간다).
 *
 * 같은 일이라 함수를 하나만 둔다 — 다른 것은 "누가 부르는가"뿐이고 그 판정은
 * access-policy가 한다. 여기서는 **팀장은 대상이 될 수 없다**는 것만 지킨다.
 *
 * ⚠️ 참가 기록(entries)은 팀에 붙어 있어 지우지 않는다. 나간 사람은 대시보드를
 * 잃지만 팀의 제출·지표는 그대로다. 소명 때 되돌릴 수 있어야 해서 이렇게 둔다.
 */
export async function removeMember(
  teamId: string,
  targetUserId: string,
): Promise<TeamActionResult> {
  const target = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: targetUserId } },
    select: { role: true },
  });
  if (!target) return { ok: false, code: "NOT_MEMBER" };
  if (target.role === MemberRole.leader) {
    /* 팀장을 지우면 쓰기 주체가 사라진다. 먼저 이양하게 한다 */
    return { ok: false, code: "LAST_MEMBER" };
  }

  await prisma.teamMember.delete({
    where: { teamId_userId: { teamId, userId: targetUserId } },
  });
  return { ok: true };
}
