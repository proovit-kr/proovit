import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { apiFail, apiOk } from "@/lib/api";
import { runRollup } from "@/lib/rollup";
import { getCurrentSeason } from "@/lib/season";

/*
  POST /api/v1/cron/rollup — 리더보드 롤업을 한 번 돌린다.

  15분마다 GitHub Actions가 부른다(`.github/workflows/rollup.yml`). Vercel 무료
  플랜의 크론은 하루 한 번이라 쓸 수 없다(2026-09-20 수연 결정).

  ⚠️ **비밀키로 잠근다.** 이 주소가 열려 있으면 아무나 집계를 돌릴 수 있고,
  그 자체가 우리가 파는 「조작 불가능한 지표」의 반례가 된다. 키는 환경변수
  `CRON_SECRET`이고, 없으면 **아무도 못 부른다**(fail-closed) — 키를 안 넣은
  배포에서 열린 채로 도는 것이 제일 나쁘다.

  집계 자체가 무엇을 계산하는지는 `lib/rollup.ts`에 있다.
*/

/* 이 라우트는 매번 DB를 읽고 쓴다 — 캐시가 붙으면 크론이 헛돈다 */
export const dynamic = "force-dynamic";

/**
 * 길이가 달라도 시간이 새지 않게 비교한다. `timingSafeEqual`은 길이가 다르면
 * 던지므로 해시 대신 길이를 먼저 맞춘다.
 */
function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return apiFail("NOT_FOUND", "요청한 주소를 찾을 수 없습니다.");
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !secretMatches(token, expected)) {
    return apiFail("UNAUTHENTICATED", "인증이 필요합니다.");
  }

  const season = await getCurrentSeason();
  if (!season) {
    return apiFail("NOT_FOUND", "집계할 시즌이 없습니다.");
  }

  const result = await runRollup({ seasonId: season.id });
  return apiOk(result);
}
