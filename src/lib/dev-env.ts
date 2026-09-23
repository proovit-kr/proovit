/*
  개발 도구(개발 바·상태 토글·개발용 시계)를 켜는 빌드인가.

  로컬 `next dev`와 **Vercel 프리뷰(스테이징)** 두 곳에서 켠다. 프리뷰도
  `NODE_ENV=production`으로 빌드되므로 NODE_ENV만 보면 스테이징에서 바가
  사라지고, 팀원은 DB에 든 상태 하나만 보게 된다(2026-09-23). 그래서
  Vercel이 런타임에 넣어 주는 `VERCEL_ENV`를 함께 본다 — 값은 `production`·
  `preview`·`development` 셋이고, 운영 배포는 `production`이다.

  ⚠️ 이것만으로 쓰기가 열리지 않는다. `dev-sandbox.ts`의 두 번째 안전장치
  「dev DB(ep-floral-truth…)에 붙어 있을 때만」이 그대로 남는다. 프리뷰의
  DATABASE_URL이 운영을 가리키면 바는 이유만 보여 주고 아무것도 고치지 않는다.

  ⚠️ 개발용 시계·허브 판은 `os.tmpdir()`의 파일에 둔다. Vercel 함수에서는
  인스턴스마다 따로라, 인스턴스가 바뀌면 「가정한 오늘」이 풀릴 수 있다.
  DB에 든 상태(페이즈·진도·탈락)는 영향이 없다.
*/
export const devToolsEnabled =
  process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview";
