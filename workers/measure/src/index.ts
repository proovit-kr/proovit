import {
  SESSION_COOKIE,
  VISITOR_COOKIE,
  channelOf,
  decideVisit,
  isBotUserAgent,
  isCountableRequest,
  serializeSessionCookie,
  serializeVisitorCookie,
} from "../../../src/lib/measure";

/*
  측정 리버스 프록시 — ADR-006.

  참가작은 `팀명.proovit.kr`로만 공개되고, 모든 요청이 이 워커를 지난다.
  그래서 참가자가 점수에 쓰이는 숫자를 만질 수 없다. 이것이 GA4 자기신고 대신
  프록시를 고른 유일한 이유다(8/11 조사 보고서).

  ══════════════════════════════════════════════════════════
  하는 일 넷
  ══════════════════════════════════════════════════════════
   ① 오리진으로 요청을 넘기고 응답을 그대로 돌려준다
   ② 퍼스트파티 쿠키 둘(방문자·세션)을 심는다 — 24시간 중복 제거의 근거
   ③ 봇과 비문서 요청을 세지 않는다
   ④ 센 것만 모아 우리 API로 보낸다

  ⚠️ **본문을 건드리지 않는다.** 참가작 HTML에 스크립트를 끼워 넣으면 그 순간
  우리가 남의 페이지를 고치는 것이 되고, 결제 스크립트와 충돌할 때 책임이
  우리에게 온다. 재는 것은 요청뿐이다.

  ⚠️ `content-encoding`·`content-length`를 지운다. `fetch()`가 본문을 이미
  풀어 주는데 헤더를 그대로 베끼면 화면이 통째로 깨진다(8/11 조사 보고서의
  구현 함정 1건).

  ⚠️ **O2O 함정.** 우리 zone에서 참가팀 Pages로 CNAME하면 워커 route가 아예
  안 걸린다(workers-sdk #11270). 그래서 오리진은 DNS가 아니라 **이 워커가
  fetch로 직접** 가져온다. DNS 레코드는 워커가 붙을 수 있는 더미(프록시 켜짐)여야 한다.
*/

/*
  워커 런타임 타입 둘만 직접 적는다. `@cloudflare/workers-types`를 devDependency로
  들이면 리포 전체의 lib.dom과 충돌해 `Request`·`Response` 타입이 갈린다 —
  쓰는 것이 이 둘뿐이라 여기서 좁게 선언한다.
*/
type ExecutionContext = { waitUntil(promise: Promise<unknown>): void };
type ScheduledEvent = { scheduledTime: number; cron: string };

export type Env = {
  /** 우리 앱 주소. 예: https://proovit.kr */
  APP_URL: string;
  /** `/api/v1/measure/*`를 여는 열쇠 */
  MEASURE_SECRET: string;
};

type Route = { hostname: string; origin: string };

/*
  라우트 표는 아이솔레이트 안에 캐시한다. 워커는 요청마다 새로 뜨지 않으므로
  대개 이 캐시가 맞고, 새 참가팀은 늦어도 5분 뒤에 붙는다.

  ⚠️ 조회가 실패하면 **옛 표를 그대로 쓴다.** 앱이 잠깐 죽었다고 참가작이
  통째로 502가 되면, 우리 장애가 참가팀 지표의 구멍이 된다.
*/
const ROUTE_TTL_MS = 5 * 60 * 1000;
let routeCache: { at: number; routes: Map<string, string> } | null = null;

async function loadRoutes(env: Env): Promise<Map<string, string>> {
  const now = Date.now();
  if (routeCache && now - routeCache.at < ROUTE_TTL_MS) return routeCache.routes;

  try {
    const res = await fetch(`${env.APP_URL}/api/v1/measure/routes`, {
      headers: { authorization: `Bearer ${env.MEASURE_SECRET}` },
    });
    if (!res.ok) throw new Error(`routes ${res.status}`);
    const body = (await res.json()) as { data: { routes: Route[] } };
    const routes = new Map(
      body.data.routes.map((r) => [r.hostname.toLowerCase(), r.origin]),
    );
    routeCache = { at: now, routes };
    return routes;
  } catch {
    return routeCache?.routes ?? new Map();
  }
}

/*
  모아 보내기. 요청 하나마다 우리 API를 부르면 참가작이 느려 보이고(대기는
  안 하지만 같은 연결을 나눠 쓴다) API 호출 수도 그만큼 는다.

  ⚠️ **재시도하지 않는다.** 집계는 증가분으로 쌓이므로(measure-ingest.ts)
  같은 이벤트를 두 번 보내면 그만큼 부풀려진다. 못 보낸 이벤트는 버리고
  그 사실을 로그로 남긴다 — 부풀린 숫자보다 빠진 숫자가 낫다.
*/
type Visit = {
  hostname: string;
  newVisitor: boolean;
  newSession: boolean;
  engaged: boolean;
  channel: string;
  at: string;
};

