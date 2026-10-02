import type { Prisma, Season } from "@/generated/prisma/client";
import { StageKey } from "@/generated/prisma/enums";
import { devNow } from "@/lib/dev-clock";
import {
  applyGate,
  isLatePassCode,
  latePassPendingWhere,
  normalizeLatePassCode,
  type ApplyGate,
} from "@/lib/late-entry";
import { prisma } from "@/lib/prisma";
import { resolveLandingCta } from "@/lib/season";
import { stageCalendarClosesAt } from "@/lib/stage-read";

/*
  지각 편입의 DB 절반. **서버 전용이다** — 규칙은 late-entry.ts에 있다.

  여기 있는 것 셋:
    loadLateEntryDeadline  편입을 받는 마지막 시각(s1 달력 마감)
    loadApplyGate          참가 신청 화면과 신청 액션이 부르는 **하나의** 판정
    claimLatePassIn        신청 트랜잭션 안에서 링크를 조건부로 「사용됨」으로 바꾼다

  링크 만들기·취소는 운영자 쓰기라 admin-store.ts에 있다(감사 로그와 한 트랜잭션).
*/

/**
 * 편입을 받는 마지막 시각 — **s1의 달력 마감**(stages s1 행의 `closesAt` 원값,
 * stage-read `stageCalendarClosesAt`). s1 행이 없거나 마감이 비면 null(달력이 막지
 * 않는다 — 링크 기한 7일만 남는다).
 *
 * 근거는 PLN3 3.2 「racing(s1 구간) × applied」다. 기획 문서 순서에서는 모집 마감
 * 다음이 개막이고 개막 = 레이스 시작 = s1 시작이라(PRD 2장 타임라인 「모집 8/31~9/27
 * 마감 → 킥오프~레이스 9/28~」) 레이스가 열린 뒤 s1 구간이 끝날 때까지가 편입 기간이다.
 *
 * ⚠️ 유동 게이트의 실제 마감(stage-read `stageDueAt`)이 아니다. 그건 s1 **제출** 기한이라
 * 1차 심사 마감까지 늘어난다. 허브 지각 판의 경고줄(LateBar)이 알려 주는 「s1 마감」이
 * 그 날짜고 편입이 닫히는 날보다 늦다 — 들어온 팀은 남들과 같은 제출 기한을 받는다
 * (FR-D5 「1차 마감은 동일」).
 *
 * → 2026-09-26 뒤집음: 처음에는 실제 마감을 썼다. 시안 ver4의 「참가 신청 마감
 * 10.04」를 따라 레이스가 s2 시작에 열린다고 보면, 레이스 중에는 달력 s1이 이미 끝나
 * 있어 편입이 한 번도 열리지 않기 때문이었다. 같은 날 수연이 기획 문서 순서(개막 =
 * 레이스 = s1 시작, 모집과 s1은 겹치지 않는다)를 따르기로 해 그 전제가 없어졌다 —
 * 시안의 그 날짜는 기획과 어긋난 것으로 본다.
 */
export function loadLateEntryDeadline(seasonId: string): Promise<Date | null> {
  return stageCalendarClosesAt(seasonId, StageKey.s1);
}

/**
 * 새 참가 신청을 받는가 — 참가 신청 화면(apply/page.tsx)과 신청 액션(apply-store
 * `submitApplication`)이 **둘 다 이것을 부른다.** 판정은 순수 함수 `applyGate`다.
 *
 * 모집 중이면 평소 신청이고 DB를 더 읽지 않는다. 모집 판정은 랜딩 CTA와 같은
 * `resolveLandingCta`다 — 랜딩은 「참가 신청」을 띄우는데 여기는 닫힌(혹은 그 반대인)
 * 상태가 생기면 안 된다.
 *
 * ⚠️ 이 결과를 권한으로 들고 다니지 않는다. 화면이 폼을 그린 뒤 제출하면 액션이
 * 이 함수를 **다시** 부르고, 실제 사용은 `claimLatePassIn`이 조건부 쓰기로 한 번 더 본다.
 */
export async function loadApplyGate(
  season: Season | null,
  rawLateCode: string | null | undefined,
): Promise<ApplyGate> {
  const applyOpen = season !== null && resolveLandingCta(season).kind === "APPLY";
  const code = normalizeLatePassCode(rawLateCode ?? "");
  /* 시각 판정만 옮긴 오늘을 본다(dev-clock.ts) — 운영에서는 진짜 지금이다 */
  const base = { applyOpen, season, code, now: devNow() };

  /* 모집 중이거나 링크 없이 왔거나 코드 모양이 아니면 DB를 볼 것이 없다 */
  if (applyOpen || !season || !code || !isLatePassCode(code)) {
    return applyGate({ ...base, pass: null, deadline: null });
  }

  const [pass, deadline] = await Promise.all([
    prisma.lateEntryPass.findUnique({
      where: { code },
      select: { seasonId: true, usedAt: true, revokedAt: true, expiresAt: true },
    }),
    loadLateEntryDeadline(season.id),
  ]);
  return applyGate({ ...base, pass, deadline });
}

/**
 * 링크를 「사용됨」으로 바꾸고 방금 생긴 참가를 잇는다. **신청 트랜잭션 안에서만
 * 부른다** — 참가·동의와 같이 서거나 같이 무너져야 한다. 참가는 생겼는데 링크가
 * 대기로 남으면 한 링크로 두 팀이 들어온다.
 *
 * 대기 중일 때만 바뀐다(`latePassPendingWhere`). 두 탭에서 동시에 제출하면 한쪽만
 * 1건을 얻는다 — false를 받은 쪽은 트랜잭션을 되돌려야 한다.
 *
 * `now`는 판정 시각(`devNow`), `usedAt`은 일어난 때라 진짜 지금이다(dev-clock.ts 규칙).
 */
export async function claimLatePassIn(
  tx: Prisma.TransactionClient,
  args: { code: string; seasonId: string; userId: string; entryId: string; now: Date },
): Promise<boolean> {
  const { count } = await tx.lateEntryPass.updateMany({
    where: { code: args.code, seasonId: args.seasonId, ...latePassPendingWhere(args.now) },
    data: { usedAt: new Date(), usedBy: args.userId, entryId: args.entryId },
  });
  return count === 1;
}
