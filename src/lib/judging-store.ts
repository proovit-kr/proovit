import {
  EntryStatus,
  JudgmentResult,
  StageKey,
  SubmissionStatus,
} from "@/generated/prisma/enums";
import { stageAtLeast } from "@/lib/access-policy";
import {
  FEEDBACK_MIN,
  PASS_ADVANCES_TO,
  REVISION_HOURS,
  type JudgingFailureCode,
} from "@/lib/judging";
import { prisma } from "@/lib/prisma";

/*
  심사 판정 저장. **서버 전용이다.**

  ⚠️ 판정 하나가 세 가지를 동시에 바꾼다 — 판정 기록 · 진도 · 참가 상태.
  셋이 한 트랜잭션이 아니면 "통과했는데 진도가 안 올라간 팀"이 생기고, 그 팀은
  다음 제출을 못 낸다(canSubmitStage가 진도를 본다).

  감사 로그도 같은 트랜잭션에 넣는다 — 심사는 되돌리기 어려운 판단이고
  이의신청(제11조)이 걸리면 "누가 언제 무엇을 근거로" 판정했는지가 답이 된다.
*/

export type PendingSubmission = {
  submissionId: string;
  entryId: string;
  teamName: string;
  ideaTitle: string;
  stageKey: StageKey;
  submittedAt: Date | null;
  payload: unknown;
  evidenceUrls: string[];
  /** 이미 판정이 붙었으면 그 결과 */
  judgment: { result: string; feedback: string | null; judgedAt: Date } | null;
};

/**
 * 심사 대상 목록.
 *
 * 게이트 스테이지의 제출만 가져온다 — 나머지는 제출만 받고 통과 처리로 넘긴다
 * (PLN6 0장). 판정이 안 붙은 것을 위로 올린다.
 *
 * ⚠️ `submissions`에는 `stages`로 가는 관계가 없다(stage_key가 ENUM이라 FK가 아니다).
 * 게이트 키를 먼저 읽어 `in`으로 건다.
 */
export async function loadJudgingQueue(
  seasonId: string,
): Promise<PendingSubmission[]> {
  const gates = await prisma.stage.findMany({
    where: { seasonId, isGate: true },
    select: { stageKey: true },
  });
  if (gates.length === 0) return [];

  const rows = await prisma.submission.findMany({
    where: {
      stageKey: { in: gates.map((gate) => gate.stageKey) },
      status: { in: [SubmissionStatus.submitted, SubmissionStatus.locked] },
      entry: { seasonId },
    },
    orderBy: [{ submittedAt: "asc" }],
    select: {
      id: true,
      stageKey: true,
      submittedAt: true,
      payload: true,
      evidenceUrls: true,
      entry: {
        select: { id: true, ideaTitle: true, team: { select: { name: true } } },
      },
      judgments: {
        orderBy: { judgedAt: "desc" },
        take: 1,
        select: { result: true, feedback: true, judgedAt: true },
      },
    },
  });

  const mapped = rows.map((row) => ({
    submissionId: row.id,
    entryId: row.entry.id,
    teamName: row.entry.team.name,
    ideaTitle: row.entry.ideaTitle,
    stageKey: row.stageKey,
    submittedAt: row.submittedAt,
    payload: row.payload,
    evidenceUrls: row.evidenceUrls,
    judgment: row.judgments[0] ?? null,
  }));

  /* 판정 안 된 것이 먼저다 — 운영이 여는 이유가 그것이다 */
  return mapped.sort((a, b) => {
    if (!a.judgment && b.judgment) return -1;
    if (a.judgment && !b.judgment) return 1;
    return 0;
  });
}

export type JudgeResult =
  | { ok: true }
  | { ok: false; code: JudgingFailureCode };

/**
 * 판정.
 *
 * 결과가 무엇을 바꾸는지는 judging.ts의 표가 정한다.
 *   통과 → 진도 전진 (s2→s3, s5→completed)
 *   보완 → 재제출 기한 48시간. 진도·상태 그대로
 *   미통과 → **탈락**(eliminated). 실격이 아니다(제9조 ④)
 *
 * ⚠️ 이미 판정한 제출은 다시 판정하지 않는다. 정정은 이의신청 절차로 하고
 * (제11조 ③) 그때 새 판정을 붙인다 — 덮어쓰면 "그때 무엇으로 판정했는지"가 사라진다.
 */
export async function judgeSubmission(args: {
  submissionId: string;
  result: JudgmentResult;
  feedback: string;
  judgeId: string;
}): Promise<JudgeResult> {
  const { submissionId, result, judgeId } = args;
  const feedback = args.feedback.trim();

  /* 통과에도 사유를 받는다 — 통과 근거가 없으면 다음 시즌에 기준을 못 맞춘다 */
  if (feedback.length < FEEDBACK_MIN) {
    return { ok: false, code: "FEEDBACK_TOO_SHORT" };
  }

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      status: true,
      stageKey: true,
      entryId: true,
      entry: { select: { stage: true, status: true } },
      judgments: { select: { id: true }, take: 1 },
    },
  });
  if (!submission) return { ok: false, code: "NOT_FOUND" };
  if (submission.status === SubmissionStatus.draft) {
    return { ok: false, code: "NOT_SUBMITTED" };
  }
  if (submission.judgments.length > 0) {
    return { ok: false, code: "ALREADY_JUDGED" };
  }

  const now = new Date();
  const advanceTo = PASS_ADVANCES_TO[submission.stageKey];

  await prisma.$transaction(async (tx) => {
    await tx.judgment.create({
      data: {
        submissionId,
        result,
        feedback,
        judgedBy: judgeId,
        judgedAt: now,
        /*
          배점(score_breakdown)·채점식 버전은 비운다. 채점식이 확정되지 않아
          지금 넣을 수 있는 값이 없고, 없는 숫자를 넣으면 그게 곧 근거가 된다.
        */
      },
    });

    if (result === JudgmentResult.pass && advanceTo) {
      /* 뒤로는 안 내린다 — 재판정으로 진도가 후퇴하면 통과한 팀이 대기로 떨어진다 */
      if (!stageAtLeast(submission.entry.stage, advanceTo)) {
        await tx.entry.update({
          where: { id: submission.entryId },
          data: { stage: advanceTo },
        });
      }
      /* 제출을 잠근다 — 판정이 끝난 제출은 더 못 고친다 */
      await tx.submission.update({
        where: { id: submissionId },
        data: { status: SubmissionStatus.locked },
      });
    }

    if (result === JudgmentResult.revision) {
      await tx.submission.update({
        where: { id: submissionId },
        data: {
          revisionDueAt: new Date(now.getTime() + REVISION_HOURS * 3600 * 1000),
          /* 다시 손댈 수 있어야 하므로 잠그지 않는다 */
          status: SubmissionStatus.submitted,
        },
      });
    }

    if (result === JudgmentResult.fail) {
      await tx.entry.update({
        where: { id: submission.entryId },
        data: { status: EntryStatus.eliminated },
      });
      await tx.submission.update({
        where: { id: submissionId },
        data: { status: SubmissionStatus.locked },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: judgeId,
        action: `judgment:${result}`,
        targetType: "submission",
        targetId: submissionId,
        reason: feedback,
        meta: {
          entryId: submission.entryId,
          stageKey: submission.stageKey,
          stageFrom: submission.entry.stage,
          stageTo:
            result === JudgmentResult.pass && advanceTo
              ? advanceTo
              : submission.entry.stage,
        },
      },
    });
  });

  return { ok: true };
}
