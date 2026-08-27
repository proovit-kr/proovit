<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Proovit

AI 빌드 시즌제 리그 플랫폼. AI 에이전트가 작업할 때 참고하는 프로젝트 지도다.

## 검증

개발 서버가 떠 있는 동안 `npm run build`를 돌리지 않는다.

앞에 붙은 `prisma generate`가 `src/generated/prisma` 아래를 통째로 다시 쓰는데,
개발 서버가 그 모듈들을 물고 있어서 밑에서 파일이 갈리면 Turbopack이 죽는다.
(2026-08-27에 커밋할 때마다 이걸 돌려 개발 서버를 여러 번 내렸다.)

파일을 건드리지 않는 셋으로 검증한다.

```
npm run verify   # typecheck + lint + test
```

빌드가 필요한 때는 스키마를 고쳤거나 프로덕션 렌더를 확인해야 할 때뿐이다.
그때는 개발 서버를 먼저 내린다.

## DB

CLI와 앱이 **다른 파일**을 읽는다. 이걸 모르면 운영을 dev로 착각한다.

| | 읽는 것 | 붙는 곳 |
| --- | --- | --- |
| `next dev` | `.env.development.local`이 항상 먼저 | dev |
| `prisma` CLI | `prisma.config.ts` → `dotenv/config` → `.env` | **운영** |

그래서 마이그레이션·시드는 dev를 명시적으로 실어야 한다.

```
set -a; source .env.development.local; set +a; npx prisma migrate deploy
```

(2026-08-27에 그냥 돌려 운영 DB의 기능 플래그를 켰다.)

## 세션 기록

**세션을 끝낼 때 그날 「데일리 스크럼」 문서에 그 세션에서 한 일을 적는다.**

데일리 스크럼 DB는 노션의 Proovit → 📂 하위 페이지 → 데일리 스크럼에 있고,
페이지 제목이 날짜다. 그날 페이지가 없으면 만든다.

쓰는 방식은 그 문서 맨 위 칸잡이를 따른다 — 항목은 **한 줄**로, 근거와 검증
결과는 「작업」 DB에 쓰고 여기서는 링크만 건다. 다만 **막힌 것과 남에게 거는
요청은 링크 뒤에 숨기지 않고 본문에 그대로** 둔다. (8/12 결정)

「결정된 것」에는 **팀 전체가 알아야 할 것만** 쓴다. 개발 안에서만 의미가 있는
것(함수 시그니처 수정, 쿼리 최적화, 스크립트 추가 같은 것)은 개인 섹션에 남기고
여기 올리지 않는다. 이 칸은 다른 사람의 판단이 바뀌는 결정만 담는다.
