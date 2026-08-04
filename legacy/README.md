# legacy/vite-prototype

2026-07-22에 만들어진 **React + Vite 프로토타입**이다. 전 페이지가 목 데이터로 동작하는 완성품이며, 지금 레포(Next.js)로 이식하는 원본이다.

빌드에서 제외돼 있다 (`tsconfig.json`의 `exclude`). 참조용으로만 둔다.

## 왜 남겨두나

이 안에만 있는 정보가 있다.

| 위치 | 내용 |
|---|---|
| `design-reference/*.dc.html` | 전 페이지 디자인 시안 11장. 클로드 디자인 산출물 |
| `src/styles/tokens.css` | **디자인 토큰의 원본** — 색·라운드·간격·그림자·모션 |
| `src/pages/` | 12개 페이지 구현 (JSX + CSS Modules) |
| `src/components/` | 16개 컴포넌트 + DevToolbar(역할·시즌 상태 전환 시연) |
| `src/api/` | 목 API 레이어. 실 백엔드로 교체할 지점이 이미 분리돼 있다 |
| `src/mocks/index.ts` | 랜딩 카피, FAQ, 비교표 등 **실제 문구** |
| `src/types/index.ts` | 프론트 도메인 타입 |

## 이식 시 주의

- **라우트는 이쪽이 정본이다.** 여기 12개 라우트가 「필요 페이지 정리」와 정확히 일치한다.
  06 ARCHITECTURE §5.1의 7개 대시보드 하위 라우트는 나중에 나온 제안이며 구현된 적이 없다.
- `react-router-dom`을 쓰는 파일이 14개다. `next/link` · `useRouter` · `params`로 바꿔야 한다.
- `RouteGuards.tsx`는 **클라이언트 판정**이다. 06 §5.2는 서버 판정(`canAccess()` 단일 함수)을 요구하므로 그대로 옮기면 안 된다.
- CSS Modules와 zustand는 Next.js에서 그대로 동작한다. 페이지 JSX는 대부분 재사용 가능하다.
- 목 데이터는 `src/api/`를 통해서만 들어온다 — 실 API 교체가 여기 한 곳이다.

## 이식 현황

- [x] 디자인 토큰 → `src/app/globals.css`
- [x] 랜딩 `/` — 티커·라이브 리더보드는 실데이터 없어 보류
- [ ] 리더보드 `/leaderboard`
- [ ] 참가작 `/projects/:id`
- [ ] 시즌 아카이브 `/seasons`
- [ ] 로그인·회원가입 `/signin` `/signup`
- [ ] 참가 신청 `/apply`
- [ ] 대시보드 `/dashboard`
- [ ] 제출 폼 `/dashboard/submissions/:stage`
- [ ] 운영 콘솔 `/admin/judging` `/admin/metrics` `/admin/seasons`

전부 이식이 끝나면 이 디렉토리는 지운다.
