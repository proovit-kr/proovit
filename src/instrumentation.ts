/*
  서버가 뜰 때 한 번 불린다(Next의 `instrumentation` 규약).

  지금 하는 일은 하나 — **개발용 롤업 타이머**를 켠다. 배포에서는
  `vercel.json`의 크론이 그 일을 하고, 로컬에는 그 스케줄러가 없다.
  왜 필요한지는 `lib/dev-rollup.ts` 머리 주석에 있다.

  ⚠️ 동적 import를 쓴다. 정적으로 올리면 prisma를 물고 있는 모듈이
  Edge 런타임 번들에도 딸려 들어간다.
*/
export async function register(): Promise<void> {
  /* 미들웨어·Edge에서도 불린다. DB를 만지는 일은 Node에서만 한다 */
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV === "production") return;

  const { startDevRollup } = await import("@/lib/dev-rollup");
  startDevRollup();
}
