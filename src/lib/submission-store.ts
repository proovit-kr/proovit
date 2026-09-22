import {
  ChargeType,
  DeployStatus,
  EntryStage,
  StageKey,
  SubmissionStatus,
} from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { stageAtLeast } from "@/lib/access-policy";
import { devNow } from "@/lib/dev-clock";
import { prisma } from "@/lib/prisma";
import { loadLeaderboard } from "@/lib/public-read";
import {
  SINGLE_WEEK,
  currentWeek,
  type StageState,
  type SubmissionFailureCode,
  type SubmitIntent,
} from "@/lib/submission";

/*
  제출 저장. **서버 전용이다** — 길이·형식 규칙과 판을 읽는 규칙은 submission.ts에
  있고 그쪽은 클라이언트도 읽는다.

  권한(팀장인가·이 스테이지가 열렸는가)은 `canSubmitStage()`가 판정하고 화면과
  서버 액션이 그 하나를 부른다(CLAUDE.md §3). 이 파일이 지키는 것은 **시간과
  잠금**이다 — 아직 안 열렸는지, 마감이 지났는지, 심사가 시작돼 잠겼는지, 과금
  유형이 굳었는지.
*/

export type StageRow = StageState & {
  name: string;
  isGate: boolean;
  /** 지금 보는 제출(s4는 이번 주차). 없으면 첫 제출이다 */
  submission: {
    status: SubmissionStatus;
    payload: unknown;
    submittedAt: Date | null;
    /** 제출을 누른 사람의 닉네임. 임시저장만 있으면 null */
    submitter: string | null;
    /** 마지막으로 저장한 때. 임시저장 표기에 쓴다 */
    updatedAt: Date;
    /** 보완 재제출 마감(원 마감 +48시간). 팀별로 다르다 */
    revisionDueAt: Date | null;
  } | null;
  /** s4 — 주차별 제출(오름차순). 나머지는 빈 배열 */
  weeks: {
    week: number;
    status: SubmissionStatus;
    submittedAt: Date | null;
    submitter: string | null;
  }[];
  /** 지금 고칠 수 있는가. 못 고치는 이유가 있으면 code에 담긴다 */
  editable: boolean;
  lockedReason: SubmissionFailureCode | null;
};

export type SubmitOverview = {
  stages: StageRow[];
  chargeType: ChargeType;
  /** 첫 제출이 끝나면 과금 유형이 굳는다(심사 기준서 v0.3) */
  chargeTypeLocked: boolean;
  serviceUrl: string | null;
};

/**
 * 제출 화면이 필요한 전부를 한 번에 읽는다 — 탭 다섯의 꼬리와 지금 보는 판.
 *
 * ⚠️ `stages` 행이 없으면 스테이지가 없는 것이다 — 시즌마다 몇 단계인지가 다를
 * 수 있으므로 코드에 다섯 개를 박지 않고 이 표를 근거로 삼는다.
 */
