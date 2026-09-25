import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";

import { apiOk } from "@/lib/api";
import { cronAuth } from "@/lib/cron-auth";
import { runPhaseSchedule } from "@/lib/phase-schedule";

/*
  GET·POST /api/v1/cron/phase — 예정된 페이즈 전환을 한 번 처리한다.

  2026-09-25 수연 지시. `season_schedules`의 예정 시각이 지난 행을 읽어
  `seasons.phase`를 넘긴다(ADR-010). 무엇을 넘기고 무엇을 건너뛰는지는
  `lib/phase-schedule.ts`에, 판정은 `lib/season-phase.ts`에 있다.
  **뒤로는 절대 안 간다** — 수동으로 앞당기거나 되돌린 페이즈를 덮지 않는다.

  ⚠️ **15분마다 부른다**(`vercel.json`, 롤업과 같은 15분 격자).
  처음에는 매분으로 짰는데, 매분 DB를 읽으면 Neon 컴퓨트가 자동 일시정지에
  들어가지 못해 하루 종일 깨어 있게 된다(롤업이 깨우는 시각과 겹치면 추가로
  깨우는 일이 없다). 그래서 일정은 **15분 격자**(00:00·09:15 같은 시각)로
  넣는다 — 모집 마감이 00:00이면 00:00 크론이 넘긴다. 격자 밖 시각을 넣으면
  다음 칸에 넘어간다. (2026-09-25, 내가 정함·수연 확인 대기)

  ⚠️ **로컬 개발 서버에는 타이머를 붙이지 않는다**(롤업의 `dev-rollup.ts`와
  다르다). 수연이 개발 바로 페이즈를 바꿔 가며 화면을 검토하는데, 타이머가
  dev DB의 일정 행대로 페이즈를 다시 옮겨 놓으면 검토 중인 판이 1분 만에
  바뀐다. 프리뷰(스테이징) 배포도 Vercel이 크론을 부르지 않는다 — 크론은
  운영 배포에서만 돈다. 둘 다 돌려 보고 싶으면 POST로 손으로 부른다.

  ⚠️ 인증은 롤업과 같다(`lib/cron-auth.ts`) — `CRON_SECRET`이 없으면 404,
  틀리면 401. Vercel 크론은 GET으로 부르고 헤더는 Vercel이 붙인다.

  전환이 하나라도 있으면 레이아웃째 다시 그린다. 운영 콘솔 페이즈 전환 액션
  (`admin/seasons/actions.ts`)과 같은 이유다 — 페이즈 하나가 화면 서른 개의
  열림/닫힘을 바꾸는데 랜딩·헤더는 정적 렌더 캐시에 남아 있다.
*/

/* 이 라우트는 매번 DB를 읽고 쓴다 — 캐시가 붙으면 크론이 헛돈다 */
export const dynamic = "force-dynamic";

async function handle(request: NextRequest) {
  const denied = cronAuth(request);
  if (denied) return denied;

  const result = await runPhaseSchedule();
  if (result.transitions.length > 0) revalidatePath("/", "layout");
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
