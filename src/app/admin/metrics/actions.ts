"use server";

import { revalidatePath } from "next/cache";

import { AbuseStatus, MetricSource } from "@/generated/prisma/enums";
import { canAccess, getSessionUser, loadAccessContext } from "@/lib/access";
import { REASON_MIN } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

/*
  지표 검토 판정.

  ⚠️ **셋 다 채점에 들어가는 값을 건드린다.** 그래서 어뷰징 판정과 같은 규칙이다 —
  사유가 없으면 저장되지 않고, 감사 로그와 한 트랜잭션으로 나간다
  (admin-store.ts 머리 주석). 참가자가 "왜 내 방문이 줄었냐"고 물으면 답이 이 기록이다.

    확정      자동 집계를 그대로 인정한다. 값은 안 바뀌고 큐에서만 내려간다.
    재계산    운영자가 보정한 유효 방문 수로 덮는다. source가 manual로 바뀐다.
    어뷰징 이관  판단을 어뷰징 큐로 넘긴다. 여기서 실격을 정하지 않는다.

  ⚠️ **이관은 실격이 아니다.** 규칙 제16조 ①이 「적용 전 소명 기회」를 요구하므로
  지표 화면에서 곧바로 제재로 가지 않는다. 플래그를 만들어 `/admin/abuse`가
  소명과 함께 판정하게 둔다.

  액션 이름은 시안의 점 표기(`metric.recalc`)다 — 감사 로그 화면(ver4 `#scr-adm-audit`)의
  필터가 `metric.*`처럼 앞마디로 거른다.
*/

export type ReviewState = { message?: string; done?: number };

type Kind = "confirm" | "recalc" | "escalate";

const ACTION: Record<Kind, string> = {
  confirm: "metric.confirm",
  recalc: "metric.recalc",
  escalate: "metric.escalate",
};

/** abuse_flags.reason은 VarChar(120)이다. 넘치면 저장이 통째로 실패한다. */
const FLAG_REASON_MAX = 120;

function parseKind(raw: string): Kind | null {
  return raw === "confirm" || raw === "recalc" || raw === "escalate"
    ? raw
    : null;
}

export async function reviewMetric(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const user = await getSessionUser();
  if (!user) return { message: "로그인이 풀렸습니다." };

  const permission = canAccess("adminMetrics", await loadAccessContext());
  if (!permission.ok) return { message: permission.message };

  const rowId = String(formData.get("rowId") ?? "");
  const kind = parseKind(String(formData.get("kind") ?? ""));
  const reason = String(formData.get("reason") ?? "").trim();
  const adjustedRaw = String(formData.get("adjusted") ?? "").trim();

  if (!rowId || !kind) return { message: "잘못된 요청입니다." };
  if (reason.length < REASON_MIN) {
    return { message: `사유를 ${REASON_MIN}자 이상 적어 주세요.` };
  }

  const row = await prisma.metricDaily.findUnique({
    where: { id: rowId },
    select: {
      id: true,
      entryId: true,
      metricDate: true,
      rawVisitors: true,
      validVisitors: true,
      reviewedBy: true,
    },
  });
  if (!row) return { message: "집계 줄을 찾을 수 없습니다." };
  /* 큐는 미검토 건만 보여준다. 두 사람이 같은 줄을 잡았을 때 뒤가 덮지 않게. */
  if (row.reviewedBy) return { message: "이미 다른 운영자가 처리했습니다." };

  /* 재계산만 숫자를 받는다. 0은 「0으로 보정」이라 빈 칸과 가른다. */
  let adjusted: number | null = null;
  if (kind === "recalc") {
    if (adjustedRaw === "") return { message: "보정할 유효 방문 수를 적어 주세요." };
    const parsed = Number.parseInt(adjustedRaw, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      return { message: "보정 유효 방문 수는 0 이상의 숫자로 적어 주세요." };
    }
    if (parsed > row.rawVisitors) {
      return { message: "보정값이 원시 방문보다 클 수 없습니다." };
    }
    adjusted = parsed;
  }

  await prisma.$transaction(async (tx) => {
    if (kind === "confirm") {
      await tx.metricDaily.update({
        where: { id: row.id },
        data: { manualReviewPassed: true, reviewedBy: user.id },
      });
    } else if (kind === "recalc") {
      await tx.metricDaily.update({
        where: { id: row.id },
        data: {
          validVisitors: adjusted ?? row.validVisitors,
          /* 엣지 배치가 뒤에 와서 손으로 고친 값을 덮지 않게 한다 */
          source: MetricSource.manual,
          manualReviewPassed: true,
          reviewedBy: user.id,
        },
      });
    } else {
      await tx.abuseFlag.create({
        data: {
          entryId: row.entryId,
          reason: `지표 검토 이관, ${reason}`.slice(0, FLAG_REASON_MAX),
          status: AbuseStatus.flagged,
        },
      });
      /*
        이관한 줄은 「검토 통과 아님」으로 남긴다. 채점이 이 표를 조인해
        무엇을 뺄지 정한다(admin-store.resolveAbuseFlag 주석).
      */
      await tx.metricDaily.update({
        where: { id: row.id },
        data: { manualReviewPassed: false, reviewedBy: user.id },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: ACTION[kind],
        targetType: "metric_daily",
        targetId: row.id,
        reason,
        meta: {
          entryId: row.entryId,
          metricDate: row.metricDate.toISOString().slice(0, 10),
          rawVisitors: row.rawVisitors,
          from: row.validVisitors,
          ...(adjusted === null ? {} : { to: adjusted }),
        },
      },
    });
  });

  revalidatePath("/admin", "layout");
  return { done: Date.now() };
}
