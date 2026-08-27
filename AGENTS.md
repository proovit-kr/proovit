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
