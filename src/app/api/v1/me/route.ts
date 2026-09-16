import { cookies } from "next/headers";

import { isOnboardingComplete, loadViewerState } from "@/lib/access";
import { apiOk } from "@/lib/api";
import { resolveDashboardState } from "@/lib/dashboard-state";
import { prisma } from "@/lib/prisma";

/*
  GET /api/v1/me — API 명세서 v0.2 §2.1

  **대시보드는 이 응답 하나로 렌더된다.** 프론트가 상태 판정을 다시 하지 않도록
  서버가 결론(`nextAction`·`blockedReasons`)까지 내려준다. 판정을 화면에 두면
  같은 조건이 화면마다 조금씩 달라지고, 그게 곧 "왜 나만 버튼이 없냐"가 된다.

  헤더(NavBar)도 같은 엔드포인트를 쓴다. 헤더는 `user`·`entry.status`·`unread`만 읽는다 —
  로그인한 사람이 랜딩에 올 때 쿼리가 둘 늘지만, 관전 트래픽 대부분이 비로그인이라
  아래 쿠키 단락에서 끊긴다.

  왜 서버 컴포넌트로 안 내리나 — NavBar가 붙는 유일한 화면이 랜딩인데 랜딩은
  ISR(revalidate 60)이다. 거기서 세션을 읽으면 페이지가 동적으로 바뀌어
  **관전 트래픽이 전부 DB 조회가 된다.** Next를 고른 이유가 그 페이지의 SEO였고
  ISR은 그 결정의 일부다(page.tsx 주석).

  ⚠️ 대시보드(서버 컴포넌트)는 이 API를 HTTP로 부르지 않는다. `loadViewerState()`와
  `resolveDashboardState()`를 직접 부른다 — 자기 서버에 자기가 왕복할 이유가 없다.
  **둘이 같은 두 함수를 쓰므로 결론은 언제나 같다.**

  ⚠️ 이 응답은 표시용이지 권한 판정이 아니다. 화면을 가리는 판정은 전부 서버가
  한다(CLAUDE.md §3). 클라이언트가 이 값을 위조해도 얻는 것은 자기 헤더에
  남의 이름을 그리는 것뿐이다.
*/

export async function GET() {
  /*
    익명 방문자에게 DB 조회를 시키지 않으려고 쿠키부터 본다.
    랜딩은 공개 페이지라 방문자 대부분이 비로그인인데, 그때마다 세션·사용자를
    읽으면 ISR로 아낀 것을 여기서 도로 쓴다.

    쿠키 이름이 두 개인 이유: Auth.js는 https에서 __Secure- 접두사를 붙인다.
  */
  const store = await cookies();
  const hasSession =
    store.has("authjs.session-token") ||
    store.has("__Secure-authjs.session-token");

  const body = hasSession ? await buildBody() : EMPTY_BODY;

  return apiOk(body, {
    // 사용자마다 다른 값이다. 중간 캐시에 한 사람 것이 남으면 남에게 나간다.
    headers: { "Cache-Control": "no-store, private" },
  });
}

const EMPTY_BODY = {
  user: null,
  season: null,
  team: null,
  entry: null,
  onboarding: null,
  unread: 0,
};

async function buildBody() {
  const viewer = await loadViewerState();
  if (!viewer.user) return EMPTY_BODY;

  const complete = isOnboardingComplete(viewer.onboarding);
  const dashboard = viewer.season
    ? resolveDashboardState({
        phase: viewer.season.phase,
        flags: viewer.season.flags,
        entry: viewer.entry,
        onboarding: viewer.onboarding,
        onboardingComplete: complete,
      })
    : { nextAction: null, blockedReasons: [] };

  return {
    user: {
      id: viewer.user.id,
      nickname: viewer.user.nickname,
      /* 온보딩 미완이면 헤더가 그 자리로 유도한다. 날짜 자체는 화면에 안 쓴다 */
      onboarded: viewer.user.onboarded,
      roles: viewer.user.roles,
    },
    season: viewer.season
      ? {
          slug: viewer.season.slug,
          title: viewer.season.title,
          phase: viewer.season.phase,
          featureFlags: viewer.season.flags,
        }
      : null,
    /* 명세서 예시는 `isOwner`지만 스키마 용어가 leader라 그쪽에 맞춘다 */
    team: viewer.team,
    entry: viewer.entry
      ? {
          ...viewer.entry,
          nextAction: dashboard.nextAction,
          blockedReasons: dashboard.blockedReasons,
        }
      : null,
    onboarding: { ...viewer.onboarding, complete },
    /*
      미읽음 알림 수 — 헤더 벨의 점. 참가팀이 있고 인앱 알림이 켜진 시즌에만
      센다(헤더 규칙표 「벨」). 그 외에는 벨 자체가 없어서 셀 이유가 없다.
    */
    unread:
      viewer.entry && viewer.season?.flags.notifications
        ? await prisma.notification.count({
            where: { userId: viewer.user.id, readAt: null },
          })
        : 0,
  };
}
