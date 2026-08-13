# 배포 절차

**이 문서의 목적은 진수연이 없을 때 다른 사람이 배포할 수 있게 하는 것이다.**
WBS 5-3 「개발 1인 단절 리스크」 대응이며, 2026-08-12에 그 리스크가 실제로 한 번
실현됐다 — `main`이 origin보다 8커밋 앞서 있었고 Vercel Production에 인증 키가
하나도 없어서, 인증을 다 만들어놓고 운영에는 없는 상태였다.

---

## 1. 구성 요소와 접근 권한

| 서비스 | 용도 | 접근 |
|---|---|---|
| GitHub `proovit-kr/proovit` | 코드 | 3인 admin |
| Vercel `proovit-kr/proovit` | 빌드·배포·환경변수 | **진수연 단독** |
| Neon | PostgreSQL (운영 DB) | 3인 |
| Cloudflare Turnstile | 사전신청 폼 봇 방지 | 진수연 |
| Upstash Redis | `POST /api/leads` 레이트리밋 | 진수연 |
| Google Cloud | OAuth 클라이언트 | 진수연 |
| GA4 | 유효 방문자 계측 (심사 근거) | 진수연 |

**Vercel을 단독으로 두는 이유는 비용이다.** Pro가 멤버 seat당 월 $20라 3인이면
월 $40이 더 붙는다. 대신 **Neon은 organization member가 무제한·무과금**이라
3인을 넣는다 — 배포보다 DB 접근이 못 하면 더 곤란하기 때문이다.
코드(GitHub)와 스키마(Neon)만 있으면 최악의 경우 Vercel 프로젝트를 새로 연결해
다시 띄울 수 있다. 그 복구 경로를 열어두는 것이 이 배치의 목적이다.

---

## 2. 평상시 배포 — 코드만 바뀐 경우

```bash
git push origin main
```

끝이다. Vercel이 `main` push를 받아 자동으로 Production 빌드를 올린다.

- 빌드 명령: `prisma generate && next build`
- 리전: `sin1` (서울)
- 운영 주소: <https://proovit-neon.vercel.app>
  (별칭 `proovit-proovit-kr.vercel.app` · `proovit-git-main-proovit-kr.vercel.app`)

**push 전에 반드시 확인한다.**

```bash
git status --branch    # ahead가 남아 있으면 운영에 안 올라간 코드가 있다는 뜻이다
npm run typecheck
npm run lint
```

`ahead`를 흘려보내면 8/12과 같은 상태가 된다 — 로컬에서는 다 되는데 운영에는 없다.

---

## 3. 스키마가 바뀐 경우 — **자동이 아니다**

**빌드는 `prisma generate`만 한다. 마이그레이션은 아무도 대신 돌려주지 않는다.**
push하면 스키마도 따라간다고 생각하면 안 된다. 코드가 새 테이블을 참조하는데
DB에 그 테이블이 없으면 배포 직후 런타임에서 터진다.

순서는 **마이그레이션 먼저, push 나중**이다.

```bash
# 1) 로컬(Neon 개발 브랜치)에서 만든다
npx prisma migrate dev --name <설명>

# 2) 운영에 적용한다 — DIRECT_URL이 필요하다 (아래 3-1)
DIRECT_URL='<Neon direct 주소>' npx prisma migrate deploy

# 3) 그 다음에 코드를 올린다
git push origin main
```

`DATABASE_URL`(pooled, `-pooler` 붙은 주소)과 `DIRECT_URL`(direct)이 다르다.
런타임은 pooled를 써야 Vercel 함수가 커넥션을 고갈시키지 않고,
**마이그레이션은 pooler를 통과하지 못하므로 direct가 따로 필요하다.**

### 3-1. 운영 DB 주소는 Vercel에서 못 꺼낸다

`DATABASE_URL`과 `DIRECT_URL`은 Vercel에서 **Sensitive**로 표시돼 있어
`vercel env pull`을 하면 값 대신 `[SENSITIVE]` 문자열이 내려온다.
그대로 Prisma에 물리면 이렇게 실패한다:

```
Error: P1013: The provided database string is invalid.
The scheme is not recognized in database URL.
```

**주소는 Neon 콘솔에서 직접 받는다.** Connection Details에서 pooled/direct를
각각 복사할 수 있다.

### 3-2. 마이그레이션 상태 확인

Neon 콘솔 SQL 편집기에서:

```sql
select migration_name, finished_at from "_prisma_migrations" order by finished_at;
```

로컬 `prisma/migrations/` 디렉터리의 개수와 이름이 맞아야 한다.

### 3-3. 되돌릴 수 없다

**Prisma에는 down 마이그레이션이 없다.** 잘못 나간 스키마는 앞으로 고치는
새 마이그레이션으로만 수습한다. 그래서 **시즌 진행 중 파괴적 변경(컬럼·테이블 삭제,
타입 축소)을 금지한다** — 참가팀 데이터가 들어온 뒤에는 복구 경로가 없다.

---

## 4. 환경변수

Vercel Production에 들어 있는 것:

```
DATABASE_URL            Neon pooled           [Sensitive]
DIRECT_URL              Neon direct           [Sensitive]
AUTH_SECRET             openssl rand -base64 32
AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_GA_ID       운영에만 넣는다 — 개발 방문이 심사 집계에 섞이면 되돌릴 수 없다
NEXT_PUBLIC_TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY
UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
```

값을 바꾼 뒤에는 **재배포해야 반영된다.** 빌드 시점에 굳는 값이라
Vercel 대시보드에서 고치기만 하면 운영은 그대로다.

새 변수를 추가하면 `.env.example`에도 같이 넣는다. 그 파일이 신규 참여자가
보는 유일한 목록이다.

### 아직 비어 있는 것

| 변수 | 막고 있는 것 |
|---|---|
| `RESEND_API_KEY` | 도메인 `proovit.kr` 미확보 — Resend가 도메인 검증을 요구한다 |
| `AUTH_KAKAO_ID` / `AUTH_KAKAO_SECRET` | 카카오 비즈 앱 심사 대기 |

둘 다 **비어 있어도 배포가 깨지지 않게** 돼 있다. 값이 없으면 해당 기능을
통째로 건너뛴다(카카오는 로그인 버튼 자체가 안 나온다). 값을 넣는 순간 켜진다.

---

## 5. 롤백

```bash
npx vercel ls --prod                    # 이전 배포 목록
npx vercel rollback <이전 배포 URL>
```

**스키마는 같이 안 돌아간다**(3-3). 마이그레이션이 나간 뒤의 롤백은
코드만 되돌리는 것이라, 새 컬럼을 쓰던 코드가 사라져도 컬럼은 남는다.
그 방향은 안전하지만 반대는 아니다 — **컬럼을 지우는 마이그레이션을 먼저 돌리고
롤백하면 구 코드가 없는 컬럼을 찾는다.**

---

## 6. 배포 후 확인

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://proovit-neon.vercel.app/
curl -s https://proovit-neon.vercel.app/api/seasons/current
```

`/api/seasons/current`가 시즌 JSON을 돌려주면 **앱과 DB가 둘 다 살아 있다는 뜻**이다.
`phase`와 `featureFlags`가 의도한 값인지도 같이 본다.

`/privacy`가 404인 것은 정상이다 — 개인정보처리방침 본문이 아직 `null`이라
라우트와 링크를 함께 죽여둔 상태다(`src/content/privacy.ts` 주석 참조).
값이 채워지면 자동으로 살아난다.
