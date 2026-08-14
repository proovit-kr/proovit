import { AbuseStatus, Prisma } from "@/generated/prisma/client";
import {
  APPEAL_REASON_MIN,
  RESPONSE_BUSINESS_DAYS,
  addBusinessDays,
  type AppealFailureCode,
  type AppealTargetType,
} from "@/lib/appeal";
import { prisma } from "@/lib/prisma";

/*
  이의신청·소명 저장. **서버 전용이다.**

  ⚠️ 이 화면은 **실격 팀에게 열려 있어야 하는 유일한 쓰기 화면**이다(PLN3 2장 ·
  라우트 정책 `allowInactive`). 실격을 다투는 자리를 실격이라는 이유로 막으면
  분쟁 창구가 사라진다 — 규칙 제11조가 보장한 절차를 우리가 닫는 셈이 된다.
*/

export type AppealTarget = {
  type: AppealTargetType;
  id: string;
  /** 화면에 보이는 이름 — "s2 랜딩·수요조사 판정" 같은 것 */
  label: string;
  /** 이미 이의신청·소명이 접수됐는가 */
  appealed: boolean;
  when: Date;
};

export type AppealHistory = {
  id: string;
  targetType: string;
  reasonText: string;
  submittedAt: Date;
  responseDueAt: Date | null;
  responseText: string | null;
  respondedAt: Date | null;
  corrected: boolean;
};

export type AppealView = {
  targets: AppealTarget[];
  history: AppealHistory[];
};

/**
 * 이의신청할 수 있는 대상과 지나간 이의신청.
 *
 * 대상은 둘이다 — **게이트 판정**(제11조)과 **어뷰징 플래그**. 참가자에게는 그냥
 * "무엇에 대해 말하려는지" 고르는 목록으로 보인다.
 */
export async function loadAppealView(entryId: string): Promise<AppealView> {
  const [judgments, flags, appeals] = await Promise.all([
    prisma.judgment.findMany({
      where: { submission: { entryId } },
      orderBy: { judgedAt: "desc" },
      select: {
        id: true,
        result: true,
        judgedAt: true,
        submission: { select: { stageKey: true } },
      },
    }),
    prisma.abuseFlag.findMany({
      where: { entryId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        reason: true,
        status: true,
        createdAt: true,
        appealedAt: true,
      },
    }),
    prisma.appeal.findMany({
      where: { entryId },
      orderBy: { submittedAt: "desc" },
      select: {
        id: true,
        targetType: true,
        targetId: true,
        reasonText: true,
        submittedAt: true,
        responseDueAt: true,
        responseText: true,
        respondedAt: true,
        corrected: true,
      },
    }),
  ]);

  const appealedTargets = new Set(appeals.map((appeal) => appeal.targetId));

  const targets: AppealTarget[] = [
    ...judgments.map((judgment) => ({
      type: "judgment" as const,
      id: judgment.id,
      label: `${judgment.submission.stageKey.toUpperCase()} 판정 (${judgment.result})`,
      appealed: appealedTargets.has(judgment.id),
      when: judgment.judgedAt,
    })),
    ...flags.map((flag) => ({
      type: "abuse_flag" as const,
      id: flag.id,
      label: `어뷰징 검토 (${flag.reason ?? "사유 미기재"})`,
      /* 플래그는 자기 표에 소명 시각을 갖는다 — appeals와 따로 본다 */
      appealed: flag.appealedAt !== null,
      when: flag.createdAt,
    })),
  ];

  return {
    targets,
    history: appeals.map((appeal) => ({
      id: appeal.id,
      targetType: appeal.targetType,
      reasonText: appeal.reasonText,
      submittedAt: appeal.submittedAt,
      responseDueAt: appeal.responseDueAt,
      responseText: appeal.responseText,
      respondedAt: appeal.respondedAt,
      corrected: appeal.corrected,
    })),
  };
}

export type AppealResult = { ok: true } | { ok: false; code: AppealFailureCode };

/**
 * 이의신청 접수.
 *
 * 어느 표에 쓰는지는 대상이 정한다.
 *   판정  → `appeals` 행 (제11조 정식 이의신청). 답변 기한을 함께 박는다
 *   플래그 → `abuse_flags.appeal_text` + 상태를 appealed로
 *
 * ⚠️ 답변 기한(`response_due_at`)을 접수 시점에 계산해 저장한다. 나중에 계산하면
 * "언제까지였나"가 코드 버전에 따라 달라진다 — 기한은 접수 순간에 확정돼야 한다.
 */
export async function submitAppeal(args: {
  entryId: string;
  target: { type: AppealTargetType; id: string };
  reason: string;
}): Promise<AppealResult> {
  const { entryId, target } = args;
  const reason = args.reason.trim();
  if (reason.length < APPEAL_REASON_MIN) {
    return { ok: false, code: "REASON_TOO_SHORT" };
  }

  if (target.type === "judgment") {
    const judgment = await prisma.judgment.findFirst({
      where: { id: target.id, submission: { entryId } },
      select: { id: true },
    });
    if (!judgment) return { ok: false, code: "TARGET_NOT_FOUND" };

    const already = await prisma.appeal.findFirst({
      where: { entryId, targetId: target.id },
      select: { id: true },
    });
    if (already) return { ok: false, code: "ALREADY_APPEALED" };

    const now = new Date();
    try {
      await prisma.appeal.create({
        data: {
          entryId,
          targetType: "judgment",
          targetId: target.id,
          reasonText: reason,
          submittedAt: now,
          responseDueAt: addBusinessDays(now, RESPONSE_BUSINESS_DAYS),
        },
      });
    } catch (error) {
      /* 두 탭에서 동시에 눌렀을 때 */
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return { ok: false, code: "ALREADY_APPEALED" };
      }
      throw error;
    }
    return { ok: true };
  }

  /* 어뷰징 플래그 — 자기 표에 소명을 남기고 상태를 옮긴다 */
  const flag = await prisma.abuseFlag.findFirst({
    where: { id: target.id, entryId },
    select: { status: true, appealedAt: true },
  });
  if (!flag) return { ok: false, code: "TARGET_NOT_FOUND" };
  if (flag.appealedAt) return { ok: false, code: "ALREADY_APPEALED" };
  /* 이미 판정이 끝난 플래그는 이 창구가 아니라 제11조 이의신청 대상이다 */
  if (flag.status !== AbuseStatus.flagged) {
    return { ok: false, code: "NOT_APPEALABLE" };
  }

  await prisma.abuseFlag.update({
    where: { id: target.id },
    data: {
      appealText: reason,
      appealedAt: new Date(),
      status: AbuseStatus.appealed,
    },
  });
  return { ok: true };
}
