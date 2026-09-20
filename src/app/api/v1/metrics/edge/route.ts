import type { NextRequest } from "next/server";

import { apiFail, apiOk } from "@/lib/api";
import { ingestVisits } from "@/lib/measure-ingest";
import { edgeAuth } from "@/lib/measure-auth";
import { z } from "@/lib/z";

/*
  POST /api/v1/metrics/edge — 측정 프록시(클라우드플레어 워커)가 보내는 방문 이벤트.

  무엇을 셀지는 엣지가 정하고(쿠키 판정), 여기서는 받아 적는다. 판정을 양쪽에
  두지 않는 이유는 `lib/measure-ingest.ts` 머리에 있다.

  ⚠️ **비밀키로 잠근다.** 이 주소가 열려 있으면 아무나 남의 팀 방문자 수를
  올릴 수 있다 — 우리가 파는 「참가자가 만질 수 없는 숫자」가 그 순간 거짓이 된다.
  `MEASURE_SECRET`이 없으면 404다(롤업 크론과 같은 방식).
*/

export const dynamic = "force-dynamic";

const visitSchema = z.object({
  hostname: z.string().max(255),
  newVisitor: z.boolean(),
  newSession: z.boolean(),
  engaged: z.boolean(),
  /* 스키마의 metric_channel_daily.channel이 VarChar(60)이다 */
  channel: z.string().min(1).max(60),
  at: z.string().max(40),
});

/* 워커는 요청마다 보내지 않고 모아 보낸다 — 한 번에 받는 상한을 둔다 */
const bodySchema = z.object({
  visits: z.array(visitSchema).min(1).max(500),
});

export async function POST(request: NextRequest) {
  const denied = edgeAuth(request);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  if (body === null) return apiFail("INVALID_JSON", "본문을 읽을 수 없습니다.");

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiFail("VALIDATION_FAILED", "요청 본문이 올바르지 않습니다.");
  }

  /* 시각은 엣지가 보낸 값이다 — 못 읽으면 그 이벤트만 버린다 */
  const visits = parsed.data.visits.filter(
    (v) => !Number.isNaN(new Date(v.at).getTime()),
  );
  if (visits.length === 0) {
    return apiFail("VALIDATION_FAILED", "시각을 읽을 수 없습니다.");
  }

  const result = await ingestVisits(visits);
  return apiOk(result);
}
