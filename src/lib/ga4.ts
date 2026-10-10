import { createSign } from "node:crypto";

/*
  GA4 Data API — 앱 쪽 최소 클라이언트. scripts/ga4/api.mjs를 그대로 옮겼다
  (토큰 발급 한 번, runReport 한 번, 의존성 0). 그쪽 머리 주석이 이유다.

  지금 읽는 것은 하나뿐이다 — **랜딩 방문자 수**. 운영자 헤더 A1(모집 전)이
  그 수를 그대로 보이고, 「전환율 = 사전 신청 리드 ÷ 랜딩 방문자」의 분모로도
  쓴다. 분자는 DB `leads`에 있고 분모는 GA4에만 있어서, 이 파일이 없으면
  방문자·전환율 자리를 비워야 한다.

  ⚠️ 헤더가 부르는 함수는 **절대 던지지 않는다.** 자격이 없거나(로컬·프리뷰)
  API가 막히면 null을 돌려주고 헤더는 방문자·전환율 조각을 안 그린다. 운영
  콘솔이 GA4 장애로 같이 죽으면 안 된다.

  ⚠️ 요청마다 API를 부르지 않는다. 헤더는 /admin 아래 모든 요청에서 그려지고
  Data API에는 시간당 할당량이 있다. 답을 1시간 들고 있는다 — 전환율은
  운영자가 매분 볼 숫자가 아니다.

  자격은 scripts/ga4와 같은 두 값이다(.env.example 「애널리틱스」).
    GA4_PROPERTY_ID  숫자 속성 ID(측정 ID G-…가 아니다)
    GA4_SA_KEY       서비스 계정 JSON(그대로 또는 base64)
*/

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const TTL_MS = 60 * 60 * 1000;

const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** 자격이 둘 다 있는가. 없으면 헤더는 전환율을 비운다 */
export function ga4Enabled(): boolean {
  return Boolean(process.env.GA4_PROPERTY_ID && process.env.GA4_SA_KEY);
}

function credentials(): { client_email: string; private_key: string } {
  const raw = process.env.GA4_SA_KEY ?? "";
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const key = JSON.parse(text) as { client_email?: string; private_key?: string };
  if (!key.client_email || !key.private_key) throw new Error("GA4_SA_KEY에 client_email/private_key가 없다");
  return { client_email: key.client_email, private_key: key.private_key };
}

function propertyId(): string {
  const id = process.env.GA4_PROPERTY_ID ?? "";
  /* 측정 ID(G-…)를 넣으면 403이 떠서 권한 문제로 오진하기 쉽다. 먼저 막는다 */
  if (!/^\d+$/.test(id)) throw new Error(`GA4_PROPERTY_ID가 숫자가 아니다: ${id}`);
  return id;
}

let token: { value: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (token && token.exp - 60 > now) return token.value;

  const key = credentials();
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: key.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(key.private_key))}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const body = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !body.access_token) throw new Error(`토큰 발급 실패 ${res.status}: ${body.error_description ?? ""}`);
  token = { value: body.access_token, exp: now + (body.expires_in ?? 3600) };
  return body.access_token;
}

type Report = { rows?: { metricValues: { value: string }[] }[]; error?: { message?: string } };

async function runReport(request: unknown): Promise<Report> {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId()}:runReport`, {
    method: "POST",
    headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const body = (await res.json()) as Report;
  if (!res.ok) throw new Error(`runReport 실패 ${res.status}: ${body.error?.message ?? ""}`);
  return body;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

let visitors: { key: string; value: number | null; at: number } | null = null;

/**
 * 랜딩(`/`) 순 방문자 수 — `since`부터 오늘까지의 GA4 `totalUsers`.
 *
 * 「일별 활성 사용자 합」(scripts/ga4/traffic.mjs의 머리 숫자)이 아니라 기간
 * **순 사용자**다. 저쪽은 심사 기준서가 참가팀 유효 방문자를 그렇게 고정해서
 * 그렇고, 전환율의 분모는 한 사람을 한 번만 세야 한다 — 같은 사람이 열흘
 * 들락거려도 신청은 한 번이다.
 *
 * pagePath는 쿼리스트링을 뺀 값이라 `/?preregister=1`도 `/`로 잡힌다.
 * 자격이 없거나 실패하면 null. 1시간 캐시.
 */
export async function landingVisitors(since: Date): Promise<number | null> {
  if (!ga4Enabled()) return null;
  const key = ymd(since);
  if (visitors && visitors.key === key && Date.now() - visitors.at < TTL_MS) return visitors.value;

  let value: number | null = null;
  try {
    const report = await runReport({
      dateRanges: [{ startDate: key, endDate: "today" }],
      metrics: [{ name: "totalUsers" }],
      dimensionFilter: { filter: { fieldName: "pagePath", stringFilter: { matchType: "EXACT", value: "/" } } },
    });
    const raw = report.rows?.[0]?.metricValues?.[0]?.value;
    value = raw === undefined ? 0 : Number(raw);
  } catch (e) {
    /* 헤더는 비운다. 이유는 서버 로그에만 남긴다 — 운영자 화면에 스택을 띄우지 않는다 */
    console.warn("[ga4] 랜딩 방문자 조회 실패:", e instanceof Error ? e.message : e);
    value = null;
  }
  visitors = { key, value, at: Date.now() };
  return value;
}
