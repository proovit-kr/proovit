import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { apiFail, apiOk } from "@/lib/api";
import { runRollup } from "@/lib/rollup";
import { getCurrentSeason } from "@/lib/season";

/*
  GET·POST /api/v1/cron/rollup — 리더보드 롤업을 한 번 돌린다.

  15분마다 Vercel 크론이 부른다(`vercel.json`). 팀이 Pro라 분 단위 스케줄을
  쓸 수 있다 — 하루 한 번으로 묶이는 것은 Hobby 플랜이다(2026-09-20 확인).

  ⚠️ **Vercel 크론은 GET으로 부른다.** 그래서 GET과 POST가 같은 일을 한다.
  POST를 남겨 두는 이유는 외부 크론 서비스로 갈아탈 자리를 비워 두기 위해서다 —
  집계를 돌리는 것은 부수효과가 있는 호출이라 손으로 부를 때는 POST가 맞다.

  ⚠️ 크론이 보내는 `Authorization: Bearer <CRON_SECRET>` 헤더는 **Vercel이
  직접 붙인다.** 환경변수 `CRON_SECRET`이 그 배포에 실려 있을 때만 붙으므로,
  키를 넣은 뒤에는 반드시 한 번 다시 배포해야 한다.

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

async function handle(request: NextRequest) {
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

/** Vercel 크론이 부르는 쪽 */
export async function GET(request: NextRequest) {
  return handle(request);
}

/** 손으로 부르거나 외부 크론이 부르는 쪽 */
export async function POST(request: NextRequest) {
  return handle(request);
}
