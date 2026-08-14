import {
  ChargeType,
  EntryStage,
  StageKey,
  SubmissionStatus,
} from "@/generated/prisma/enums";
import { stageAtLeast } from "@/lib/access-policy";
import { prisma } from "@/lib/prisma";
import {
  SINGLE_WEEK,
  type S1Payload,
  type SubmissionFailureCode,
  type SubmitIntent,
} from "@/lib/submission";

/*
  제출 저장. **서버 전용이다** — 길이·형식 규칙은 submission.ts에 있고 그쪽은
  클라이언트도 읽는다.

  권한(팀장인가·이 스테이지가 열렸는가)은 `canSubmitStage()`가 판정하고 화면과
  서버 액션이 그 하나를 부른다(CLAUDE.md §3). 이 파일이 지키는 것은 **시간과
  잠금**이다 — 마감이 지났는지, 심사가 시작돼 잠겼는지, 과금 유형이 굳었는지.
*/

export type StageView = {
  stageKey: StageKey;
  name: string;
  isGate: boolean;
  opensAt: Date | null;
  closesAt: Date | null;
  /** 이미 낸 것. 없으면 첫 제출이다 */
  submission: {
    status: SubmissionStatus;
    payload: unknown;
    submittedAt: Date | null;
    /** 보완 재제출 마감(원 마감 +48시간). 팀별로 다르다 */
    revisionDueAt: Date | null;
  } | null;
  chargeType: ChargeType;
  /** 첫 제출이 끝나면 과금 유형이 굳는다(심사 기준서 v0.3) */
  chargeTypeLocked: boolean;
  /** 지금 고칠 수 있는가. 못 고치는 이유가 있으면 code에 담긴다 */
  editable: boolean;
  lockedReason: SubmissionFailureCode | null;
};

/**
 * 제출 화면이 필요한 전부를 한 번에 읽는다.
 *
 * ⚠️ `stages` 행이 없으면 스테이지가 없는 것이다 — 시즌마다 몇 단계인지가
 * 다를 수 있으므로 코드에 다섯 개를 박지 않고 이 표를 근거로 삼는다.
 */
export async function loadStageView(
  entryId: string,
  seasonId: string,
  stageKey: StageKey,
  week: number = SINGLE_WEEK,
): Promise<StageView | null> {
  const [stage, submission, entry] = await Promise.all([
    prisma.stage.findUnique({
      where: { seasonId_stageKey: { seasonId, stageKey } },
      select: {
        name: true,
        isGate: true,
        opensAt: true,
        closesAt: true,
      },
    }),
    prisma.submission.findUnique({
      where: { entryId_stageKey_week: { entryId, stageKey, week } },
      select: {
        status: true,
        payload: true,
        submittedAt: true,
        revisionDueAt: true,
      },
    }),
    prisma.entry.findUnique({
      where: { id: entryId },
      select: { chargeType: true },
    }),
  ]);

  if (!stage || !entry) return null;

  const now = new Date();
  const locked = submission?.status === SubmissionStatus.locked;
  /*
    마감이 지나도 보완 재제출 기한이 남아 있으면 열어둔다 — 그게 보완의 뜻이다.
    시즌1 캘린더가 잠정이라 `closes_at`이 아직 비어 있고, 비어 있으면 마감이 없다.
  */
  const closed =
    stage.closesAt !== null &&
    stage.closesAt <= now &&
    !(submission?.revisionDueAt && submission.revisionDueAt > now);

  const lockedReason: SubmissionFailureCode | null = locked
    ? "STAGE_LOCKED"
    : closed
      ? "STAGE_CLOSED"
      : null;

  return {
    stageKey,
    name: stage.name,
    isGate: stage.isGate,
    opensAt: stage.opensAt,
    closesAt: stage.closesAt,
    submission,
    chargeType: entry.chargeType,
    /* 제출을 마친 뒤에는 못 바꾼다. 임시 저장 상태에서는 아직 바꿀 수 있다 */
    chargeTypeLocked: submission !== null && submission.status !== SubmissionStatus.draft,
    editable: lockedReason === null,
    lockedReason,
  };
}

export type SaveResult =
  | { ok: true; status: SubmissionStatus }
  | { ok: false; code: SubmissionFailureCode };

/**
 * s1 저장.
 *
 * 임시 저장과 제출이 같은 행을 쓴다 — `status`만 다르다. 행을 따로 만들면
 * `@@unique([entry_id, stage_key, week])`가 막고, 무엇이 정본인지도 흐려진다.
 *
 * ⚠️ 제출은 **진도를 한 칸 올린다.** `entry.stage`는 마지막으로 완료한 단계라
 * s1을 내면 `applied` → `s1`이 된다. 뒤로는 절대 내리지 않는다 — 재제출로
 * 진도가 후퇴하면 게이트를 통과한 팀이 다시 대기로 떨어진다.
 */
export async function saveS1(args: {
  entryId: string;
  seasonId: string;
  userId: string;
  payload: S1Payload;
  chargeType: ChargeType;
  intent: SubmitIntent;
}): Promise<SaveResult> {
  const { entryId, seasonId, userId, payload, chargeType, intent } = args;

  const view = await loadStageView(entryId, seasonId, StageKey.s1);
  if (!view) return { ok: false, code: "NOT_FOUND" };
  if (!view.editable) {
    return { ok: false, code: view.lockedReason ?? "STAGE_LOCKED" };
  }
  if (view.chargeTypeLocked && chargeType !== view.chargeType) {
    return { ok: false, code: "CHARGE_TYPE_LOCKED" };
  }

  const submitting = intent === "submit";
  const status = submitting
    ? SubmissionStatus.submitted
    : SubmissionStatus.draft;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.submission.upsert({
      where: {
        entryId_stageKey_week: {
          entryId,
          stageKey: StageKey.s1,
          week: SINGLE_WEEK,
        },
      },
      create: {
        entryId,
        stageKey: StageKey.s1,
        week: SINGLE_WEEK,
        status,
        payload,
        /* 제출을 누른 사람. 시즌 중 팀장이 바뀔 수 있어 그 시각의 주체를 남긴다 */
        submittedBy: submitting ? userId : null,
        submittedAt: submitting ? now : null,
      },
      update: {
        status,
        payload,
        /* 임시 저장은 제출 기록을 지우지 않는다 — 냈던 사실이 사라지면 안 된다 */
        ...(submitting ? { submittedBy: userId, submittedAt: now } : {}),
      },
    });

    if (!submitting) return;

    /* 과금 유형은 참가에 붙는다(entries). 첫 제출과 함께 굳는다 */
    await tx.entry.update({ where: { id: entryId }, data: { chargeType } });

    const entry = await tx.entry.findUniqueOrThrow({
      where: { id: entryId },
      select: { stage: true },
    });
    if (!stageAtLeast(entry.stage, EntryStage.s1)) {
      await tx.entry.update({
        where: { id: entryId },
        data: { stage: EntryStage.s1 },
      });
    }
  });

  return { ok: true, status };
}
