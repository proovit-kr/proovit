import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

import { apiFail } from "@/lib/api";

/*
  측정 파이프라인의 두 주소(`/api/v1/metrics/edge`, `/api/v1/measure/routes`)가
  같은 열쇠를 쓴다. 엣지 워커 하나만 부르는 주소라 열쇠도 하나다.

  키가 **없으면 404**다. 「설정을 깜빡한 배포」가 열린 채로 도는 것이
  제일 나쁘다 — 롤업 크론과 같은 판단이다.
*/
function matches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** 통과하면 null, 막히면 그대로 돌려줄 응답 */
export function edgeAuth(request: NextRequest): Response | null {
  const expected = process.env.MEASURE_SECRET;
  if (!expected) return apiFail("NOT_FOUND", "요청한 주소를 찾을 수 없습니다.");

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !matches(token, expected)) {
    return apiFail("UNAUTHENTICATED", "인증이 필요합니다.");
  }
  return null;
}
