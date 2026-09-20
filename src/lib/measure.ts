/*
  측정 파이프라인의 **순수 판정**들 — 엣지(클라우드플레어 워커)와 서버가 같이 쓴다.

  ⚠️ 이 파일은 **아무것도 import하지 않는다.** 워커는 Node가 아니라 V8 아이솔레이트에서
  돌고 프리즈마도 Next도 없다. 여기에 prisma를 하나라도 끌어들이면 워커 번들이
  통째로 깨진다. 같은 이유로 테스트도 DB 없이 돈다.

  무엇을 세는지는 심사 기준서 v0.3.1 §3-4가 정한다.

    유효 방문자 = 봇·내부·중복(같은 사람 24시간 1회)·즉시 이탈을 뺀 방문
    측정 정본   = 리버스 프록시 집계(ADR-006). GA4는 참고 지표

  그중 **봇·중복**을 엣지에서 막고, 즉시 이탈(체류 10초 미만 그리고 1페이지)은
  프록시가 체류를 못 재므로 「2페이지 이상 봤는가」로 보조한다(기준서가 허용한
  보조 판정). 내부 트래픽은 팀 구성원 식별이 필요해 엣지에서 못 가른다 —
  운영자 검수와 이의 절차로 넘어간다.
*/

/** 방문자 쿠키 이름. 퍼스트파티(팀명.proovit.kr)에 심는다 */
export const VISITOR_COOKIE = "pv_v";
/** 세션 쿠키. 30분 쉬면 새 세션이다 — 무효율 검수의 분모(총 세션)가 된다 */
export const SESSION_COOKIE = "pv_s";
/** 세션이 끊기는 시간(분) */
export const SESSION_IDLE_MINUTES = 30;

/*
  크롤러 판정. 알려진 봇의 UA만 거른다 — 「모르는 것은 사람으로 센다」가 아니라
  「모르는 것은 사람으로 세고 운영자 검수에 남긴다」이다. 여기서 과하게 거르면
  참가팀의 진짜 유입이 소리 없이 사라지고, 그건 이의 절차로도 복구가 안 된다.
*/
const BOT_UA =
  /bot|crawl|spider|slurp|facebookexternalhit|embedly|quora link preview|pinterest|vkshare|w3c_validator|whatsapp|telegram|slackbot|discordbot|twitterbot|linkedinbot|applebot|petalbot|bingpreview|yandex|baidu|semrush|ahrefs|mj12|dotbot|headlesschrome|phantomjs|puppeteer|playwright|curl\/|wget\/|python-requests|go-http-client|okhttp|axios\/|node-fetch/i;

export function isBotUserAgent(userAgent: string | null): boolean {
  if (!userAgent || userAgent.trim() === "") return true;
  return BOT_UA.test(userAgent);
}

/*
  세는 요청과 안 세는 요청. 우리가 세려는 것은 **사람이 본 화면**이다.
  이미지·스크립트·폰트까지 세면 페이지뷰가 배포 방식에 따라 몇 배씩 달라진다.
*/
export function isCountableRequest(args: {
  method: string;
  accept: string | null;
  path: string;
}): boolean {
  if (args.method !== "GET") return false;
  /* 애플페이 도메인 증명 등 — 그대로 통과시키고 세지 않는다(8/11 조사 보고서) */
  if (args.path.startsWith("/.well-known/")) return false;
  if (args.path === "/favicon.ico" || args.path === "/robots.txt") return false;
  /* 문서 요청만. 브라우저는 화면 이동에 text/html을 우선으로 요구한다 */
  return (args.accept ?? "").includes("text/html");
}

/**
 * 한국 날짜(YYYY-MM-DD). 중복 제거의 하루는 **서울 기준**이다 —
 * UTC로 자르면 오전 9시 전 방문이 전날로 붙는다.
 */
