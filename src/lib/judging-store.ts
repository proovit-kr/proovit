import {
  EntryStage,
  EntryStatus,
  JudgmentResult,
  NotifChannel,
  StageKey,
  SubmissionStatus,
} from "@/generated/prisma/enums";
import { NOTI_JUDGMENT } from "@/content/notifications";
import { stageAtLeast } from "@/lib/access-policy";
import {
  FEEDBACK_MIN,
  PASS_ADVANCES_TO,
  REVISION_HOURS,
  type JudgingFailureCode,
} from "@/lib/judging";
import { prisma } from "@/lib/prisma";
import { raceEndAt, teamRaceWindow } from "@/lib/race";

/*
  심사 판정 저장. **서버 전용이다.**

  ⚠️ 판정 하나가 세 가지를 동시에 바꾼다 — 판정 기록 · 진도 · 참가 상태.
  셋이 한 트랜잭션이 아니면 "통과했는데 진도가 안 올라간 팀"이 생기고, 그 팀은
  다음 제출을 못 낸다(canSubmitStage가 진도를 본다).

  감사 로그도 같은 트랜잭션에 넣는다 — 심사는 되돌리기 어려운 판단이고
  이의신청(제11조)이 걸리면 "누가 언제 무엇을 근거로" 판정했는지가 답이 된다.
*/

/** 게이트 번호 — s2가 1, s5가 2(시안 「GATE 1」) */
export const GATE_NO: Partial<Record<StageKey, 1 | 2>> = {
  [StageKey.s2]: 1,
  [StageKey.s5]: 2,
};

export type JudgingRow = {
  entryId: string;
  teamName: string;
  /** 제출이 없으면 null — 마감이 지나 탈락한 팀(시안의 줄 그은 행) */
  submissionId: string | null;
  submittedAt: Date | null;
  /** s5 마감에 플랫폼이 낸 제출(final-submit.ts) — 누른 사람이 없다 */
  auto: boolean;
  /** 시안 「제출 요약」 — 판정에 필요한 숫자만 한 줄로 */
  summary: string;
  judgment: { result: JudgmentResult; feedback: string | null } | null;
};

export type JudgingBoard = {
  gates: { stageKey: StageKey; no: 1 | 2; closesAt: Date | null }[];
  gate: { stageKey: StageKey; no: 1 | 2; closesAt: Date | null } | null;
  rows: JudgingRow[];
  /** 판정이 안 붙은 제출 수 — 시안 「잔여 4팀」 */
  remaining: number;
};

/**
 * 심사 콘솔 — 시안 `#scr-adm-judging`(3065행). 게이트 하나의 제출을 표로.
 *
 * 줄은 두 가지다 — 그 게이트에 낸 팀, 그리고 **내지 않고 마감을 넘겨 탈락한 팀**
 * (시안 「모카브루 미제출, 마감 경과」). 뒤엣것은 판정할 것이 없어 줄을 긋는다.
 *
 * ⚠️ `submissions`에는 `stages`로 가는 관계가 없다(stage_key가 ENUM이라 FK가 아니다).
 * 게이트 키를 먼저 읽어 건다.
 */
