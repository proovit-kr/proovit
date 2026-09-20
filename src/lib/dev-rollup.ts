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

  ⚠️ **배포 크론과 같은 격자로 돈다** — :00 :15 :30 :45. 개발 서버 기동
  시각부터 15분을 세면 서버를 다시 띄울 때마다 처음부터 세게 되고, 개발 중에는
  그게 곧 「한 번도 안 도는 것」이다(실제로 그랬다 — 붙여 놓고도 「53분 전
  갱신」이 떴다).

  ⚠️ 기동 때는 **마지막 집계가 한 주기보다 낡았을 때만** 한 번 돌린다. 방금
  픽스처를 깔고 서버를 다시 띄운 경우를 덮지 않으려는 것이다 — 그 경우 마지막
  집계는 몇 분 전이라 그냥 다음 격자를 기다린다.
*/

const PERIOD_MS = ROLLUP_MINUTES * 60_000;

/*
  ⚠️ `console.log`를 쓰지 않는다. Next의 개발 서버는 로그를 요청에 묶어
  다시 내보내는데, **요청 컨텍스트 밖**(여기처럼 타이머 안)에서 부른 것은
  터미널에 나오지 않는다. 기동 때 한 줄은 보이고 15분마다의 결과만 조용히
  사라져서, 도는지 안 도는지 알 수 없었다(2026-09-20에 실제로 그랬다 —
  DB는 갱신됐는데 로그만 없었다).
*/
const say = (line: string) => process.stdout.write(`${line}\n`);

/*
  HMR로 이 모듈이 다시 평가돼도 타이머가 겹치지 않게 전역에 둔다
  (`prisma.ts`가 커넥션을 붙들어 두는 것과 같은 이유).
*/
const store = globalThis as unknown as {
  __devRollupOn?: boolean;
};

export function startDevRollup(): void {
  if (store.__devRollupOn) return;

  if (process.env.NODE_ENV === "production") return;
  if (process.env.DEV_ROLLUP === "0") {
    say("[dev-rollup] DEV_ROLLUP=0 — 롤업 타이머를 켜지 않는다");
    return;
  }

  const check = checkDevSandbox();
  if (!check.ok) {
    say(`[dev-rollup] 켜지 않는다: ${check.reason}`);
    return;
  }

  store.__devRollupOn = true;
  say(
    `[dev-rollup] ${ROLLUP_MINUTES}분 격자로 집계를 돌린다. 끄려면 DEV_ROLLUP=0`,
  );
  void schedule();
}

/** 마지막 집계가 한 주기보다 낡았는가 */
async function isStale(): Promise<boolean> {
  const latest = await prisma.leaderboardSnapshot.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });
  if (!latest) return true;
  return Date.now() - latest.updatedAt.getTime() >= PERIOD_MS;
}

async function schedule(): Promise<void> {
  /* 기동 직후: 이미 낡았으면 다음 격자를 기다리지 않는다 */
  if (await isStale()) await tick();

  /* 다음 격자까지 기다렸다가, 그 뒤로는 한 주기마다 */
  const untilNext = PERIOD_MS - (Date.now() % PERIOD_MS);
  const first = setTimeout(() => {
    void tick();
    /* 타이머가 개발 서버의 종료를 붙잡지 않게 한다 */
    setInterval(() => void tick(), PERIOD_MS).unref();
  }, untilNext);
  first.unref();
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
    say(
      result.skipped
        ? `[dev-rollup] 건너뜀 (${result.skipped})`
        : `[dev-rollup] ${result.ranked}팀 갱신 — ${result.snapshotDate}`,
    );
  } catch (error) {
    /* 개발 편의 도구다. 여기서 죽어도 개발 서버는 살아 있어야 한다 */
    say(`[dev-rollup] 실패 — ${String(error)}`);
  }
}
