"use server";

import { revalidatePath } from "next/cache";

import { AwardType, EntryStatus } from "@/generated/prisma/enums";
import { canAccess, getSessionUser, loadAccessContext } from "@/lib/access";
import { prisma } from "@/lib/prisma";

import { AWARD_LABEL } from "./awards-read";

/*
  순위 확정.

  ⚠️ **되돌릴 수 없는 쓰기다.** 확정하는 순간 공개 리더보드가 FINAL로 바뀌고
  (public-read.ts가 `isFinal`을 읽는다) 수상 팀에게 통지가 나간다. 그래서
  다른 운영자 쓰기보다 한 겹을 더 둔다 — 권한 재확인, 사유 강제, 확인 모달,
  그리고 **이미 확정된 시즌은 두 번 확정되지 않게 막는다.**

  ⚠️ 상금은 넣지 않는다. 시즌1은 상금 지급이 없고 순위와 시상 발표까지다
  (시안의 경고 바). `amount`·`prizeType`을 비워 두는 것이 그 사실의 기록이다.
*/

export type FinalizeState = { message?: string; done?: boolean };

export async function finalizeRanking(
  _prev: FinalizeState,
  formData: FormData,
): Promise<FinalizeState> {
  const user = await getSessionUser();
  if (!user) return { message: "로그인이 풀렸습니다." };

  const permission = canAccess("adminAwards", await loadAccessContext());
  if (!permission.ok) return { message: permission.message };

  const seasonId = String(formData.get("seasonId") ?? "");
  /* 시안 `#mdl-final`에는 사유 칸이 없다 — 무엇을 했는지가 곧 사유다 */
  const reason = "최종 순위 확정";

  if (!seasonId) return { message: "잘못된 요청입니다." };

  /* 확정 대상은 가장 최근 집계일 하나다 */
  const latest = await prisma.leaderboardSnapshot.findFirst({
    where: { seasonId },
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });
  if (!latest) {
    return { message: "확정할 집계가 없습니다. 롤업이 먼저 돌아야 합니다." };
  }

  const snapshots = await prisma.leaderboardSnapshot.findMany({
    where: { seasonId, snapshotDate: latest.snapshotDate },
    orderBy: { rank: "asc" },
    select: {
      entryId: true,
      rank: true,
      isFinal: true,
      isAwardEligible: true,
      entry: { select: { status: true } },
    },
  });

  if (snapshots.some((s) => s.isFinal)) {
    return { message: "이미 확정된 시즌입니다. 확정은 되돌릴 수 없습니다." };
  }

  /*
    수상 대상. 살아 있고 축 하한을 넘긴 팀 중 상위 3위까지다.
    실격된 팀을 건너뛰고 번호를 다시 매기지 않는다 — 스냅샷의 순위가 정본이고
    (06 §6.3) 여기서 다시 매기면 공개 리더보드와 어긋난다.
  */
  const winners = snapshots.filter(
    (s) =>
      s.entry.status === EntryStatus.active &&
      s.isAwardEligible &&
      AWARD_LABEL[s.rank] !== undefined,
  );

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.leaderboardSnapshot.updateMany({
      where: { seasonId, snapshotDate: latest.snapshotDate },
      data: { isFinal: true },
    });

    for (const winner of winners) {
      await tx.award.create({
        data: {
          seasonId,
          entryId: winner.entryId,
          rank: winner.rank,
          awardType: AwardType.overall,
          prizeDesc: AWARD_LABEL[winner.rank],
          awardedAt: now,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "award.finalize",
        targetType: "season",
        targetId: seasonId,
        reason,
        meta: {
          snapshotDate: latest.snapshotDate.toISOString(),
          winners: winners.map((w) => ({ entryId: w.entryId, rank: w.rank })),
        },
      },
    });
  });

  /*
    확정은 공개 화면을 동시에 바꾼다 — 리더보드가 FINAL로 전환되고
    참가작 상세에 수상 배지가 붙는다. 운영 화면만 새로 그리면 참가자는
    옛 상태를 본다.
  */
  revalidatePath("/admin/awards");
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/seasons", "layout");
  revalidatePath("/projects", "layout");
  return { done: true };
}
