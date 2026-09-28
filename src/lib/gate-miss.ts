import { NOTI_GATE_MISSED } from "@/content/notifications";
import {
  EntryStage,
  EntryStatus,
  NotifChannel,
  SeasonPhase,
  StageKey,
} from "@/generated/prisma/client";
import { writeAudit } from "@/lib/admin-store";
import { devNow } from "@/lib/dev-clock";
import { runFinalAutoSubmit, type FinalAutoSubmitResult } from "@/lib/final-submit";
import { prisma } from "@/lib/prisma";
import { gateMissTarget } from "@/lib/submission";

/*
  게이트 미제출 탈락 — PLN7 1-3 「게이트 마감까지 미제출한 팀은 크론이 자동으로
  result=fail 판정 행을 생성해 탈락시킵니다」, 운영규칙 제9조③ 「심사 마감까지
  미제출한 팀은 미통과로 처리됨」. 2026-09-28 수연 지시.

  게이트(s2·s5) 마감이 지났는데 그 게이트를 안 낸 참가 중인 팀(submission.ts
  `gateMissTarget`)을 탈락(eliminated)시킨다. 진도는 그대로 둔다 — PLN7 1장 「fail →
  진도는 보존」, 스키마 EntryStatus 주석과 같다.

  ⚠️ **판정 행은 만들지 않는다.** `judgments`는 제출 행에 붙는데(submission_id 필수)
  낸 것이 없다. 제출 행을 지어내면 심사 콘솔에 「낸 팀」으로 뜬다. 시안의 심사 콘솔도
  이 팀을 판정 없는 줄 「미제출, 마감 경과, 크론 자동 처리」로 그린다(judging-store의
  `missed`) — 탈락 + 감사 로그가 그 줄의 전부다. 사유는 시안 문구 「마감 미제출」.

  팀원마다 알림을 한 줄씩 남긴다(`NOTI_GATE_MISSED`, 2026-09-28 수연 확정) — 운영자
  판정 통지와 같은 모양이다. 운영규칙 제9조③이 미통과를 통지하라고 하고, 제11조
  이의신청 기한이 「결과 통지 후 5영업일」이라 이 발송 시각이 그 기산점이다.

  s5는 자동 제출(final-submit.ts)이 **먼저** 돈다(`runGateDeadlines`). 레이스를 시작한
  팀은 그때 냈고, 여기에 남는 것은 배포하지 않은 팀이다. 판정 함수도 자동 제출
  대상을 한 번 더 빼므로, 자동 제출이 겹쳐 놓친 팀을 여기서 떨어뜨리는 일은 없다.

  레이스 페이즈의 시즌만 본다. 판정에만 개발 시계를 쓴다(phase-schedule.ts와 같다).
*/

export type GateMissResult = {
  at: string;
  /** 탈락시킨 참가 */
  eliminated: { seasonId: string; entryId: string; gate: StageKey }[];
  /** 읽은 뒤 바뀌어(그 사이 제출·상태 변경) 이번 실행에서 놓은 참가 수 */
  raced: number;
};

type Target = { id: string; status: EntryStatus; stage: EntryStage; raceStartedAt: Date | null };

/**
 * 게이트 앞 구간. 게이트는 s2·s5 둘이다(judging-store `GATE_NO`) — 없는 키는 게이트가
 * 아니다. 읽는 양을 줄이는 데만 쓰고 판정은 `gateMissTarget` 하나다.
 */
const BEFORE_GATE: Partial<Record<StageKey, EntryStage[]>> = {
  [StageKey.s2]: [EntryStage.applied, EntryStage.s1],
  [StageKey.s5]: [EntryStage.s3, EntryStage.s4],
};

/**
 * 한 팀을 탈락시킨다. 상태·감사 로그·통지가 한 트랜잭션이다. 읽은 때의 진도·상태
 * 그대로일 때만 쓴다 — 그 사이 게이트를 냈으면(진도가 올랐다) 떨어뜨리지 않는다.
 * 운영자의 수동 상태 변경(admin-store `setEntryStatus`)과 같은 모양으로 남긴다.
 */
