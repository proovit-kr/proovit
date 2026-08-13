import { cookies } from "next/headers";

import { getSessionUser } from "@/lib/access";
import { apiOk } from "@/lib/api";

/*
  NavBar가 로그인 상태를 그리는 데 필요한 최소값만 준다.

  왜 서버 컴포넌트로 안 내리나 — NavBar가 붙는 유일한 화면이 랜딩인데
  랜딩은 ISR(revalidate 60)이다. 거기서 세션을 읽으면 페이지가 동적으로 바뀌어
  **관전 트래픽이 전부 DB 조회가 된다.** Next를 고른 이유가 그 페이지의 SEO였고
  ISR은 그 결정의 일부다(page.tsx 주석).

  왜 /api/auth/session을 안 쓰나 — 거기엔 nickname·onboardedAt이 없다.
  어댑터의 AdapterUser 변환이 id·email·name·image·emailVerified만 남기기
  때문이다. 그 변환을 넓히면 인증 코어가 화면 사정을 알게 되므로 여기서 받는다.

  ⚠️ 이 응답은 **표시용이지 권한 판정이 아니다.** 화면을 가리는 판정은 전부
  서버(access.ts)가 한다 — CLAUDE.md §3. 클라이언트가 이 값을 위조해도
  얻는 것은 자기 헤더에 남의 이름을 그리는 것뿐이다.
*/

export async function GET() {
  /*
    익명 방문자에게 DB 조회를 시키지 않으려고 쿠키부터 본다.
    랜딩은 공개 페이지라 방문자 대부분이 비로그인인데, 그때마다 세션·사용자
    두 번을 읽으면 ISR로 아낀 것을 여기서 도로 쓴다.

    쿠키 이름이 두 개인 이유: Auth.js는 https에서 __Secure- 접두사를 붙인다.
  */
  const store = await cookies();
  const hasSession =
    store.has("authjs.session-token") ||
    store.has("__Secure-authjs.session-token");

  const body = hasSession ? await buildBody() : { user: null };

  return apiOk(body, {
    // 사용자마다 다른 값이다. 중간 캐시에 한 사람 것이 남으면 남에게 나간다.
    headers: { "Cache-Control": "no-store, private" },
  });
}

async function buildBody() {
  const user = await getSessionUser();
  if (!user) return { user: null };

  return {
    user: {
      nickname: user.nickname,
      /* 온보딩 미완이면 헤더가 그 자리로 유도한다. 날짜 자체는 화면에 안 쓴다. */
      onboarded: user.onboardedAt !== null,
    },
  };
}
