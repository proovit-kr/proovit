# PROOVIT

AI 빌드 시즌제 리그 플랫폼. 1~2인 팀이 AI로 실제 웹서비스를 만들고, 배포한 뒤 외부 이용자·매출 지표로 겨루는 온라인 리그입니다.

산출물은 수료증이 아니라 **배포된 서비스와 지표 데이터**입니다.

## 스택

| 영역 | 기술 |
|---|---|
| 프론트 + API | Next.js 16 (App Router) · TypeScript |
| UI | Tailwind CSS v4 · Pretendard |
| DB | PostgreSQL (Neon) · Prisma 7 |
| 인증 | Auth.js — Kakao / Google (W2 예정) |
| 배포 | Vercel |
| 측정 | Cloudflare Worker 리버스 프록시 (시즌2 예정) |

Next.js를 쓰는 이유는 랜딩·리더보드·참가작 페이지의 **SEO와 OG 카드**입니다. 관전자 유입이 리더보드의 존재 이유라 SSR이 필수고, 그래서 SPA를 쓰지 않습니다.

## 시작하기

```bash
npm install
cp .env.example .env     # DATABASE_URL 등을 채운다
npx prisma dev           # 로컬 Postgres 실행 (또는 Neon 주소를 .env에 넣는다)
npx prisma migrate dev   # 스키마 반영
npm run dev
```

http://localhost:3000

## 구조

```
prisma/schema.prisma   스키마의 소스 오브 트루스 (Notion 03 ERD 문서 대신)
src/app/               App Router — 페이지와 API 라우트
src/app/globals.css    디자인 토큰 (딥네이비 #0B1220 + 라임 #C8FF3D)
```

`prisma/schema.prisma`가 ERD 문서를 대신합니다. 문서와 코드를 이중 관리할 여유가 없어, 스키마는 코드에서만 관리하고 필요할 때 Notion으로 내보냅니다.

## 시즌1 라우트

```
공개    /  ·  /leaderboard  ·  /projects/:id  ·  /seasons  ·  /signin
참가자  /apply  ·  /dashboard  ·  /dashboard/submissions/:stage
운영    /admin/judging  ·  /admin/metrics  ·  /admin/seasons
```

코드 에디터(`/workspaces/:id`)와 단계별 학습은 시즌1 범위 밖입니다.

## 개발 순서

| 주차 | 범위 |
|---|---|
| W1 | 랜딩 + 사전 신청 (`Season` · `Lead`) |
| W2 | 로그인 · 참가 신청 · 대시보드 골격 |
| W3 | 스테이지 제출 · 게이트 · 심사 콘솔 |
| W4 | 지표 검증 · 리더보드 · 참가작 페이지 → 배포 |

시즌1은 트래픽 자동 집계 없이 **애널리틱스 스크린샷 증빙 + 운영진 검증**으로 운영합니다. Cloudflare Worker 측정은 시즌1을 굴리면서 병행 개발해 시즌2에 투입합니다.

## 기획 문서

Notion 프로젝트 허브에 있습니다. 구현 근거로 가장 자주 보는 것은:

- **필요 페이지 정리** — 라우트·페이지 이동 규칙·유저플로우. 사실상의 화면정의서
- **04. API 명세서** — 엔드포인트와 참조 테이블
- **06. ARCHITECTURE** — 스택 선택 근거와 기각한 대안

## 팀

- 이윤서 — 사업기획 · 시즌 운영
- 진수연 — 개발
- 신동혁 — 웹 기획 · IA · ERD · API 설계