async function eliminateOne(
  seasonId: string,
  entry: Target,
  gate: StageKey,
  closesAt: Date,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const moved = await tx.entry.updateMany({
      where: { id: entry.id, status: EntryStatus.active, stage: entry.stage },
      data: { status: EntryStatus.eliminated },
    });
    if (moved.count === 0) return false;

    await writeAudit(tx, {
      actorId: null,
      action: "entry.status",
      targetType: "entry",
      targetId: entry.id,
      reason: "마감 미제출",
      meta: {
        from: EntryStatus.active,
        to: EntryStatus.eliminated,
        seasonId,
        gate,
        closesAt: closesAt.toISOString(),
        stage: entry.stage,
        by: "cron",
      },
    });

    const text = NOTI_GATE_MISSED[gate === StageKey.s2 ? 1 : 2];
    const members = await tx.teamMember.findMany({
      where: { team: { entries: { some: { id: entry.id } } } },
      select: { userId: true },
    });
    await tx.notification.createMany({
      data: members.map((m) => ({
        userId: m.userId,
        type: NOTI_GATE_MISSED.type,
        title: text.title,
        body: text.body,
        linkUrl: text.linkUrl,
        channel: NotifChannel.inapp,
        /* 통지 시각이 이의신청 기한의 기산점이다 — 판정에 쓴 개발 시계가 아니라 진짜 지금 */
        sentAt: new Date(),
      })),
    });
    return true;
  });
}

/**
 * 마감이 지난 게이트마다 안 낸 팀을 탈락시킨다.
 * `entryIds`는 개발 바가 제 팀 하나만 부를 때 쓴다 — 크론은 넘기지 않는다.
 */
export async function runGateMiss(
  args: { now?: Date; entryIds?: string[] } = {},
): Promise<GateMissResult> {
  const now = args.now ?? devNow();
  const result: GateMissResult = { at: now.toISOString(), eliminated: [], raced: 0 };

  const seasons = await prisma.season.findMany({
    where: {
      phase: SeasonPhase.racing,
      stages: { some: { isGate: true, closesAt: { lte: now } } },
    },
    select: {
      id: true,
      stages: { where: { isGate: true }, select: { stageKey: true, closesAt: true } },
    },
  });

  for (const season of seasons) {
    for (const { stageKey: gate, closesAt } of season.stages) {
      const before = BEFORE_GATE[gate];
      if (!before || !closesAt || closesAt > now) continue;

      const entries = await prisma.entry.findMany({
        where: {
          seasonId: season.id,
          status: EntryStatus.active,
          stage: { in: before },
          ...(args.entryIds ? { id: { in: args.entryIds } } : {}),
        },
        select: { id: true, status: true, stage: true, raceStartedAt: true },
      });

      for (const entry of entries) {
        if (!gateMissTarget(gate, entry, closesAt)) continue;
        if (await eliminateOne(season.id, entry, gate, closesAt)) {
          result.eliminated.push({ seasonId: season.id, entryId: entry.id, gate });
        } else {
          result.raced += 1;
        }
      }
    }
  }

  return result;
}

/**
 * 게이트 마감 처리 한 번 — s5 자동 제출 → 미제출 탈락, **이 순서로.** 거꾸로 돌면
 * 버튼을 안 누른 레이스 팀이 s5 미제출로 떨어진다. 페이즈 크론과 개발 바가 이것 하나를 부른다.
 */
export async function runGateDeadlines(
  args: { now?: Date; entryIds?: string[] } = {},
): Promise<{ final: FinalAutoSubmitResult; missed: GateMissResult }> {
  const final = await runFinalAutoSubmit(args);
  const missed = await runGateMiss(args);
  return { final, missed };
}
