import { SeasonPhase } from "@/generated/prisma/enums";

import { checkDevSandbox } from "./dev-sandbox";
import { prisma } from "./prisma";
import { runRollup } from "./rollup";
import { ROLLUP_MINUTES } from "./rollup-period";

/*
  개발용 롤업 타이머 — **배포에서 크론이 하는 일을 로컬에서 흉내 낸다.**

  `vercel.json`의 크론은 배포본의 `/api/v1/cron/rollup`을 15분마다 부른다.
  `npm run dev`에는 그 스케줄러가 없어서 로컬에서는 집계가 **한 번도 돌지
  않는다.** 그래서 리더보드의 갱신 줄이 픽스처를 찍은 시각에 멈춰 있고,
  시간이 갈수록 「33분 전 갱신」처럼 주기를 넘긴 값이 뜬다(2026-09-20 수연
  지적). 배포에서 크론이 멈춘 것과 화면이 구별되지 않는 상태였다.

  ⚠️ **운영 DB에서는 절대 돌지 않는다.** 가드가 셋이다 —
  `instrumentation.ts`가 production 빌드에서 부르지 않고, 여기서 NODE_ENV를
  다시 보고, `checkDevSandbox()`가 DATABASE_URL 호스트까지 확인한다
  (`.env`를 실은 채 로컬을 띄우는 사고가 2026-08-27에 있었다).

  ⚠️ **대조 중에는 끄는 것이 안전하다.** `DEV_ROLLUP=0 npm run dev`.
  픽스처가 깐 순위를 롤업이 다시 계산해 덮을 수 있다. 다만 「시즌 종료」는
  `runRollup`이 확정된 스냅샷을 건드리지 않으므로(`skipped: "finalized"`)
  영향이 없고, 대조는 보통 한 주기 안에 끝난다.

  ⚠️ **첫 실행을 즉시 하지 않는다.** 개발 서버를 띄울 때마다 픽스처를 덮으면
  방금 만든 상태로 화면을 여는 일 자체가 안 된다. 한 주기 뒤부터 돈다.
*/

const PERIOD_MS = ROLLUP_MINUTES * 60_000;

/*
  HMR로 이 모듈이 다시 평가돼도 타이머가 겹치지 않게 전역에 둔다
  (`prisma.ts`가 커넥션을 붙들어 두는 것과 같은 이유).
*/
const store = globalThis as unknown as {
  __devRollupTimer?: ReturnType<typeof setInterval>;
};

export function startDevRollup(): void {
  if (store.__devRollupTimer) return;

  if (process.env.NODE_ENV === "production") return;
  if (process.env.DEV_ROLLUP === "0") {
    console.log("[dev-rollup] DEV_ROLLUP=0 — 롤업 타이머를 켜지 않는다");
    return;
  }

  const check = checkDevSandbox();
  if (!check.ok) {
    console.log(`[dev-rollup] 켜지 않는다: ${check.reason}`);
    return;
  }

  const timer = setInterval(() => void tick(), PERIOD_MS);
  /* 타이머가 개발 서버의 종료를 붙잡지 않게 한다 */
  timer.unref();
  store.__devRollupTimer = timer;
  console.log(
    `[dev-rollup] ${ROLLUP_MINUTES}분마다 집계를 돌린다. 끄려면 DEV_ROLLUP=0`,
  );
}

async function tick(): Promise<void> {
  try {
    /*
      `getCurrentSeason()`을 쓰지 않는다 — React `cache()`로 감싸여 있어
      요청 컨텍스트 밖에서 부를 것이 아니다. 조건은 그쪽과 같게 맞춘다.
    */
    const season = await prisma.season.findFirst({
      where: { phase: { not: SeasonPhase.draft } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!season) return;

    const result = await runRollup({ seasonId: season.id });
    console.log(
      result.skipped
        ? `[dev-rollup] 건너뜀 (${result.skipped})`
        : `[dev-rollup] ${result.ranked}팀 갱신 — ${result.snapshotDate}`,
    );
  } catch (error) {
    /* 개발 편의 도구다. 여기서 죽어도 개발 서버는 살아 있어야 한다 */
    console.error("[dev-rollup] 실패", error);
  }
}
