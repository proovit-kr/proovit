import "server-only";

import { EntryStage, StageKey, SubmissionStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { SINGLE_WEEK, type SubmitIntent } from "@/lib/submission";
import { loadStageView, type SaveResult } from "@/lib/submission-store";

/*
  s2·s4·s5 저장.

  ⚠️ `src/lib/submission-store.ts`의 `saveS1`·`saveS3`과 같은 일을 한다. 본래는
  그 파일에 나란히 있어야 하고 옮길 예정이다(stages.ts 머리 주석과 같은 사정).
  옮길 때 이 파일은 통째로 지우고 import만 갈아 끼우면 된다.

  ⚠️ **판정을 여기서 하지 않는다.** 팀장인지·진도가 닿았는지는 `canSubmitStage()`가
  보고(액션이 부른다), 이 파일이 지키는 것은 **시간과 잠금**이다 — 마감과 심사
  잠금은 `loadStageView()`가 읽어 준다. 두 곳에서 각각 판정하면 화면이 잠그는
  조건과 서버가 거절하는 조건이 갈린다.
*/

/** EntryStage와 StageKey는 s1~s5에서 값이 겹친다. 진도를 올릴 때 쓴다 */
const STAGE_ORDER: EntryStage[] = [
  EntryStage.s1,
  EntryStage.s2,
  EntryStage.s3,
  EntryStage.s4,
  EntryStage.s5,
];

function stageAtLeast(current: EntryStage, target: EntryStage): boolean {
  const a = STAGE_ORDER.indexOf(current);
  const b = STAGE_ORDER.indexOf(target);
  /* 표에 없는 값(applied·completed)은 순서를 모른다 — 올리지 않고 그대로 둔다 */
  if (a === -1 || b === -1) return a !== -1;
  return a >= b;
}

/**
 * 스테이지 제출을 쓴다.
 *
 * s4는 주차마다 행이 따로 생긴다(`week`). 나머지는 `SINGLE_WEEK` 한 행이다 —
 * `submissions`의 유일 키가 `(entry, stage, week)`이라 그 셋으로 upsert한다.
 */
export async function saveStagePayload(args: {
  entryId: string;
  seasonId: string;
  userId: string;
  stageKey: StageKey;
  payload: unknown;
  intent: SubmitIntent;
  week?: number;
}): Promise<SaveResult> {
  const { entryId, seasonId, userId, stageKey, payload, intent } = args;
  const week = args.week ?? SINGLE_WEEK;

  const view = await loadStageView(entryId, seasonId, stageKey, week);
  if (!view) return { ok: false, code: "NOT_FOUND" };
  if (!view.editable) {
    return { ok: false, code: view.lockedReason ?? "STAGE_LOCKED" };
  }

  const submitting = intent === "submit";
  const status = submitting
    ? SubmissionStatus.submitted
    : SubmissionStatus.draft;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.submission.upsert({
      where: { entryId_stageKey_week: { entryId, stageKey, week } },
      create: {
        entryId,
        stageKey,
        week,
        status,
        payload: payload as never,
        submittedBy: submitting ? userId : null,
        submittedAt: submitting ? now : null,
      },
      update: {
        status,
        payload: payload as never,
        ...(submitting ? { submittedBy: userId, submittedAt: now } : {}),
      },
    });

    if (!submitting) return;

    /*
      제출이 끝나면 진도를 올린다. 이미 더 간 팀은 그대로 둔다 —
      s4는 주차 반복이라 같은 스테이지를 여러 번 내고, 그때마다 내려가면 안 된다.
    */
    const entry = await tx.entry.findUniqueOrThrow({
      where: { id: entryId },
      select: { stage: true },
    });
    const target = stageKey as unknown as EntryStage;
    if (!stageAtLeast(entry.stage, target)) {
      await tx.entry.update({ where: { id: entryId }, data: { stage: target } });
    }
  });

  return { ok: true, status };
}

export type StageMetrics = {
  validVisitors: number;
  signups: number;
  revenue: number;
  /** 집계된 날이 하루도 없으면 「집계 전」이다 */
  hasData: boolean;
};

/**
 * 읽기 전용 지표.
 *
 * ⚠️ 참가자가 숫자를 입력하지 않는다는 것이 이 제품의 약속이라, 제출 화면의
 * 지표 칸은 **입력이 아니라 이 조회의 출력**이다. 기간을 받는 이유는 s2가
 * 스테이지 구간만, s4가 그 주만 세기 때문이다.
 */
export async function loadStageMetrics(
  entryId: string,
  from: Date | null,
  to: Date | null,
): Promise<StageMetrics> {
  const rows = await prisma.metricDaily.findMany({
    where: {
      entryId,
      ...(from || to
        ? {
            metricDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    select: { validVisitors: true, signups: true, revenue: true },
  });

  return {
    validVisitors: rows.reduce((sum, row) => sum + row.validVisitors, 0),
    signups: rows.reduce((sum, row) => sum + row.signups, 0),
    /* BigInt는 화면에서 못 쓴다. 원 단위라 Number로 좁혀도 안전하다 */
    revenue: rows.reduce((sum, row) => sum + Number(row.revenue), 0),
    hasData: rows.length > 0,
  };
}