export async function loadJudgingBoard(
  seasonId: string,
  pick: string | undefined,
  now: Date,
): Promise<JudgingBoard> {
  const stages = await prisma.stage.findMany({
    where: { seasonId, isGate: true },
    orderBy: { stageKey: "asc" },
    select: { stageKey: true, closesAt: true, opensAt: true },
  });
  const gates = stages
    .filter((st) => GATE_NO[st.stageKey])
    .map((st) => ({ stageKey: st.stageKey, no: GATE_NO[st.stageKey]!, closesAt: st.closesAt }));

  /*
    고르지 않았으면 **지금 심사할 게이트** — 마감이 지난 것 중 가장 늦은 것,
    아직 아무 마감도 안 지났으면 첫 게이트다.
  */
  const passed = gates.filter((g) => g.closesAt && g.closesAt <= now);
  const gate =
    gates.find((g) => g.stageKey === pick) ?? passed[passed.length - 1] ?? gates[0] ?? null;
  if (!gate) return { gates, gate: null, rows: [], remaining: 0 };

  const [submissions, missed] = await Promise.all([
    prisma.submission.findMany({
      where: {
        stageKey: gate.stageKey,
        status: { in: [SubmissionStatus.submitted, SubmissionStatus.locked] },
        entry: { seasonId },
      },
      orderBy: [{ submittedAt: "asc" }],
      select: {
        id: true,
        submittedAt: true,
        submittedBy: true,
        payload: true,
        evidenceUrls: true,
        entry: {
          select: {
            id: true,
            team: { select: { name: true } },
            raceStartedAt: true,
            metricDaily: {
              select: {
                metricDate: true,
                signups: true,
                validVisitors: true,
                manualReviewPassed: true,
              },
            },
          },
        },
        judgments: {
          orderBy: { judgedAt: "desc" },
          take: 1,
          select: { result: true, feedback: true },
        },
      },
    }),
    /* 마감이 지났는데 그 게이트 제출이 없고 탈락한 팀 */
    gate.closesAt && gate.closesAt <= now
      ? prisma.entry.findMany({
          where: {
            seasonId,
            status: EntryStatus.eliminated,
            submissions: {
              none: {
                stageKey: gate.stageKey,
                status: { in: [SubmissionStatus.submitted, SubmissionStatus.locked] },
              },
            },
            stage: gate.stageKey === StageKey.s2 ? EntryStage.s1 : EntryStage.s4,
          },
          select: { id: true, team: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  /* 레이스 끝 — 2차 요약의 유효 이용자를 리더보드와 같은 구간으로 센다(아래) */
  const raceEnd = raceEndAt(stages);
  const rows: JudgingRow[] = [
    ...submissions.map((row) => {
      const payload = (row.payload ?? {}) as { channels?: unknown };
      const evidence = row.evidenceUrls.length;
      const sum = (k: "signups" | "validVisitors") =>
        row.entry.metricDaily.reduce((a, m) => a + m[k], 0);
      /*
        2차(s5)의 유효 이용자는 **레이스 누적**이다 — 그 팀의 레이스 구간·검수 통과한
        날만(race.ts, 2026-09-26). 리더보드의 같은 팀과 숫자가 달라지면 안 된다.
        1차(s2)의 유효 신청은 레이스 전의 수요 신호라 전부 센다.
      */
      const race = teamRaceWindow({ startedAt: row.entry.raceStartedAt, endsAt: raceEnd, now });
      const raceVisitors = race
        ? row.entry.metricDaily
            .filter(
              (m) =>
                m.manualReviewPassed &&
                m.metricDate >= race.firstDay &&
                m.metricDate <= race.lastDay,
            )
            .reduce((a, m) => a + m.validVisitors, 0)
        : 0;
      const summary =
        gate.stageKey === StageKey.s2
          ? `유효 신청 ${sum("signups")}, 채널 ${
              Array.isArray(payload.channels) ? payload.channels.length : 0
            }, 증빙 ${evidence}건`
          : `유효 이용자 ${raceVisitors}, 증빙 ${evidence}건`;
      return {
        entryId: row.entry.id,
        teamName: row.entry.team.name,
        submissionId: row.id,
        submittedAt: row.submittedAt,
        auto: row.submittedAt !== null && row.submittedBy === null,
        summary,
        judgment: row.judgments[0] ?? null,
      };
    }),
    ...missed.map((e) => ({
      entryId: e.id,
      teamName: e.team.name,
      submissionId: null,
      submittedAt: null,
      auto: false,
      summary: "마감 경과",
      judgment: null,
    })),
  ];

  return {
    gates,
    gate,
    rows,
    remaining: rows.filter((r) => r.submissionId && !r.judgment).length,
  };
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
 * 이미 판정한 제출을 다시 판정하면 **새 판정 행을 붙인다**(시안 감사 로그
 * 「judgment.update, 시들지마 fail→pass, 증빙 재확인」). 덮어쓰지 않는다 — 덮어쓰면
 * "그때 무엇으로 판정했는지"가 사라진다. 화면은 가장 늦은 판정을 읽는다.
 * 뒤집히면 참가 상태도 따라간다 — 미통과→통과는 탈락을 풀고 진도를 올린다.
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
      judgments: {
        orderBy: { judgedAt: "desc" },
        take: 1,
        select: { result: true, feedback: true },
      },
    },
  });
  if (!submission) return { ok: false, code: "NOT_FOUND" };
  if (submission.status === SubmissionStatus.draft) {
    return { ok: false, code: "NOT_SUBMITTED" };
  }
  const prev = submission.judgments[0] ?? null;
  if (prev && prev.result === result && (prev.feedback ?? "") === feedback) {
    return { ok: false, code: "UNCHANGED" };
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
      /* 미통과를 뒤집었다 — 그 판정이 매긴 탈락을 푼다(실격은 건드리지 않는다) */
      if (prev?.result === JudgmentResult.fail && submission.entry.status === EntryStatus.eliminated) {
        await tx.entry.update({
          where: { id: submission.entryId },
          data: { status: EntryStatus.active },
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
        action: prev ? "judgment.update" : "judgment.record",
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
          ...(prev ? { from: prev.result, to: result } : { result }),
        },
      },
    });

    /*
      통지 — 시안 일괄 저장 모달 「저장 즉시 참가자에게 판정과 사유가 통지되고」.
      사람마다 한 행이다(notify-store.ts 같은 이유). 보완(revision)은 운영 화면이
      더는 고르지 않으므로 통지 문구가 없다.
    */
    const gateNo = GATE_NO[submission.stageKey];
    /* 사유만 고친 재판정은 결과가 그대로라 다시 알리지 않는다 */
    const text =
      gateNo &&
      prev?.result !== result &&
      (result === JudgmentResult.pass || result === JudgmentResult.fail)
        ? NOTI_JUDGMENT[result][gateNo]
        : null;
    if (text) {
      const members = await tx.teamMember.findMany({
        where: { team: { entries: { some: { id: submission.entryId } } } },
        select: { userId: true },
      });
      await tx.notification.createMany({
        data: members.map((m) => ({
          userId: m.userId,
          type: NOTI_JUDGMENT.type,
          title: text.title,
          body: text.body,
          linkUrl: text.linkUrl,
          channel: NotifChannel.inapp,
          sentAt: now,
        })),
      });
    }
  });

  return { ok: true };
}

export type BatchItem = { submissionId: string; result: JudgmentResult; feedback: string };

/**
 * 판정 일괄 저장 — 시안 「판정 일괄 저장」 → `#mdl-batch` 「저장하고 통지」.
 *
 * 줄마다 따로 저장한다(`judgeSubmission`이 줄마다 한 트랜잭션). 한 줄이 실패해도
 * 나머지는 들어가고, 실패한 줄은 팀명과 이유를 돌려준다 — 전부 되돌리면 이미
 * 확인을 끝낸 판정까지 다시 적어야 한다.
 */
export async function judgeBatch(args: {
  items: BatchItem[];
  judgeId: string;
}): Promise<{ saved: number; failed: { submissionId: string; code: JudgingFailureCode }[] }> {
  let saved = 0;
  const failed: { submissionId: string; code: JudgingFailureCode }[] = [];
  for (const item of args.items) {
    const r = await judgeSubmission({ ...item, judgeId: args.judgeId });
    if (r.ok) saved += 1;
    else failed.push({ submissionId: item.submissionId, code: r.code });
  }
  return { saved, failed };
}