export async function loadSubmitOverview(
  entryId: string,
  seasonId: string,
  now: Date = devNow(),
): Promise<SubmitOverview | null> {
  const [stages, submissions, entry] = await Promise.all([
    prisma.stage.findMany({
      where: { seasonId },
      orderBy: { stageKey: "asc" },
      select: {
        stageKey: true,
        name: true,
        isGate: true,
        opensAt: true,
        closesAt: true,
      },
    }),
    prisma.submission.findMany({
      where: { entryId },
      orderBy: [{ stageKey: "asc" }, { week: "asc" }],
      select: {
        stageKey: true,
        week: true,
        status: true,
        payload: true,
        submittedAt: true,
        updatedAt: true,
        revisionDueAt: true,
        submitter: { select: { nickname: true } },
        judgments: {
          orderBy: { judgedAt: "desc" },
          take: 1,
          select: { result: true },
        },
      },
    }),
    prisma.entry.findUnique({
      where: { id: entryId },
      select: { chargeType: true, serviceUrl: true },
    }),
  ]);
  if (!entry || stages.length === 0) return null;

  const rows: StageRow[] = stages.map((stage) => {
    const mine = submissions.filter((s) => s.stageKey === stage.stageKey);
    /* s4는 주차가 행을 가른다. 지금 주차 것이 「지금 보는 제출」이다 */
    const week =
      stage.stageKey === StageKey.s4 ? currentWeek(stage.opensAt, now) : SINGLE_WEEK;
    const current = mine.find((s) => s.week === week) ?? null;

    const locked = current?.status === SubmissionStatus.locked;
    /*
      마감이 지나도 보완 재제출 기한이 남아 있으면 열어둔다 — 그게 보완의 뜻이다.
      마감이 비어 있으면(시즌1 일정 잠정) 마감이 없다.
    */
    const closed =
      stage.closesAt !== null &&
      stage.closesAt <= now &&
      !(current?.revisionDueAt && current.revisionDueAt > now);
    const notOpen = stage.opensAt !== null && stage.opensAt > now;
    const lockedReason: SubmissionFailureCode | null = locked
      ? "STAGE_LOCKED"
      : closed
        ? "STAGE_CLOSED"
        : notOpen
          ? "STAGE_NOT_OPEN"
          : null;

    return {
      stageKey: stage.stageKey,
      name: stage.name,
      isGate: stage.isGate,
      opensAt: stage.opensAt,
      closesAt: stage.closesAt,
      week,
      status: current?.status ?? null,
      judgment: current?.judgments[0]?.result ?? null,
      submission: current
        ? {
            status: current.status,
            payload: current.payload,
            submittedAt: current.submittedAt,
            submitter: current.submitter?.nickname ?? null,
            updatedAt: current.updatedAt,
            revisionDueAt: current.revisionDueAt,
          }
        : null,
      weeks:
        stage.stageKey === StageKey.s4
          ? mine
              .filter((s) => s.week >= 1)
              .map((s) => ({
                week: s.week,
                status: s.status,
                submittedAt: s.submittedAt,
                submitter: s.submitter?.nickname ?? null,
              }))
          : [],
      editable: lockedReason === null,
      lockedReason,
    };
  });

  const s1 = submissions.find(
    (s) => s.stageKey === StageKey.s1 && s.week === SINGLE_WEEK,
  );
  return {
    stages: rows,
    chargeType: entry.chargeType,
    /* 제출을 마친 뒤에는 못 바꾼다. 임시 저장 상태에서는 아직 바꿀 수 있다 */
    chargeTypeLocked: s1 !== undefined && s1.status !== SubmissionStatus.draft,
    serviceUrl: entry.serviceUrl,
  };
}

export type SaveResult =
  | { ok: true; status: SubmissionStatus }
  | { ok: false; code: SubmissionFailureCode };

/**
 * 한 스테이지를 저장한다 — 임시 저장과 제출이 같은 행을 쓴다(`status`만 다르다).
 * 행을 따로 만들면 `@@unique([entry_id, stage_key, week])`가 막고, 무엇이 정본인지도
 * 흐려진다.
 *
 * ⚠️ 제출은 **진도를 올린다.** `entry.stage`는 마지막으로 완료한 단계라 s1을 내면
 * `applied` → `s1`이 된다. 뒤로는 절대 내리지 않는다 — 재제출로 진도가 후퇴하면
 * 게이트를 통과한 팀이 다시 대기로 떨어진다. s4는 주차 반복이라 같은 스테이지를
 * 여러 번 내고, 그때마다 내려가면 안 된다.
 *
 * s1은 과금 유형을 참가 기록(entries)에 굳히고, s3은 서비스 주소를 참가 기록에도
 * 쓴다 — 심사·상호 테스터·참가작 페이지가 함께 읽는 값이라 payload 안에만 두면
 * 그때마다 제출을 뒤져야 한다. 측정 대상은 `hostnames.hostname`이 정본이라
 * 여기서 호스트명을 만들지 않는다.
 */
