import type { NextRequest } from "next/server";

import { apiOk } from "@/lib/api";
import { edgeAuth } from "@/lib/measure-auth";
import { DeployStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

/*
  GET /api/v1/measure/routes — 엣지가 「어느 주소를 어디로 넘길지」를 여기서 받는다.

  워커 코드에 표를 박지 않는 이유는 참가팀이 시즌 중에 들어오고, 주소가 바뀔 때마다
  워커를 다시 배포하면 그 사이 트래픽이 통째로 비기 때문이다. 워커는 이 답을
  몇 분 캐시하고 쓴다.

  ⚠️ **소유 확인이 끝난 것만 준다.** 확인 전 주소를 프록시가 넘기기 시작하면
  남의 서비스를 우리 도메인으로 띄우는 길이 열린다.

  ⚠️ 참가팀 이름·팀명은 넣지 않는다. 엣지가 아는 것은 호스트와 오리진뿐이면 된다.
*/

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = edgeAuth(request);
  if (denied) return denied;

  const rows = await prisma.hostname.findMany({
    where: {
      ownershipVerifiedAt: { not: null },
      originUrl: { not: null },
      deployStatus: DeployStatus.active,
    },
    select: { hostname: true, originUrl: true },
    orderBy: { hostname: "asc" },
  });

  return apiOk({
    routes: rows.map((r) => ({ hostname: r.hostname, origin: r.originUrl })),
  });
}
