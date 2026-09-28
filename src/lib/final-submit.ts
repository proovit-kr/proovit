import {
  EntryStage,
  EntryStatus,
  Prisma,
  SeasonPhase,
  StageKey,
  SubmissionStatus,
} from "@/generated/prisma/client";
import { writeAudit } from "@/lib/admin-store";
import { devNow } from "@/lib/dev-clock";
import { prisma } from "@/lib/prisma";
import { raceEndAt } from "@/lib/race";
import { SINGLE_WEEK, finalAutoSubmitTarget } from "@/lib/submission";

/*
  s5 자동 제출 — PRD FR-H6(P0) 「s5 최종 제출은 지표가 자동 집계되므로 자동 제출
  처리하고, 제출 화면은 확인 버튼 역할만 한다」. 2026-09-27 수연 지시.

  s5 마감이 지나면 확인 버튼을 누르지 않은 대상 팀(submission.ts
  `finalAutoSubmitTarget`)의 s5를 제출로 적고 진도를 s5로 올린다 — 버튼을 눌렀을
  때(`saveStage`)와 같은 결과다. 이것이 없으면 두 곳이 빈다.
    · 2차 심사 콘솔은 s5 제출이 있는 팀만 줄 세운다(judging-store) — 안 누른 팀이
      심사 대상에서 빠진다.
    · 완주(운영규칙 제11조의2)의 요건이 「최종 심사 마감 전 스테이지 5 제출
      존재(플랫폼 자동 제출 포함)」다.

  페이즈 크론(`/api/v1/cron/phase`, 15분마다)이 부른다 — 운영 배포에서만 돈다.
  로컬에서는 개발 바 「제출」 줄의 「s5 자동 제출」이 그 팀 하나에만 부른다.

  ⚠️ **자동 제출의 표지는 `submitted_by`가 빈 것이다.** 사람이 누른 제출은 언제나
  누른 사람이 남고(`saveStage`), 탈퇴는 회원 행을 지우지 않고 익명화하므로
  (settings/actions.ts) 누른 사람이 사라져 비는 일도 없다. 스키마는 그대로다.

  ⚠️ `submitted_at`은 **s5 마감 시각**이다. 크론은 최대 15분 늦게 돌지만 제출은
  마감에 이뤄진 것으로 친다 — 동점 처리의 「최종 제출 시각」(심사 기준서)에서도
  버튼을 누른 팀이 앞선다. 처리한 때는 `created_at`·`updated_at`과 감사 로그에 남는다.

  초안이 있으면 그 초안을 그대로 제출로 올린다(회고·토글이 남는다). 검증은 하지
  않는다 — 마감 뒤라 팀이 고칠 수 없는 값이다. 그래서 자동 제출 행에는 아카이브
  공개 동의(`archiveConsent`)가 없을 수 있다. 아카이브는 그 값이 true인 행만 싣는다.

  레이스 페이즈의 시즌만 본다. 시상(awarded) 뒤에는 결과가 굳었다.
  판정에만 개발 시계를 쓴다(phase-schedule.ts와 같다).
*/

export type FinalAutoSubmitResult = {
  /** 판정에 쓴 「지금」 */
  at: string;
  /** 자동 제출한 참가 */
  submitted: { seasonId: string; entryId: string }[];
  /** 읽은 뒤 바뀌어(다른 실행·실격) 이번 실행에서 놓은 참가 수 */
  raced: number;
};

/** 읽은 뒤에 진도·상태가 바뀌었다 — 트랜잭션을 되돌리는 신호 */
class Stale extends Error {}

type Target = { id: string; status: EntryStatus; stage: EntryStage; raceStartedAt: Date | null };

/**
 * 한 팀의 s5를 자동 제출한다. 제출 → 진도 → 감사 로그가 한 트랜잭션이다.
 *
 * `saveStage`와 같은 순서(제출 행 → 참가 행)로 잡는다 — 둘이 서로를 기다리다
 * 교착하지 않게. 진도는 조건부 갱신으로 올려 읽은 때 그대로인지 다시 본다
 * (겹친 크론 실행, 그 사이의 실격). 0건이면 되돌린다.
 */
async function submitOne(seasonId: string, entry: Target, closesAt: Date): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      const where = {
        entryId_stageKey_week: { entryId: entry.id, stageKey: StageKey.s5, week: SINGLE_WEEK },
      };
      const row = await tx.submission.findUnique({ where, select: { id: true, status: true } });
      if (!row) {
        await tx.submission.create({
          data: {
            entryId: entry.id,
            stageKey: StageKey.s5,
            week: SINGLE_WEEK,
            status: SubmissionStatus.submitted,
            submittedAt: closesAt,
          },
        });
      } else if (row.status === SubmissionStatus.draft) {
        await tx.submission.updateMany({
          where: { id: row.id, status: SubmissionStatus.draft },
          data: { status: SubmissionStatus.submitted, submittedAt: closesAt, submittedBy: null },
        });
      }

      const moved = await tx.entry.updateMany({
        where: { id: entry.id, status: EntryStatus.active, stage: entry.stage },
        data: { stage: EntryStage.s5 },
      });
      if (moved.count === 0) throw new Stale();

      await writeAudit(tx, {
        actorId: null,
        action: "submission.auto",
        targetType: "entry",
        targetId: entry.id,
        reason: "s5 마감에 따른 자동 제출(FR-H6)",
        meta: {
          seasonId,
          stageKey: StageKey.s5,
          closesAt: closesAt.toISOString(),
          /* 팀이 쓰던 초안을 올렸는가, 빈 행을 만들었는가 */
          fromDraft: row !== null,
          by: "cron",
        },
      });
    });
    return true;
  } catch (error) {
    if (error instanceof Stale) return false;
    /* 없던 행을 두 실행이 같이 만들면 @@unique([entry_id, stage_key, week])에 걸린다 */
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return false;
    }
    throw error;
  }
}

/**
 * s5 마감이 지난 레이스 시즌을 돌며 대상 팀을 자동 제출한다.
 * `entryIds`는 개발 바가 제 팀 하나만 부를 때 쓴다 — 크론은 넘기지 않는다.
 */
export async function runFinalAutoSubmit(
  args: { now?: Date; entryIds?: string[] } = {},
): Promise<FinalAutoSubmitResult> {
  const now = args.now ?? devNow();
  const result: FinalAutoSubmitResult = { at: now.toISOString(), submitted: [], raced: 0 };

  const seasons = await prisma.season.findMany({
    where: {
      phase: SeasonPhase.racing,
      stages: { some: { stageKey: StageKey.s5, closesAt: { lte: now } } },
    },
    select: { id: true, stages: { select: { stageKey: true, closesAt: true } } },
  });

  for (const season of seasons) {
    const closesAt = raceEndAt(season.stages);
    if (!closesAt) continue;

    /* 거르는 것은 판정 함수 하나다 — 여기 조건은 읽는 양을 줄이는 데만 쓴다 */
    const entries = await prisma.entry.findMany({
      where: {
        seasonId: season.id,
        status: EntryStatus.active,
        raceStartedAt: { not: null },
        stage: { notIn: [EntryStage.s5, EntryStage.completed] },
        ...(args.entryIds ? { id: { in: args.entryIds } } : {}),
      },
      select: { id: true, status: true, stage: true, raceStartedAt: true },
    });

    for (const entry of entries) {
      if (!finalAutoSubmitTarget(entry, closesAt)) continue;
      if (await submitOne(season.id, entry, closesAt)) {
        result.submitted.push({ seasonId: season.id, entryId: entry.id });
      } else {
        result.raced += 1;
      }
    }
  }

  return result;
}
