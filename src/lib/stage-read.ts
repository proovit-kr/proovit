import type { StageKey } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { stageWindows } from "@/lib/submission";

/*
  스테이지 마감 한 줄 읽기 — **두 가지가 있고 뜻이 다르다.**

    stageDueAt             실제 마감(유동 게이트) — 제출 기한. 허브가 읽는다
                           (s1·s2 판의 마감, 지각 판 경고줄 LateBar의 「s1 마감」)
    stageCalendarClosesAt  달력 마감(stages.closes_at 원값) — 스테이지 구간의 끝.
                           지각 편입(late-entry-store `loadLateEntryDeadline`)이 읽는다

  s1이면 두 날짜가 다르다. 시즌1 일정(s1 09.28~10.04, s2 10.05~10.11)에서 s1의 실제
  마감은 1차 심사 마감 10.11이고 달력 마감은 10.04다. 허브 경고줄이 알려 주는
  「s1 마감」과 편입 링크가 닫히는 날은 **일부러 다르다** — 편입은 s1 구간 안에서만
  받고, 들어온 팀의 제출 기한은 남들과 같다(2026-09-26 수연 결정 「기획 문서 순서」).
  한 파일에 나란히 둔 것은 이 차이를 한자리에서 보이려는 것이다.

  hub-read에서 따로 뺀 까닭은 그 파일이 `server-only`라 신청 저장(apply-store)과 그
  테스트가 부를 수 없어서다.
*/

/**
 * 그 스테이지의 마감. 참가 기록이 없는 화면(시안 h10)도 이것만 따로 읽는다.
 *
 * **실제 마감**이다(유동 게이트, 2026-09-25 수연 지시 — submission.ts
 * `stageWindows`). 게이트가 아닌 스테이지는 뒤 게이트의 마감이라 s1은 1차 심사
 * 마감이 된다. 한 줄을 알려면 뒤 게이트를 봐야 해서 그 시즌 스테이지를 다 읽는다.
 */
export async function stageDueAt(
  seasonId: string,
  stageKey: StageKey,
): Promise<Date | null> {
  const stages = await prisma.stage.findMany({
    where: { seasonId },
    select: { stageKey: true, isGate: true, opensAt: true, closesAt: true },
  });
  return stageWindows(stages)[stageKey]?.closesAt ?? null;
}

/**
 * 그 스테이지의 **달력 마감** — stages 행의 `closesAt` 원값이다. 유동 게이트를
 * 거치지 않으므로 위 `stageDueAt`과 다른 날짜가 나온다(파일 머리 주석). 행이 없거나
 * 마감이 비면 null.
 */
export async function stageCalendarClosesAt(
  seasonId: string,
  stageKey: StageKey,
): Promise<Date | null> {
  const stage = await prisma.stage.findUnique({
    where: { seasonId_stageKey: { seasonId, stageKey } },
    select: { closesAt: true },
  });
  return stage?.closesAt ?? null;
}
