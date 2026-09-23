import { AbuseStatus, JudgmentResult, SanctionStatus } from "@/generated/prisma/enums";
import {
  APPEAL_REASON_MIN,
  type AppealFailureCode,
} from "@/lib/appeal";
import {
  type AppealRecord,
  type AppealTargetKind,
  type AppealTargetRow,
  type AppealView,
  buildAppealView,
  responseDeadline,
} from "@/lib/appeal-view";
import { APPEAL_TARGET } from "@/content/appeal";
import { EVIDENCE_COUNT_MAX, foreignEvidence } from "@/lib/evidence";
import { fmtMD } from "@/lib/header-state";
import { prisma } from "@/lib/prisma";

/*
  소명 저장. **서버 전용이다.**

  ⚠️ 이 화면은 **실격 팀에게 열려 있어야 하는 유일한 쓰기 화면**이다(라우트 정책
  `allowInactive`). 실격을 다투는 자리를 실격이라는 이유로 막으면 분쟁 창구가
  사라진다 — 규칙 제6조가 보장한 절차를 우리가 닫는 셈이 된다.

  접수는 **`appeals` 행 하나**다(회신·회신 기한이 거기 붙는다). 대상이 제재나
  플래그면 그 표의 `appeal_text`·`appealed_at`도 같이 찍는다 — 헤더의 「소명
  접수됨」과 운영 어뷰징 화면이 그 칸을 읽는다(내가 정함, 2026-09-23, 수연 확인
  대기: 표 셋이 갈라 놓은 창구를 화면 하나로 합치는 대신 기록을 양쪽에 남긴다).
*/

export type AppealResult = { ok: true } | { ok: false; code: AppealFailureCode };

/** 소명 대상의 이름 — content/appeal.ts의 꼴로 */
export function targetLabel(row: AppealTargetRow): string {
  const noticed = APPEAL_TARGET.notice(fmtMD(row.noticeAt));
  if (row.kind === "sanction") {
    const head = APPEAL_TARGET.sanction[row.sanctionStage ?? ""] ?? "제재";
    const week = row.week ? ` ${APPEAL_TARGET.week(row.week)}` : "";
    return `${head}${week} ${noticed}`;
  }
  if (row.kind === "abuse_flag") {
    return `${APPEAL_TARGET.flag} ${
      row.adjusted ? APPEAL_TARGET.adjusted(row.adjusted) : noticed
    }`;
  }
  return `${APPEAL_TARGET.judgment[row.stageKey ?? ""] ?? "심사 판정"} ${noticed}`;
}

/**
 * 소명 대상과 접수 기록. 대상은 셋 — 제재(철회된 것 빼고), 어뷰징 플래그(취소된
 * 것 빼고), 게이트 미통과 판정.
 */
export async function loadAppealView(entryId: string): Promise<AppealView> {
  const [sanctions, flags, judgments, appeals] = await Promise.all([
    prisma.sanction.findMany({
      where: { entryId, status: { not: SanctionStatus.withdrawn } },
      select: {
        id: true,
        stage: true,
        week: true,
        appliedAt: true,
        createdAt: true,
        appealDeadlineAt: true,
        appealedAt: true,
      },
    }),
    prisma.abuseFlag.findMany({
      where: { entryId, status: { not: AbuseStatus.overturned } },
      select: { id: true, adjustedVisitors: true, createdAt: true, appealedAt: true },
    }),
    prisma.judgment.findMany({
      where: { submission: { entryId }, result: JudgmentResult.fail },
      select: { id: true, judgedAt: true, submission: { select: { stageKey: true } } },
    }),
    prisma.appeal.findMany({
      where: { entryId },
      select: {
        id: true,
        targetId: true,
        submittedAt: true,
        responseDueAt: true,
        responseText: true,
        respondedAt: true,
        corrected: true,
      },
    }),
  ]);
  const appealed = new Set(appeals.map((a) => a.targetId));

  const targets: AppealTargetRow[] = [
    ...sanctions.map((s) => ({
      kind: "sanction" as const,
      id: s.id,
      noticeAt: s.appliedAt ?? s.createdAt,
      deadlineAt: s.appealDeadlineAt,
      sanctionStage: s.stage,
      week: s.week,
      appealed: appealed.has(s.id) || s.appealedAt !== null,
    })),
    ...flags.map((f) => ({
      kind: "abuse_flag" as const,
      id: f.id,
      noticeAt: f.createdAt,
      adjusted: f.adjustedVisitors,
      appealed: appealed.has(f.id) || f.appealedAt !== null,
    })),
    ...judgments.map((j) => ({
      kind: "judgment" as const,
      id: j.id,
      noticeAt: j.judgedAt,
      stageKey: j.submission.stageKey,
      appealed: appealed.has(j.id),
    })),
  ];

  const records: AppealRecord[] = appeals.map((a) => ({
    id: a.id,
    submittedAt: a.submittedAt,
    responseDueAt: a.responseDueAt,
    responseText: a.responseText,
    respondedAt: a.respondedAt,
    corrected: a.corrected,
  }));

  return buildAppealView({ targets, appeals: records, label: targetLabel });
}

