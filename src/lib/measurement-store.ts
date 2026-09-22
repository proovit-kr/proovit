import {
  DeployStatus,
  HostnameType,
  Prisma,
} from "@/generated/prisma/client";
import {
  fullHostname,
  measurementState,
  originResponded,
  type MeasurementFailureCode,
  type MeasurementState,
} from "@/lib/measurement";
import { prisma } from "@/lib/prisma";

/*
  측정 주소 등록과 검증. **서버 전용이다** — 주소 규칙은 measurement.ts에 있다.

  프록시는 클라우드플레어 워커다(ADR-006, 2026-09-20 배포). 워커는
  `/api/v1/measure/routes`에서 **검증이 끝난 행만** 받아 라우팅하므로, 여기서
  검증을 통과시키는 것이 곧 「팀 주소가 살아나는」 순간이다.

  검증은 **배포 주소가 응답하는지**다. 워커가 그 주소로 대신 가져와 보여주는
  구조라 DNS도 코드 심기도 없고, 확인할 것은 그 주소가 열리는지뿐이다 —
  시안 ③의 원인 문구 「등록한 배포 주소가 응답하지 않아요」가 이 검사의 실패다.
*/

export type MeasurementView = {
  label: string | null;
  hostname: string | null;
  originUrl: string | null;
  deployStatus: DeployStatus | null;
  verifiedAt: Date | null;
  /** 시안 ①②③. 행이 없으면 null — 아직 등록 전이다 */
  state: MeasurementState | null;
  /** 검증이 끝나면 주소를 못 바꾼다 — 바뀌면 그동안의 집계가 끊긴다 */
  locked: boolean;
  analyticsPropertyId: string | null;
};

export async function loadMeasurement(
  entryId: string,
): Promise<MeasurementView> {
  const row = await prisma.hostname.findUnique({
    where: { entryId },
    select: {
      hostname: true,
      originUrl: true,
      deployStatus: true,
      ownershipVerifiedAt: true,
      analyticsPropertyId: true,
    },
  });

  if (!row) {
    return {
      label: null,
      hostname: null,
      originUrl: null,
      deployStatus: null,
      verifiedAt: null,
      state: null,
      locked: false,
      analyticsPropertyId: null,
    };
  }

  return {
    label: row.hostname.split(".")[0] ?? null,
    hostname: row.hostname,
    originUrl: row.originUrl,
    deployStatus: row.deployStatus,
    verifiedAt: row.ownershipVerifiedAt,
    state: measurementState({
      deployStatus: row.deployStatus,
      verifiedAt: row.ownershipVerifiedAt,
    }),
    locked: row.ownershipVerifiedAt !== null,
    analyticsPropertyId: row.analyticsPropertyId,
  };
}

export type MeasurementResult =
  | { ok: true; hostname: string }
  | { ok: false; code: MeasurementFailureCode };

/**
 * 측정 주소 등록·변경.
 *
 * ⚠️ 검증이 끝난 뒤에는 못 바꾼다. 주소가 바뀌면 그 시점 이전의 집계가
 * 어느 주소 것인지 흐려지고, 리더보드 숫자의 근거가 끊긴다. 바꿔야 하면
 * 운영이 감사 로그를 남기고 처리할 일이다.
 */
export async function registerHostname(args: {
  entryId: string;
  label: string;
  originUrl: string;
}): Promise<MeasurementResult> {
  const { entryId, label, originUrl } = args;
  const hostname = fullHostname(label);

  const current = await prisma.hostname.findUnique({
    where: { entryId },
    select: { ownershipVerifiedAt: true },
  });
  if (current?.ownershipVerifiedAt) return { ok: false, code: "LOCKED" };

  try {
    await prisma.hostname.upsert({
      where: { entryId },
      create: {
        entryId,
        hostname,
        /* 시즌1은 서브도메인만이다(ADR-007). custom은 화면에서도 막고 여기서도 안 만든다 */
        type: HostnameType.proovit_sub,
        originUrl,
        deployStatus: DeployStatus.pending,
      },
      update: {
        hostname,
        originUrl,
        /* 주소를 바꾸면 확인 절차를 처음부터 다시 한다 */
        deployStatus: DeployStatus.pending,
      },
    });
  } catch (error) {
    /* hostname 유니크 — 다른 팀이 먼저 잡은 경우다 */
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, code: "LABEL_TAKEN" };
    }
    throw error;
  }

  return { ok: true, hostname };
}

/** 배포 주소를 부르고 기다리는 한도. 빌더 무료 티어가 깨어나는 시간을 넉넉히 준다 */
const VERIFY_TIMEOUT_MS = 10_000;

/**
 * 배포 주소가 응답하는지 실제로 불러 본다. 본문은 읽지 않는다 — 상태만 본다.
 *
 * ⚠️ 여기서 부르는 주소는 참가자가 적은 것이다. `OriginUrlSchema`가 https·공개
 * 도메인만 통과시키므로 내부 주소로는 못 보내지만, 응답 본문을 어디에도
 * 옮기지 않는 것이 두 번째 방어다.
 */
async function probeOrigin(originUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const res = await fetch(originUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "proovit-verify/1 (+https://proovit.kr)" },
      cache: "no-store",
    });
    /* 본문은 버린다 — 연결을 붙든 채 함수가 끝나지 않게 */
    await res.body?.cancel().catch(() => undefined);
    return originResponded(res.status);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export type VerifyResult =
  | { ok: true; state: MeasurementState }
  | { ok: false; code: MeasurementFailureCode };

/**
 * 등록된 배포 주소를 검증한다 — 시안의 「다시 검증하기」.
 *
 * 통과하면 `active` + 검증 시각(처음 한 번만 찍는다), 실패하면 `failed`.
 * 이미 검증된 행은 다시 부르지 않는다 — 통과한 뒤 잠깐 내려간 서비스 때문에
 * 집계가 끊기면 안 된다(그건 운영이 볼 일이다).
 */
export async function verifyHostname(entryId: string): Promise<VerifyResult> {
  const row = await prisma.hostname.findUnique({
    where: { entryId },
    select: { originUrl: true, ownershipVerifiedAt: true },
  });
  if (!row) return { ok: false, code: "NOT_FOUND" };
  if (row.ownershipVerifiedAt) return { ok: true, state: "ok" };
  if (!row.originUrl) return { ok: false, code: "NOT_FOUND" };

  const responded = await probeOrigin(row.originUrl);
  const now = new Date();
  await prisma.hostname.update({
    where: { entryId },
    data: responded
      ? {
          deployStatus: DeployStatus.active,
          ownershipVerifiedAt: now,
          lastCheckedAt: now,
        }
      : { deployStatus: DeployStatus.failed, lastCheckedAt: now },
  });
  return { ok: true, state: responded ? "ok" : "fail" };
}
