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

## 시안 대조

디자인 시안이 정본이다(`proovit_디자인시안_ver2.html`). 화면을 옮긴 뒤
「맞는 것 같다」로 끝내지 않고 **브라우저가 계산한 값을 표로 대조한다.**

**claude-in-chrome 확장을 쓰지 않는다. CDP에 직접 붙는다.**

확장은 붙어 있지 않을 때가 있고, 스크린샷만으로는 「비슷하네」로 넘어갈 여지가
남는다. CDP 직결은 시안과 구현본 양쪽 문서에서 **같은 스크립트**를 돌려
`getComputedStyle` 값을 뽑으므로 넘어갈 여지가 없다. 설치물도 없다 —
Node 24 내장 WebSocket과 이미 깔린 Chrome만 쓴다.

```
# 헤드리스 Chrome을 9222에 띄운다 (평소 프로필은 안 건드린다)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --remote-debugging-port=9222 \
  --user-data-dir="$(mktemp -d)" about:blank &

npm run dev
node scripts/design-diff/globals.mjs
```

`scripts/design-diff/cdp.mjs`가 드라이버고, `globals.mjs`가 본보기다.
새 섹션은 `globals.mjs`를 복사해서 `PROBE`만 갈아 끼운다.

Playwright는 쓰지 않는다. 되는 걸 위해 브라우저 번들 180MB를
devDependency로 남길 이유가 없다.

### 함정 넷

1. **측정을 캡처보다 먼저 한다.** `captureBeyondViewport`는 캡처하는 동안
   뷰포트를 콘텐츠 크기로 늘린다. 캡처 뒤에 재면 폭이 어긋난다.
2. **`mobile: false`로 둔다.** `mobile: true`는 `<meta name="viewport">`가
   없는 문서에서 레이아웃 뷰포트를 980px로 떨어뜨린다. 폭 기준 대조가 통째로
   무의미해지므로, 매 폭마다 `innerWidth`가 실제로 그 값인지 검증한다.
3. **커스텀 속성은 브라우저가 파싱하지 않는다.** `getPropertyValue("--bg")`는
   적은 그대로를 돌려준다. 같은 색이라도 시안은 `#0A101C`, 구현본은 Lightning
   CSS가 줄인 `#e2e8f41c`로 나와 전부 가짜 불일치가 된다. 값을 실제 속성에
   한 번 통과시켜 브라우저가 정규화한 `rgb()` 형태로 바꿔 비교한다.
4. **시안은 뷰어 셸이다.** 모든 화면이 `#nav`(264px) + `#topbar`(52px) +
   `.state-bar`(41px)에 감싸여 있다. 절대 좌표를 직접 비교하지 말고
   컨테이너 기준 상대 위치로 본다.

### 시안 CSS를 읽을 때

`proovit_디자인시안_ver2.html`의 CSS는 v0.1부터 v2.1까지의 패스가 **누적
오버라이드**로 쌓여 있다. 같은 셀렉터가 최대 다섯 겹까지 덮인다.

```
.hb-h1 font-size:  23px(v0.3) → 24px(v0.4) → 25px(v1.8) → 26px(v2.0)
--muted:           #8A93A6 → #9AA4BA → #9AA6BE → #A7B1C6
```

**항상 마지막 승자를 쓴다.** 파일에서 처음 만난 값을 옮기면 틀린다.

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

스크럼은 **짧게** 쓴다. 체크박스 한 줄이 곧 그날 한 일이므로 「진행상황」 같은
제목을 따로 두지 않는다.

상세한 작업 내용은 스크럼이 아니라 **「작업」 DB**에 쓴다. 구분이 「개발」인 문서
중 해당하는 것을 찾아 거기에 적고, 없으면 새 작업 문서를 만든다. 그리고 그 문서
링크를 스크럼의 해당 줄에 건다.

  작업 DB — https://app.notion.com/p/3a50b98b5c2e806495fae264f8107134

**막힌 것과 남에게 거는 요청은 링크 뒤에 숨기지 않고 본문에 그대로** 둔다.
(8/12 결정)

단 「막힌 것」에는 **다른 사람의 손이 필요한 것만** 쓴다. 혼자 이어서 하면 되는
남은 일은 여기 올리지 않는다 — 해당 작업 문서의 「남은 것」에 적는다. 모두가 매일
읽는 자리라, 답할 사람이 없는 항목이 섞이면 진짜 요청이 묻힌다.

「결정된 것」에는 **팀 전체가 알아야 할 것만** 쓴다. 개발 안에서만 의미가 있는
것(함수 시그니처 수정, 쿼리 최적화, 스크립트 추가 같은 것)은 개인 섹션에 남기고
여기 올리지 않는다. 이 칸은 다른 사람의 판단이 바뀌는 결정만 담는다.
