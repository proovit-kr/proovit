# 측정 프록시 워커

참가작(`팀명.proovit.kr`)으로 오는 모든 요청을 참가팀 오리진으로 넘기면서
방문을 센다. 측정 정본이고(ADR-006), 무엇을 세는지는 `src/lib/measure.ts`에 있다.

## 지금 상태

**배포 전이다.** `proovit.kr`의 네임서버가 가비아에 있고 루트는 Vercel을 본다
(2026-09-20 확인). 워커 route는 클라우드플레어 zone에서만 걸린다.

## 배포 절차

1. 클라우드플레어에 `proovit.kr` zone을 만들고 **네임서버를 가비아에서 옮긴다.**
   루트·www의 기존 레코드(Vercel)를 먼저 그대로 옮겨 적어야 사이트가 안 끊긴다.
2. 참가팀 서브도메인은 프록시 켜짐(주황 구름)인 더미 레코드로 둔다.
   ⚠️ 참가팀 Pages로 CNAME하지 않는다 — orange-to-orange에서는 워커 route가
   안 걸린다(workers-sdk #11270). 오리진은 워커가 fetch로 직접 가져온다.
3. 앱에 `MEASURE_SECRET`을 넣고(`vercel env add`), 같은 값을 워커에도 넣는다.

       npx wrangler secret put MEASURE_SECRET

4. 배포.

       cd workers/measure && npx wrangler deploy

   `wrangler`는 devDependency로 두지 않았다 — 배포할 때만 `npx`로 쓴다.

## 확인

- 등록·소유 확인이 끝난 참가작만 넘긴다(`/api/v1/measure/routes`).
- 모르는 호스트는 우리 랜딩으로 302.
- 쿠키 둘(`pv_v`·`pv_s`)은 HttpOnly라 참가작 스크립트가 못 읽는다.
- 집계가 들어오는지는 운영 콘솔의 지표 검토 화면과 리더보드 갱신 시각으로 본다.