export async function saveStage(args: {
  entryId: string;
  seasonId: string;
  userId: string;
  stageKey: StageKey;
  payload: Prisma.InputJsonObject;
  intent: SubmitIntent;
  /** s1만. 첫 제출과 함께 굳는다 */
  chargeType?: ChargeType;
}): Promise<SaveResult> {
  const { entryId, seasonId, userId, stageKey, payload, intent, chargeType } = args;

  const overview = await loadSubmitOverview(entryId, seasonId);
  const row = overview?.stages.find((s) => s.stageKey === stageKey);
  if (!overview || !row) return { ok: false, code: "NOT_FOUND" };
  if (!row.editable) return { ok: false, code: row.lockedReason ?? "STAGE_LOCKED" };
  if (
    stageKey === StageKey.s1 &&
    chargeType &&
    overview.chargeTypeLocked &&
    chargeType !== overview.chargeType
  ) {
    return { ok: false, code: "CHARGE_TYPE_LOCKED" };
  }

  const submitting = intent === "submit";
  const status = submitting ? SubmissionStatus.submitted : SubmissionStatus.draft;
  /* 일어난 때는 진짜 지금이다(dev-clock 주석) */
  const now = new Date();
  const serviceUrl =
    stageKey === StageKey.s3 && typeof payload.serviceUrl === "string"
      ? payload.serviceUrl
      : null;

  await prisma.$transaction(async (tx) => {
    await tx.submission.upsert({
      where: { entryId_stageKey_week: { entryId, stageKey, week: row.week } },
      create: {
        entryId,
        stageKey,
        week: row.week,
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

    /*
      주소는 임시 저장에도 반영한다 — 참가작 페이지가 비어 있는 것보다 낫고,
      틀린 주소는 참가팀이 곧바로 고친다. 제출 여부와 무관하게 최신 신고값이다.
    */
    if (serviceUrl) {
      await tx.entry.update({ where: { id: entryId }, data: { serviceUrl } });
    }

    if (!submitting) return;

    if (stageKey === StageKey.s1 && chargeType) {
      await tx.entry.update({ where: { id: entryId }, data: { chargeType } });
    }

    const entry = await tx.entry.findUniqueOrThrow({
      where: { id: entryId },
      select: { stage: true },
    });
    /* EntryStage와 StageKey는 s1~s5에서 값이 같다 */
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

/** 인증된 사전 신청자 수 — s2의 「사전 신청자 수」 */
export async function loadVerifiedLeads(entryId: string): Promise<number> {
  return prisma.entryLead.count({
    where: { entryId, verifiedAt: { not: null } },
  });
}

export type FinalSnapshot = {
  validUsers: number | null;
  weeklyActive: number | null;
  retention: number | null;
  revenue: number | null;
};

/**
 * s5의 「최종 지표」 넷 — 허브 h7·h15가 그리는 값과 같은 자리에서 읽는다
 * (hub-read.ts). 순위표 행이 있으면 그 값, 없으면 일별 집계의 합이고, 참고
 * 지표 둘(주간 활성·재방문율)은 정의가 없으면 null이다 — 지어내지 않는다.
 */
export async function loadFinalSnapshot(
  entryId: string,
  seasonId: string,
): Promise<FinalSnapshot> {
  const [board, sum, extra] = await Promise.all([
    loadLeaderboard(seasonId),
    prisma.metricDaily.aggregate({
      where: { entryId },
      _count: { _all: true },
      _sum: { validVisitors: true, revenue: true },
    }),
    prisma.metricExtraDaily.findMany({
      where: { entryId },
      orderBy: { metricDate: "desc" },
      select: { value: true, definition: { select: { key: true } } },
    }),
  ]);
  const row = board.rows.find((r) => r.entryId === entryId) ?? null;
  const hasData = row !== null || sum._count._all > 0;
  const latest = (key: string) => {
    const hit = extra.find((r) => r.definition.key === key);
    return hit ? Number(hit.value) : null;
  };
  return {
    validUsers: hasData ? (row?.validVisitors ?? sum._sum.validVisitors ?? 0) : null,
    revenue: hasData ? Number(row?.revenue ?? sum._sum.revenue ?? 0) : null,
    weeklyActive: latest("weekly_active"),
    retention: latest("retention"),
  };
}

/**
 * 측정 연동이 어디까지 됐는가 — 내 지표 화면이 배포 전 안내에 쓴다.
 */
export async function loadHostnameStatus(entryId: string) {
  const hostname = await prisma.hostname.findUnique({
    where: { entryId },
    select: {
      hostname: true,
      deployStatus: true,
      ownershipVerifiedAt: true,
    },
  });
  return {
    registered: hostname !== null,
    hostname: hostname?.hostname ?? null,
    verified:
      hostname?.deployStatus === DeployStatus.active &&
      hostname.ownershipVerifiedAt !== null,
  };
}
