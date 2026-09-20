# 측정 프록시 워커

참가작(`팀명.proovit.kr`)으로 오는 모든 요청을 참가팀 오리진으로 넘기면서
방문을 센다. 측정 정본이고(ADR-006), 무엇을 세는지는 `src/lib/measure.ts`에 있다.

## 지금 상태

**2026-09-20에 배포했다.** 네임서버를 가비아에서 클라우드플레어로 옮기면서
zone이 생겼고, `*.proovit.kr/*` route가 `proovit-measure`를 가리킨다. 루트와
www는 그대로 Vercel을 본다.

다만 **도는 것과 세는 것은 다르다.** 등록·소유 확인이 끝난 참가작이 아직 없어서
지금은 모든 서브도메인이 랜딩으로 302된다. 그게 정상이다.

## 배포 절차

1. 클라우드플레어에 `proovit.kr` zone을 만들고 **네임서버를 가비아에서 옮긴다.**
   루트·www의 기존 레코드(Vercel)를 먼저 그대로 옮겨 적어야 사이트가 안 끊긴다.
2. 참가팀 서브도메인은 프록시 켜짐(주황 구름)인 더미 레코드로 둔다.
   ⚠️ 참가팀 Pages로 CNAME하지 않는다 — orange-to-orange에서는 워커 route가
   안 걸린다(workers-sdk #11270). 오리진은 워커가 fetch로 직접 가져온다.
3. 앱에 `MEASURE_SECRET`을 넣고(`vercel env add`), 같은 값을 워커에도 넣는다.

       npx wrangler secret put MEASURE_SECRET

   ⚠️ Vercel의 Secret 타입은 **저장 뒤 값을 못 읽는다.** 양쪽 값이 갈리면 워커가
   라우트 표를 못 받아 참가작이 전부 랜딩으로 튕긴다 — 그런데 그 증상이 「참가작이
   아직 없을 때」와 똑같아 안 드러난다. 넣은 뒤에는 `npx wrangler secret list`로
   반드시 한 번 확인한다.

   ⚠️ `npx wrangler`를 처음 돌리면 macOS Gatekeeper가 esbuild 바이너리를 막는다.
   **「휴지통으로 이동」을 누르지 않는다** — 바이너리가 지워져 wrangler가 아예 안
   돌게 된다. 「완료」를 누른 뒤 격리 속성을 지운다.

       xattr -dr com.apple.quarantine "$(npm config get cache)/_npx"

4. 배포.

       cd workers/measure && npx wrangler deploy

   `wrangler`는 devDependency로 두지 않았다 — 배포할 때만 `npx`로 쓴다.

## 확인

- 등록·소유 확인이 끝난 참가작만 넘긴다(`/api/v1/measure/routes`).
- 모르는 호스트는 우리 랜딩으로 302.
- 쿠키 둘(`pv_v`·`pv_s`)은 HttpOnly라 참가작 스크립트가 못 읽는다.
- 집계가 들어오는지는 운영 콘솔의 지표 검토 화면과 리더보드 갱신 시각으로 본다.
