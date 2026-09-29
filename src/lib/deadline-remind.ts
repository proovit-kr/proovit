import { NOTI_DEADLINE } from "@/content/notifications";
import {
  EntryStage,
  EntryStatus,
  NotifChannel,
  SeasonPhase,
  StageKey,
  SubmissionStatus,
} from "@/generated/prisma/client";
import { devNow } from "@/lib/dev-clock";
import { sendAlertMails } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { raceWeekBase } from "@/lib/race";
import { currentWeek, dDay, gateMissTarget, stageWindows, weekDue } from "@/lib/submission";

/*
  마감 알림 — 계정 설정 「심사 결과와 마감 알림을 메일로 받아요」의 마감 몫.
  페이즈 크론이 15분마다 부르고(api/v1/cron/phase), 팀원마다 인앱 한 줄 + 메일을
  보낸다(메일은 스위치를 켠 사람만, mail.ts `sendAlertMails`).

  유동 게이트라 고정 마감은 게이트(s2·s5) 둘뿐이다(submission.ts `stageWindows`).
  그래서 알림도 둘이다(내가 정함, 수연 확인 대기).

    게이트  마감 **하루 전**(D-1)부터. 받는 팀은 「지금 마감이면 미제출로 탈락할
            팀」 — 탈락 크론과 같은 판정(`gateMissTarget`)이다. s5는 레이스를
            시작한 팀이 자동 제출되므로, 남는 것은 배포하지 않은 팀뿐이다.
    주간    s4 「이번 주 마감」(`weekDue`) **이틀 전**(D-2)부터, 이번 주 것을 안
            낸 레이스 팀. 시안 알림센터 목업의 「이번 주 활동 제출 D-2」.

  **서울 09시 이후에만** 보낸다 — 크론 격자로 D-1이 되는 자정에 알림이 울리지 않게.
  같은 알림(`NOTI_DEADLINE[*].key`)을 3일 안에 받은 팀원에게는 다시 안 보낸다.
  배포가 늦어 D-1을 넘겼으면 D-day에 한 번 간다.

  판정에만 개발 시계를 쓰고, 보낸 시각(sentAt)과 중복 창은 진짜 지금이다(gate-miss와 같다).
*/

const REMIND_DAYS = { gate: 1, week: 2 } as const;
const SEND_FROM_HOUR = 9;
const DEDUPE_MS = 3 * 24 * 3_600_000;

/** 남은 날 수. `dDay`와 같은 서울 달력 셈이다. 지났으면 null */
function daysLeft(due: Date, now: Date): { days: number; label: string } | null {
  const label = dDay(due, now);
  if (!label) return null;
  return { days: label === "D-day" ? 0 : Number(label.slice(2)), label };
}

function seoulHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", hourCycle: "h23" }).format(now),
  );
}

/**
 * 지금 알릴 때인가 — 알릴 거면 제목에 넣을 D-day를, 아니면 null. **순수하다.**
 */
export function remindLabel(due: Date, now: Date, within: number): string | null {
  const left = daysLeft(due, now);
  if (!left || left.days > within) return null;
  if (seoulHour(now) < SEND_FROM_HOUR) return null;
  return left.label;
}

export type DeadlineRemindResult = {
  at: string;
  sent: { entryId: string; kind: "s2" | "s5" | "week"; people: number }[];
};

type Kind = keyof typeof NOTI_DEADLINE & ("s2" | "s5" | "week");

/** 한 팀에 한 알림. 이미 받은 팀원은 뺀다. 보낸 사람 수를 돌려준다 */
async function remindOne(entryId: string, kind: Kind, dday: string): Promise<number> {
  const copy = NOTI_DEADLINE[kind];
  const text = { title: copy.title.replace("{dday}", dday), body: copy.body, linkUrl: copy.linkUrl };
  const since = new Date(Date.now() - DEDUPE_MS);

  const to = await prisma.$transaction(async (tx) => {
    const members = await tx.teamMember.findMany({
      where: {
        team: { entries: { some: { id: entryId } } },
        user: {
          notifications: {
            none: { type: NOTI_DEADLINE.type, title: { startsWith: copy.key }, sentAt: { gte: since } },
          },
        },
      },
      select: { userId: true, user: { select: { email: true, notifyEmail: true } } },
    });
    if (members.length === 0) return [];
    await tx.notification.createMany({
      data: members.map((m) => ({
        userId: m.userId,
        type: NOTI_DEADLINE.type,
        title: text.title,
        body: text.body,
        linkUrl: text.linkUrl,
        channel: NotifChannel.inapp,
        sentAt: new Date(),
      })),
    });
    return members.map((m) => m.user);
  });

  if (to.length > 0) await sendAlertMails(to, text);
  return to.length;
}

/**
 * 마감 알림 한 번. `entryIds`는 개발에서 제 팀 하나만 부를 때 쓴다 — 크론은 넘기지 않는다.
 */
export async function runDeadlineReminders(
  args: { now?: Date; entryIds?: string[] } = {},
): Promise<DeadlineRemindResult> {
  const now = args.now ?? devNow();
  const result: DeadlineRemindResult = { at: now.toISOString(), sent: [] };
  const only = args.entryIds ? { id: { in: args.entryIds } } : {};

  const seasons = await prisma.season.findMany({
    where: { phase: SeasonPhase.racing },
    select: {
      id: true,
      stages: { select: { stageKey: true, isGate: true, opensAt: true, closesAt: true } },
    },
  });

  for (const season of seasons) {
    const note = async (entryId: string, kind: Kind, dday: string) => {
      const people = await remindOne(entryId, kind, dday);
      if (people > 0) result.sent.push({ entryId, kind, people });
    };

    // ── 게이트 ──────────────────────────────────────────────
    for (const gate of season.stages.filter((s) => s.isGate)) {
      if (gate.stageKey !== StageKey.s2 && gate.stageKey !== StageKey.s5) continue;
      const closesAt = gate.closesAt;
      if (!closesAt) continue;
      const dday = remindLabel(closesAt, now, REMIND_DAYS.gate);
      if (!dday) continue;

      const entries = await prisma.entry.findMany({
        where: { seasonId: season.id, status: EntryStatus.active, ...only },
        select: { id: true, status: true, stage: true, raceStartedAt: true },
      });
      for (const e of entries) {
        if (gateMissTarget(gate.stageKey, e, closesAt)) await note(e.id, gate.stageKey, dday);
      }
    }

    // ── s4 주간 ─────────────────────────────────────────────
    const s4 = season.stages.find((s) => s.stageKey === StageKey.s4);
    const s4Close = stageWindows(season.stages)[StageKey.s4]?.closesAt ?? null;
    if (!s4 || (s4Close && s4Close <= now)) continue;

    const racers = await prisma.entry.findMany({
      where: {
        seasonId: season.id,
        status: EntryStatus.active,
        raceStartedAt: { not: null },
        stage: { notIn: [EntryStage.s5, EntryStage.completed] },
        ...only,
      },
      select: { id: true, raceStartedAt: true },
    });
    for (const e of racers) {
      const base = raceWeekBase(e.raceStartedAt, s4.opensAt);
      const week = currentWeek(base, now);
      const due = weekDue(base, week, s4Close);
      if (!due) continue;
      const dday = remindLabel(due, now, REMIND_DAYS.week);
      if (!dday) continue;
      const done = await prisma.submission.count({
        where: {
          entryId: e.id,
          stageKey: StageKey.s4,
          week,
          status: { in: [SubmissionStatus.submitted, SubmissionStatus.locked] },
        },
      });
      if (done === 0) await note(e.id, "week", dday);
    }
  }

  return result;
}
