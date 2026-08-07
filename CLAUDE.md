@AGENTS.md

# PROOVIT

AI 빌드 시즌제 리그 플랫폼. 1~2인 팀이 AI로 웹서비스를 만들고 배포한 뒤,
**외부 이용자·매출 지표로 겨루는** 온라인 리그다. 산출물은 수료증이 아니라 지표다.

전신은 **핵플레이(HackPlay)** 코딩 교육 플랫폼이며 2026년 7월 시즌제 리그로 방향 전환했다.
**기존 핵플레이 코드베이스는 재사용하지 않는다** — 이 레포는 신규 구축이다.
문서·UI에 "핵플레이" 표기가 남아 있으면 잔재다.

## 팀

- **이윤서** 팀장 — 사업기획·시즌운영·마케팅·스폰서·가이드 집필
- **진수연** 개발 — 이 레포 전체 (개발 인원은 1명이다)
- **신동혁** 기획 — IA·유저플로우·ERD·API 설계·측정 레이어 조사

회의는 **매주 수요일 22:00**.

## 마감

**2026년 8월말~9월초** — 「모두의 창업 2기」 신청 전까지 기획→구현→**배포**까지 끝내야 한다.
9/27은 시즌 종료 가안이지 개발 마감이 아니다.

## 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 프론트+API | Next.js 16 App Router | 랜딩·리더보드의 **SEO·OG**. 관전자 유입이 리더보드의 존재 이유다 |
| DB | PostgreSQL (Neon, ap-southeast-1) | 관계 정합성 + 서버리스 |
| ORM | Prisma 7 | `schema.prisma`가 스키마의 소스 오브 트루스 |
| 인증 | Auth.js (Kakao·Google, **DB 세션**) | 실격 시 즉시 무효화가 필요해 JWT를 쓸 수 없다 |
| UI | Tailwind v4 + CSS Modules · Pretendard | |
| 배포 | Vercel | |

**SPA를 쓰지 않는 이유**는 크롤러·OG 취약(06 ARCHITECTURE C3)이다. 이 결정을 되돌리지 말 것.

## 명령

```bash
npm run dev          # 개발 서버
npm run build        # prisma generate + next build
npm run typecheck    # tsc --noEmit
npm run lint
npm run db:seed      # 시즌1 시드 (upsert라 재실행 안전)

npx prisma migrate dev     # 로컬에서만
npx prisma migrate deploy  # 프로덕션
```

## 구조

```
prisma/schema.prisma      스키마 소스 오브 트루스 (Notion 03 ERD는 읽기용 사본)
src/app/                  App Router — 페이지 + Route Handlers(= 백엔드)
src/app/globals.css       디자인 토큰. 값은 프로토타입 tokens.css가 원본이다
src/components/           UI. CSS Modules 사용
src/content/              실제 노출되는 카피 (목데이터 아님)
src/lib/                  prisma 클라이언트, 시즌/CTA 로직
legacy/vite-prototype/    이식 원본. 빌드·린트·타입체크 제외
```

## 이 프로젝트의 규칙

### 1. 없는 데이터를 지어내지 않는다

이 서비스가 파는 것은 **"조작 불가능한 검증 지표"** 다. 랜딩에 허구의 실시간 순위나
미확정 상금액을 띄우면 그 주장 자체가 무너진다. 프로토타입에 있던 가짜 리더보드·티커·
상금 300만원을 뺀 이유가 이것이다. 표시하는 숫자는 DB 집계이거나 문서로 확인된 값이어야 한다.

### 2. 스키마는 코드에만 둔다

Notion 03 ERD 문서가 `prisma/schema.prisma`를 소스 오브 트루스로 명시한다.
문서와 코드를 이중 관리하지 않는다. 스키마가 바뀌면 Notion에 다시 붙여넣는다.

**시즌 종속 테이블은 예외 없이 `seasonId`를 갖는다.** 시즌2를 열었을 때 시즌1 데이터가
섞이면 리더보드와 심사가 오염되고, 나중에 되돌리기가 가장 어렵다.

### 3. 권한 판정은 서버에서만 한다

06 §5.2 — `canAccess()` 단일 함수로 구현하고 서버 컴포넌트와 Route Handler가 같은 함수를
부른다. 프론트에 판정을 흩뿌리면 미통과 팀에게 화면이 순간 노출된다.
프로토타입의 `RouteGuards.tsx`는 클라이언트 판정이라 **그대로 옮기면 안 된다.**

응답 규약: 권한 없음 **403** / 없거나 플래그 off **404** / 단계 불일치 **409 STAGE_LOCKED**

