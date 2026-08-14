import { EntryStatus, NotifChannel } from "@/generated/prisma/enums";
import { REASON_MIN } from "@/lib/admin";
import type { Audience } from "@/lib/notify";
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

  ⚠️ 지금은 인앱만이다. 메일은 도메인(proovit.kr) 확보가 선행이고 알림톡은
  발신프로필 심사가 선행이다 — 없는 채널을 고르게 하면 "보냈다"고 믿게 된다.
*/

export type SendResult =
  | { ok: true; count: number }
  | { ok: false; message: string };

/**
 * 공지 발송.
 *
 * 알림은 **사람마다 한 행**이다(스키마 `notifications.user_id`). 팀 단위로 한 행을
 * 만들면 팀원이 읽음 처리를 공유하게 되어 "나는 못 봤다"를 가릴 수 없다.
 */
export async function sendNotice(args: {
  seasonId: string;
  audience: Audience;
  title: string;
  body: string;
  linkUrl: string | null;
  actorId: string;
}): Promise<SendResult> {
  const { seasonId, audience, actorId } = args;
  const title = args.title.trim();
  const body = args.body.trim();

  if (title.length < REASON_MIN) {
    return { ok: false, message: `제목을 ${REASON_MIN}자 이상 적어 주세요.` };
  }
  if (body.length === 0) {
    return { ok: false, message: "본문을 적어 주세요." };
  }

  /* 대상은 참가팀의 팀원이다 — 참가하지 않은 회원에게는 시즌 통지를 보내지 않는다 */
  const members = await prisma.teamMember.findMany({
    where: {
      team: {
        entries: {
          some: {
            seasonId,
            ...(audience === "active" ? { status: EntryStatus.active } : {}),
          },
        },
      },
    },
    select: { userId: true },
    distinct: ["userId"],
  });

  if (members.length === 0) {
    return { ok: false, message: "받을 사람이 없습니다." };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.notification.createMany({
      data: members.map((member) => ({
        userId: member.userId,
        /* 값 목록은 코드 상수로 관리한다(스키마 주석). 손으로 쓴 공지는 notice다 */
        type: "notice",
        title,
        body,
        linkUrl: args.linkUrl,
        channel: NotifChannel.inapp,
        sentAt: now,
        /*
          도달 상태는 비운다. 인앱은 "보냈다"와 "도달했다"가 같은 사건이 아니고,
          도달을 기록할 근거가 되는 채널은 전원에게 가는 메일이다(스키마 주석).
        */
      })),
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "notification:send",
        targetType: "season",
        targetId: seasonId,
        /* 감사 로그의 사유 자리에 제목을 넣는다 — 무엇을 보냈는지가 곧 근거다 */
        reason: title,
        meta: { audience, count: members.length, channel: NotifChannel.inapp },
      },
    });
  });

  return { ok: true, count: members.length };
}

export type SentNotice = {
  title: string;
  body: string | null;
  sentAt: Date | null;
  count: number;
  readCount: number;
};

/**
 * 최근에 보낸 공지.
 *
 * 알림 표에는 「발송 묶음」이라는 개념이 없어서 제목+발송 시각으로 묶는다.
 * 읽은 사람 수를 같이 보여주는 이유: 마감 통지가 안 읽히면 다시 보낼 판단을
 * 해야 하는데, 그 판단의 재료가 이 숫자다.
 */
export async function loadSentNotices(limit = 20): Promise<SentNotice[]> {
  const rows = await prisma.notification.findMany({
    where: { type: "notice" },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { title: true, body: true, sentAt: true, readAt: true },
  });

  const groups = new Map<string, SentNotice>();
  for (const row of rows) {
    const key = `${row.title}|${row.sentAt?.toISOString() ?? ""}`;
    const found = groups.get(key);
    if (found) {
      found.count += 1;
      if (row.readAt) found.readCount += 1;
    } else {
      groups.set(key, {
        title: row.title,
        body: row.body,
        sentAt: row.sentAt,
        count: 1,
        readCount: row.readAt ? 1 : 0,
      });
    }
  }

  return [...groups.values()].slice(0, limit);
}
