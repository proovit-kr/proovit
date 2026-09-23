import { EntryStatus, NotifChannel } from "@/generated/prisma/enums";
import { REASON_MIN } from "@/lib/admin";
import { sendNoticeMail } from "@/lib/mail";
import {
  channelLabel,
  inStageTarget,
  STAGE_TARGET_LABEL,
  type StageTarget,
} from "@/lib/notify";
import { prisma } from "@/lib/prisma";

/*
  공지 발송. **서버 전용이다.**

  ⚠️ **이 화면으로는 광고성 정보를 보내지 않는다.** 규칙 제24조가 둘을 갈라놨다 —
  ① 마감·심사 결과·제출 요청 같은 **시즌 이행 통지**는 광고성이 아니라 수신 동의와
  무관하게 보낸다 ② 광고성 정보는 사전 동의자에게만, (광고) 표기와 수신거부 방법을
  붙여 보낸다.

  ②를 지원하려면 동의 필터·표기·수신거부 링크가 함께 있어야 하고, 그게 없는 채로
  버튼만 만들면 운영자가 광고를 이 창구로 보내게 된다. 그래서 **이행 통지 전용**으로
  두고 화면에도 그렇게 적었다. 광고성 발송은 발송 도구가 붙을 때 따로 만든다.

  채널은 인앱과 메일 둘이다(시안). 알림톡은 발신프로필 심사가 선행이라 없다 —
  없는 채널을 고르게 하면 "보냈다"고 믿게 된다.
*/

export type SendResult =
  | { ok: true; teams: number; people: number; mailFailed: number }
  | { ok: false; message: string };

/** 공지 대상 팀 — 화면의 「예상 대상」과 발송이 같은 목록을 쓴다 */
export type NoticeTeam = {
  entryId: string;
  stage: string;
  active: boolean;
  trackId: string | null;
  members: { userId: string; email: string | null }[];
};

export async function loadNoticeTeams(seasonId: string): Promise<NoticeTeam[]> {
  const entries = await prisma.entry.findMany({
    where: { seasonId },
    select: {
      id: true,
      stage: true,
      status: true,
      trackId: true,
      team: { select: { members: { select: { userId: true, user: { select: { email: true } } } } } },
    },
  });
  return entries.map((e) => ({
    entryId: e.id,
    stage: e.stage,
    active: e.status === EntryStatus.active,
    trackId: e.trackId,
    members: e.team.members.map((m) => ({ userId: m.userId, email: m.user.email })),
  }));
}

/** 트랙 필터 — "all", "none"(트랙 비어 있음 = 시즌 1 단일 트랙), 또는 트랙 id */
export function inTrack(track: string, trackId: string | null): boolean {
  if (track === "all") return true;
  if (track === "none") return trackId === null;
  return trackId === track;
}

/**
 * 공지 발송 — 시안 `#mdl-send` 「발송」.
 *
 * 알림은 **사람마다 한 행**이다(스키마 `notifications.user_id`). 팀 단위로 한 행을
 * 만들면 팀원이 읽음 처리를 공유하게 되어 "나는 못 봤다"를 가릴 수 없다.
 *
 * 메일은 트랜잭션 밖에서 한 통씩 보낸다 — 메일 서버가 느려도 인앱 발송·감사
 * 로그가 묶이지 않게. 실패한 통 수를 돌려준다(보낸 줄 알았는데 안 간 것이 제일 나쁘다).
 */
export async function sendNotice(args: {
  seasonId: string;
  stage: StageTarget;
  track: string;
  channels: { inapp: boolean; mail: boolean };
  title: string;
  body: string;
  actorId: string;
}): Promise<SendResult> {
  const { seasonId, stage, track, channels, actorId } = args;
  const title = args.title.trim();
  const body = args.body.trim();

  if (title.length < REASON_MIN) {
    return { ok: false, message: `제목을 ${REASON_MIN}자 이상 적어 주세요.` };
  }
  if (body.length === 0) return { ok: false, message: "본문을 적어 주세요." };
  if (!channels.inapp && !channels.mail) {
    return { ok: false, message: "채널을 하나 이상 골라 주세요." };
  }

  const teams = (await loadNoticeTeams(seasonId)).filter(
    (t) => inStageTarget(stage, t.stage, t.active) && inTrack(track, t.trackId),
  );
  const people = [...new Map(teams.flatMap((t) => t.members).map((m) => [m.userId, m])).values()];
  if (people.length === 0) return { ok: false, message: "받을 사람이 없습니다." };

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    if (channels.inapp) {
      await tx.notification.createMany({
        data: people.map((m) => ({
          userId: m.userId,
          /* 값 목록은 코드 상수로 관리한다(스키마 주석). 손으로 쓴 공지는 notice다 */
          type: "notice",
          title,
          body,
          channel: NotifChannel.inapp,
          sentAt: now,
        })),
      });
    }
    await tx.auditLog.create({
      data: {
        actorId,
        action: "notification.broadcast",
        targetType: "season",
        targetId: seasonId,
        /* 감사 로그의 사유 자리에 제목을 넣는다 — 무엇을 보냈는지가 곧 근거다 */
        reason: title,
        meta: {
          target: stage === "all" && track === "all" ? "전체" : `${STAGE_TARGET_LABEL[stage]}, ${track}`,
          stage,
          track,
          teams: teams.length,
          people: people.length,
          inapp: channels.inapp,
          mail: channels.mail,
        },
      },
    });
  });

  let mailFailed = 0;
  if (channels.mail) {
    for (const m of people) {
      if (!m.email) {
        mailFailed += 1;
        continue;
      }
      const r = await sendNoticeMail({ email: m.email, title, body });
      if (!r.ok) mailFailed += 1;
    }
  }

  return { ok: true, teams: teams.length, people: people.length, mailFailed };
}

export type SentNotice = {
  id: string;
  title: string;
  sentAt: Date;
  /** 「12팀」 — 옛 기록(팀 수를 안 적었다)은 「n명」 */
  target: string;
  channels: string;
};

/**
 * 발송 이력 — 시안 이력 표(일시·제목·대상·채널). 발송마다 감사 로그 한 줄이 남으므로
 * 그것을 읽는다(알림 표에는 「발송 묶음」이 없다).
 */
export async function loadSentNotices(limit = 20): Promise<SentNotice[]> {
  const rows = await prisma.auditLog.findMany({
    where: { action: { in: ["notification.broadcast", "notification:send"] } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, reason: true, createdAt: true, meta: true },
  });
  return rows.map((row) => {
    const m = (row.meta ?? {}) as { teams?: number; people?: number; count?: number; inapp?: boolean; mail?: boolean };
    return {
      id: String(row.id),
      title: row.reason,
      sentAt: row.createdAt,
      target: typeof m.teams === "number" ? `${m.teams}팀` : `${m.people ?? m.count ?? 0}명`,
      channels: channelLabel({ inapp: m.inapp ?? true, mail: m.mail ?? false }),
    };
  });
}
