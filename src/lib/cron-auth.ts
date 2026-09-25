import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

import { apiFail } from "@/lib/api";

/*
  크론 라우트의 열쇠 — 롤업(`/api/v1/cron/rollup`)과 페이즈 전환
  (`/api/v1/cron/phase`)이 같이 쓴다. Vercel 크론이 두 주소에 같은
  `Authorization: Bearer <CRON_SECRET>`을 붙이므로 열쇠도 하나다.

  ⚠️ **키가 없으면 404다**(fail-closed). 키를 안 넣은 배포에서 열린 채로 도는
  것이 제일 나쁘다 — 아무나 집계를 돌리고 페이즈를 넘길 수 있게 된다.

  측정 파이프라인의 열쇠(`measure-auth.ts`)와 모양이 같지만 합치지 않았다 —
  부르는 쪽(엣지 워커 ↔ Vercel 크론)과 키가 다르다.
*/

/**
 * 길이가 달라도 시간이 새지 않게 비교한다. `timingSafeEqual`은 길이가 다르면
 * 던지므로 길이를 먼저 맞춘다.
 */
function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** 통과하면 null, 막히면 그대로 돌려줄 응답 */
export function cronAuth(request: NextRequest): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) return apiFail("NOT_FOUND", "요청한 주소를 찾을 수 없습니다.");

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !secretMatches(token, expected)) {
    return apiFail("UNAUTHENTICATED", "인증이 필요합니다.");
  }
  return null;
}