/**
 * 소명 접수.
 *
 * ⚠️ 회신 기한(`response_due_at`)을 접수 시점에 계산해 저장한다. 나중에 계산하면
 * "언제까지였나"가 코드 버전에 따라 달라진다 — 기한은 접수 순간에 확정돼야 한다.
 */
export async function submitAppeal(args: {
  entryId: string;
  target: { kind: AppealTargetKind; id: string };
  reason: string;
  files: string[];
}): Promise<AppealResult> {
  const { entryId, target } = args;
  const reason = args.reason.trim();
  if (reason.length < APPEAL_REASON_MIN) {
    return { ok: false, code: "REASON_TOO_SHORT" };
  }
  const files = [...new Set(args.files)].slice(0, EVIDENCE_COUNT_MAX);
  if (foreignEvidence(files, entryId, "appeal").length > 0) {
    return { ok: false, code: "BAD_FILES" };
  }

  /* 대상이 이 팀의 것인가 — 표마다 따로 본다 */
  const found =
    target.kind === "sanction"
      ? await prisma.sanction.findFirst({
          where: { id: target.id, entryId, status: { not: SanctionStatus.withdrawn } },
          select: { id: true, appealedAt: true },
        })
      : target.kind === "abuse_flag"
        ? await prisma.abuseFlag.findFirst({
            where: { id: target.id, entryId },
            select: { id: true, appealedAt: true, status: true },
          })
        : await prisma.judgment.findFirst({
            where: { id: target.id, submission: { entryId }, result: JudgmentResult.fail },
            select: { id: true },
          });
  if (!found) return { ok: false, code: "TARGET_NOT_FOUND" };
  if ("appealedAt" in found && found.appealedAt) return { ok: false, code: "ALREADY_APPEALED" };
  if ("status" in found && found.status === AbuseStatus.overturned) {
    return { ok: false, code: "NOT_APPEALABLE" };
  }
  const already = await prisma.appeal.findFirst({
    where: { entryId, targetId: target.id },
    select: { id: true },
  });
  if (already) return { ok: false, code: "ALREADY_APPEALED" };

  const now = new Date();
  await prisma.$transaction([
    prisma.appeal.create({
      data: {
        entryId,
        targetType: target.kind,
        targetId: target.id,
        reasonText: reason,
        evidenceUrls: files,
        submittedAt: now,
        responseDueAt: responseDeadline(now),
      },
    }),
    ...(target.kind === "sanction"
      ? [
          prisma.sanction.update({
            where: { id: target.id },
            data: { appealText: reason, appealedAt: now },
          }),
        ]
      : []),
    ...(target.kind === "abuse_flag"
      ? [
          prisma.abuseFlag.update({
            where: { id: target.id },
            data: {
              appealText: reason,
              appealedAt: now,
              /* 검토 대기였던 플래그만 「소명 접수」로 옮긴다 — 확정된 것은 그대로 */
              ...("status" in found && found.status === AbuseStatus.flagged
                ? { status: AbuseStatus.appealed }
                : {}),
            },
          }),
        ]
      : []),
  ]);
  return { ok: true };
}
