/**
 * 롤업 주기(분).
 *
 * 서버(개발용 타이머 `dev-rollup.ts`, 배포는 `vercel.json`의 크론)와 화면
 * (`UpdatedAt.tsx`의 「롤업 주기 15분」·첫 갱신까지 남은 시간)이 **같은 값**을
 * 써야 해서 따로 둔다. 화면 쪽 파일은 `"use client"`라 서버에서 끌어다 쓸
 * 자리가 아니고, `rollup.ts`는 prisma를 물고 있어 화면이 끌어다 쓸 수 없다.
 *
 * ⚠️ 바꾸면 `vercel.json`의 cron schedule도 같이 바꾼다. 거기는 문자열이라
 * 이 상수를 참조할 수 없다.
 */
export const ROLLUP_MINUTES = 15;