export function seoulDate(at: Date): string {
  const kst = new Date(at.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/**
 * 서울 날짜의 자정(그 날짜의 UTC 0시로 적는다). `metric_daily.metric_date`가
 * date 칸이라 시각이 없고, 수집·롤업·화면이 **같은 하루**를 봐야 한다 —
 * 한쪽만 UTC로 자르면 한국 시간 오전 9시 전에는 하루가 어긋난다.
 */
export function seoulDateOnly(at: Date): Date {
  const kst = new Date(at.getTime() + 9 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()),
  );
}

/** 시간 버킷(정시). `metric_hourly`의 `bucket_at`이 이 값이다 */
export function hourBucket(at: Date): Date {
  const d = new Date(at);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

/*
  유입 채널. 기준서 T3(채널 다양성)의 입력이고, 문서가 정한 것은 둘뿐이다 —
  direct는 통째로 한 채널, 앱 내 공유는 UTM을 달아야 채널로 친다.

  그래서 판정은 **UTM이 먼저**다. 없으면 referrer의 호스트를 채널 이름으로 쓴다.
  호스트를 그대로 쓰는 것은 우리가 채널 목록을 미리 정하면 새 유입처가 전부
  「기타」로 뭉쳐 다양성 점수가 왜곡되기 때문이다.
*/
export function channelOf(args: {
  url: string;
  referrer: string | null;
  selfHost: string;
}): string {
  let utm: string | null = null;
  try {
    utm = new URL(args.url).searchParams.get("utm_source");
  } catch {
    utm = null;
  }
  if (utm && utm.trim() !== "") return normalizeChannel(utm);

  if (!args.referrer) return "direct";
  let host: string;
  try {
    host = new URL(args.referrer).host.toLowerCase();
  } catch {
    return "direct";
  }
  /* 자기 사이트 안에서의 이동은 유입이 아니다 */
  if (host === args.selfHost.toLowerCase()) return "direct";
  return normalizeChannel(host.replace(/^www\./, ""));
}

/** 채널 이름은 소문자·60자(스키마 `metric_channel_daily.channel`이 VarChar(60)) */
function normalizeChannel(raw: string): string {
  return raw.trim().toLowerCase().slice(0, 60);
}

export type VisitorCookie = {
  /** 방문자 식별자. 우리가 만든 임의 값이고 개인정보가 들어가지 않는다 */
  id: string;
  /** 마지막으로 유효 방문자로 센 한국 날짜 */
  countedOn: string | null;
};

/** `<id>.<YYYY-MM-DD>` 한 줄. 파싱 실패는 「쿠키 없음」과 같게 다룬다 */
export function parseVisitorCookie(raw: string | undefined): VisitorCookie | null {
  if (!raw) return null;
  const [id, countedOn] = raw.split(".");
  if (!id || !/^[0-9a-f-]{8,64}$/i.test(id)) return null;
  return {
    id,
    countedOn: countedOn && /^\d{4}-\d{2}-\d{2}$/.test(countedOn) ? countedOn : null,
  };
}

export function serializeVisitorCookie(cookie: VisitorCookie): string {
  return `${cookie.id}.${cookie.countedOn ?? ""}`;
}

export type SessionCookie = {
  id: string;
  /** 마지막 요청 시각(epoch ms) */
  lastAt: number;
  /** 이 세션에서 본 문서 수. 「2페이지 이상」 판정에 쓴다 */
  views: number;
};

export function parseSessionCookie(raw: string | undefined): SessionCookie | null {
  if (!raw) return null;
  const [id, lastAt, views] = raw.split(".");
  if (!id || !/^[0-9a-f-]{8,64}$/i.test(id)) return null;
  const at = Number(lastAt);
  const n = Number(views);
  if (!Number.isFinite(at) || !Number.isFinite(n)) return null;
  return { id, lastAt: at, views: n };
}

export function serializeSessionCookie(cookie: SessionCookie): string {
  return `${cookie.id}.${cookie.lastAt}.${cookie.views}`;
}

/** 무엇을 셀 것인가 — 엣지가 요청 하나를 보고 내리는 판정 전부 */
export type VisitDecision = {
  /** 이 요청을 집계에 올리는가. 봇·비문서 요청은 false */
  count: boolean;
  /** 오늘 처음 본 사람인가(유효 방문자 +1) */
  newVisitor: boolean;
  /** 새 세션인가(총 세션 +1) */
  newSession: boolean;
  /** 이 세션이 두 번째 문서를 열었는가 — 즉시 이탈이 아님의 보조 근거 */
  engaged: boolean;
  visitor: VisitorCookie;
  session: SessionCookie;
};

/**
 * 요청 하나의 판정. 쿠키 두 개와 시각만 보고 정한다 — 서버에 방문자 표를 두지
 * 않는 것이 핵심이다. 표를 두면 우리가 방문자 단위 기록을 쌓게 되고,
 * 공개 범위 안내(팀명·참가작·지표)에 없는 데이터가 생긴다.
 */
export function decideVisit(args: {
  now: Date;
  newId: () => string;
  isBot: boolean;
  countable: boolean;
  visitorRaw: string | undefined;
  sessionRaw: string | undefined;
}): VisitDecision {
  const today = seoulDate(args.now);
  const visitor = parseVisitorCookie(args.visitorRaw) ?? {
    id: args.newId(),
    countedOn: null,
  };
  const prior = parseSessionCookie(args.sessionRaw);
  const fresh =
    prior === null ||
    args.now.getTime() - prior.lastAt > SESSION_IDLE_MINUTES * 60 * 1000;
  const session: SessionCookie = fresh
    ? { id: args.newId(), lastAt: args.now.getTime(), views: 0 }
    : { ...prior, lastAt: args.now.getTime() };

  if (args.isBot || !args.countable) {
    /* 봇은 쿠키도 세션도 건드리지 않는다 — 다음 사람의 판정을 흐리지 않게 */
    return {
      count: false,
      newVisitor: false,
      newSession: false,
      engaged: false,
      visitor,
      session: prior ?? session,
    };
  }

  session.views += 1;
  const newVisitor = visitor.countedOn !== today;

  return {
    count: true,
    newVisitor,
    newSession: fresh,
    engaged: session.views >= 2,
    visitor: newVisitor ? { ...visitor, countedOn: today } : visitor,
    session,
  };
}
