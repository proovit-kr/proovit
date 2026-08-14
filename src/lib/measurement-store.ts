import {
  DeployStatus,
  HostnameType,
  Prisma,
} from "@/generated/prisma/client";
import {
  fullHostname,
  type MeasurementFailureCode,
} from "@/lib/measurement";
import { prisma } from "@/lib/prisma";

/*
  측정 주소 등록. **서버 전용이다** — 주소 규칙은 measurement.ts에 있다.

  ⚠️ 이 화면이 만드는 것은 **신청 상태의 행 하나**다. 실제 프록시(Cloudflare 커스텀
  호스트명·라우트)와 소유 확인은 아직 안 붙었다 — ADR-006 측정 경로가 8/17 안건이라
  그 결정 전에 인프라를 만들면 버리게 된다.

  그래서 저장은 `deploy_status = pending`까지만 하고, `worker_route`·`cf_hostname_id`·
  `ownership_verified_at`은 비운다. **비어 있다는 사실 자체가 화면의 정보다** —
  참가자는 "등록됐지만 아직 집계 전"임을 알아야 배포를 서두른다.
*/

export type MeasurementView = {
  label: string | null;
  hostname: string | null;
  originUrl: string | null;
  deployStatus: DeployStatus | null;
  verifiedAt: Date | null;
  /** 소유 확인이 끝나면 주소를 못 바꾼다 — 바뀌면 그동안의 집계가 끊긴다 */
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
 * ⚠️ 소유 확인이 끝난 뒤에는 못 바꾼다. 주소가 바뀌면 그 시점 이전의 집계가
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