### 4. enum은 순서 비교가 안 된다

`SeasonPhase`·`EntryStage`는 순서가 있지만 Postgres/Prisma enum은 대소 비교를 보장하지 않는다.
`src/lib/season.ts`의 `PHASE_RANK` 같은 상수 맵을 쓴다. DB 필터가 필요해지면 rank 컬럼을 추가한다.

### 5. 상태축이 둘이다

`season.phase`(전체 공통, 9개)와 `entry.stage`(팀별 진행도, 8개)가 **독립적으로 움직인다.**
화면은 두 값의 **조합**으로 결정된다. `entry.status`(3개)는 stage와 직교한다 —
실격돼도 "어디까지 왔었는지"는 보존돼야 소명이 인용됐을 때 복구할 수 있다.
06 ARCHITECTURE §4가 이 부분의 정본이며 **최대 아키텍처 리스크로 식별돼 있다.**

### 6. 폭 규칙

**박스는 폭을 다 쓰고, 제한은 텍스트에만 건다.** 섹션 폭을 좁히면 좌측 기준선(섹션 머리의
번호+괘선)과 우측 끝이 둘 다 어긋난다. 읽기 폭은 `max-width: NNch`로 텍스트 요소에만 준다.

### 7. 디자인 — "AI 티" 피하기

2회차 회의 항목이다. 지키는 것:
- 카드를 남발하지 않는다. 상자는 **실제로 떠 있어야 할 때만** 쓰고 나머지는 괘선과 여백으로 나눈다
- 섹션마다 밀도를 다르게 준다 (`sectionTight` / 기본 / `sectionWide`)
- 그리드를 균등 분할하지 않는다
- 라임(`--c-lime`)은 한 화면에 한 번만 세게 쓴다. 나머지 강조는 흰색과 굵기로
- 원형 체크 불릿·글로우·중앙정렬 마무리는 쓰지 않는다

## 시즌1 라우트

```
공개    /  ·  /leaderboard  ·  /projects/:id  ·  /seasons  ·  /signin  ·  /signup
참가자  /apply  ·  /dashboard  ·  /dashboard/submissions/:stage
운영    /admin/judging  ·  /admin/metrics  ·  /admin/seasons
```

이 12개가 정본이다 (프로토타입 = Notion 「필요 페이지 정리」와 일치).
06 §5.1의 대시보드 하위 라우트 7개는 **구현된 적 없는 나중 제안**이다.
코드 에디터(`/workspaces/:id`)와 단계별 학습은 시즌1 범위 밖.

## 미해결 (건드리기 전에 확인할 것)

| 항목 | 상태 |
|---|---|
| **측정 방식** 안 A(CF 엣지 프록시) vs 안 B(검증된 전환만 수집) | 회의 확정 대상. §2·§3.1·§9.1·비용이 전부 여기에 달림 |
| **`POST /api/leads` 레이트리밋** | **미구현.** 06 §12가 IP 레이트리밋 + Turnstile 요구. KPI#1이자 지원사업 제출 수치라 **랜딩 공개 전 필수** |
| `SeasonPhase`에 사전신청 단계 | 9개 phase에 '사전신청만' 단계가 없다. 지금은 `RECRUITING` + `recruitStartAt` 비교로 우회 |
| 보증금 | 04 API에 있으나 시즌1 참가비는 무료. `featureFlags.deposit`으로 차단 중 |
| 총 상금 금액 | 미확정이라 랜딩에서 뺐다 |
| 유효 이용자 정의 · 채점식 | 09 문서 비어 있음. 리더보드 스코어링 구현 불가 |
| ~~시즌 기간 4주 vs 8주~~ | **확정(3회차 8/5) — 5주 · STAGE 1~5, 게이트 2회.** 시즌1 캘린더 9/7~10/11은 아직 "잠정"이라 `season.startAt`은 비워둔다 |

## 기획 문서

Notion에 있다. **원본은 게스트 권한이라 접근할 수 없고**, 진수연이 자기 워크스페이스로
복제해 공유한다. 복제할 때마다 페이지 ID가 바뀌므로 **옛 URL을 재사용하지 말 것.**

내용이 있는 문서는 셋뿐이다 — **03 ERD/DB · 04 API 명세 · 06 ARCHITECTURE**.
그리고 회의록 1회차 하위의 **「필요 페이지 정리」** 가 사실상의 화면정의서다.
"기존 파일 목록" 아래 문서들은 다른 프로젝트(MOA 사내 협업툴)의 잔재이니 참고하지 말 것.