const BATCH_MAX = 50;
let pending: Visit[] = [];

async function flush(env: Env, force: boolean): Promise<void> {
  if (pending.length === 0) return;
  if (!force && pending.length < BATCH_MAX) return;

  const visits = pending;
  pending = [];
  try {
    const res = await fetch(`${env.APP_URL}/api/v1/metrics/edge`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.MEASURE_SECRET}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ visits }),
    });
    if (!res.ok) console.log(`[measure] ingest ${res.status}, ${visits.length}건 버림`);
  } catch (e) {
    console.log(`[measure] ingest 실패, ${visits.length}건 버림: ${String(e)}`);
  }
}

/** 쿠키 하나 읽기. 워커에는 쿠키 파서가 없다 */
function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return undefined;
}

/*
  쿠키는 **HttpOnly**다. 참가작의 스크립트가 값을 읽거나 고칠 수 있으면
  「참가자가 만질 수 없는 숫자」가 성립하지 않는다. 400일은 브라우저가 받는
  최대치이고(그 위는 잘린다), 세션 쿠키는 브라우저를 닫으면 사라져도 된다.
*/
const VISITOR_MAX_AGE = 400 * 24 * 60 * 60;

function cookieHeader(name: string, value: string, maxAge: number | null): string {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ];
  if (maxAge !== null) parts.push(`Max-Age=${maxAge}`);
  return parts.join("; ");
}

const measureProxy = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();

    const routes = await loadRoutes(env);
    const origin = routes.get(host);
    /*
      모르는 호스트는 우리 랜딩으로 보낸다. 워커가 502를 내면 등록 전 팀의
      주소를 눌러 본 사람이 고장난 화면을 본다.
    */
    if (!origin) return Response.redirect(env.APP_URL, 302);

    const target = new URL(url.pathname + url.search, origin);
    const forwarded = new Request(target, request);
    /* 오리진이 우리 호스트로 절대 주소를 만들지 않게 실제 호스트를 그대로 준다 */
    forwarded.headers.set("x-forwarded-host", host);
    forwarded.headers.delete("cookie-measure");

    const upstream = await fetch(forwarded, { redirect: "manual" });

    const headers = new Headers(upstream.headers);
    /* 조사 보고서의 함정 — fetch가 푼 본문에 옛 인코딩 헤더를 붙이면 안 된다 */
    headers.delete("content-encoding");
    headers.delete("content-length");

    /*
      오리진이 만든 302의 Location을 우리 호스트로 되돌린다(결제·로그인 콜백).
      하드코딩된 절대 주소는 애초에 워커를 안 거치므로 손댈 수 없다 — 그건
      등록 화면의 검증 요건으로 막는다.
    */
    const location = headers.get("location");
    if (location) {
      try {
        const loc = new URL(location, target);
        if (loc.host === new URL(origin).host) {
          loc.protocol = "https:";
          loc.host = host;
          /* ⚠️ host만 바꾸면 오리진의 포트가 남는다(URL 규칙). 따로 지운다 */
          loc.port = "";
          headers.set("location", loc.toString());
        }
      } catch {
        /* 상대 주소는 그대로 둔다 */
      }
    }

    const now = new Date();
    const decision = decideVisit({
      now,
      newId: () => crypto.randomUUID(),
      isBot: isBotUserAgent(request.headers.get("user-agent")),
      countable: isCountableRequest({
        method: request.method,
        accept: request.headers.get("accept"),
        path: url.pathname,
      }),
      visitorRaw: readCookie(request.headers.get("cookie"), VISITOR_COOKIE),
      sessionRaw: readCookie(request.headers.get("cookie"), SESSION_COOKIE),
    });

    if (decision.count) {
      headers.append(
        "set-cookie",
        cookieHeader(
          VISITOR_COOKIE,
          serializeVisitorCookie(decision.visitor),
          VISITOR_MAX_AGE,
        ),
      );
      headers.append(
        "set-cookie",
        cookieHeader(
          SESSION_COOKIE,
          serializeSessionCookie(decision.session),
          null,
        ),
      );

      pending.push({
        hostname: host,
        newVisitor: decision.newVisitor,
        newSession: decision.newSession,
        engaged: decision.engaged,
        channel: channelOf({
          url: request.url,
          referrer: request.headers.get("referer"),
          selfHost: host,
        }),
        at: now.toISOString(),
      });
      /* 응답을 붙잡지 않는다 — 참가작의 첫 바이트가 우리 API를 기다리면 안 된다 */
      ctx.waitUntil(flush(env, false));
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  },

  /*
    5분마다 남은 것을 비운다. 조용한 참가작은 BATCH_MAX가 영영 안 차서,
    이 타이머가 없으면 마지막 몇 건이 다음 방문까지 안 올라간다.
  */
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(flush(env, true));
  },
};

export default measureProxy;
