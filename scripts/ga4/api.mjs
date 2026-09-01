/*
  GA4 Data API 최소 클라이언트 — 의존성 0.

  라이브러리(@google-analytics/data)를 쓰지 않는 이유는 design-diff가
  Playwright를 물리친 것과 같다. 우리가 필요한 건 토큰 발급 한 번과
  runReport 한 번이고, 그 둘은 Node 24의 crypto·fetch로 끝난다.
  gRPC 스택을 devDependency로 남길 이유가 없다.

  자격은 서비스 계정 하나로 받는다. 사람 OAuth를 쓰지 않는 이유:
  리프레시 토큰이 만료되면 스크립트가 조용히 죽고, 그때 누가 브라우저를
  열어야 하는지가 애매해진다. 서비스 계정은 만료가 없다.
*/

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/*
  키는 .env.local에 통째로 넣는다(.gitignore가 `.env*`를 이미 막는다).
  JSON을 파일로 떨구면 gitignore 규칙을 새로 만들어야 하고, 그 규칙을
  누군가 지우는 날 키가 커밋된다. 파일을 안 만드는 쪽이 안전하다.

  줄바꿈이 든 JSON을 .env에 한 줄로 넣기 어려우므로 base64도 받는다.
*/
function credentials() {
  const raw = process.env.GA4_SA_KEY;
  if (!raw) throw new Error("GA4_SA_KEY 없음 — .env.local에 서비스 계정 JSON을 넣어라");
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const key = JSON.parse(text);
  if (!key.client_email || !key.private_key) throw new Error("GA4_SA_KEY에 client_email/private_key가 없다");
  return key;
}

export function propertyId() {
  const id = process.env.GA4_PROPERTY_ID;
  if (!id) throw new Error("GA4_PROPERTY_ID 없음 — 측정 ID(G-…)가 아니라 숫자 속성 ID다");
  /*
    ⚠️ 측정 ID(G-XXXXXXX)와 속성 ID(숫자)는 다르다. Data API는 숫자만 받고,
    G-를 넣으면 403이 떠서 권한 문제로 오진하기 쉽다. 여기서 먼저 막는다.
  */
  if (!/^\d+$/.test(id)) throw new Error(`GA4_PROPERTY_ID가 숫자가 아니다: ${id} — G-로 시작하면 측정 ID다`);
  return id;
}

async function accessToken() {
  const key = credentials();
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: key.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const { createSign } = await import("node:crypto");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(key.private_key))}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`토큰 발급 실패 ${res.status}: ${body.error_description ?? JSON.stringify(body)}`);
  return body.access_token;
}

export async function runReport(request) {
  const token = await accessToken();
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId()}:runReport`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  const body = await res.json();
  if (!res.ok) {
    /*
      403은 십중팔구 권한이다 — 서비스 계정을 GA4 속성에 뷰어로 넣지 않았거나,
      Cloud 프로젝트에서 Analytics Data API를 켜지 않았거나 둘 중 하나다.
      메시지가 그 둘을 구분해 주지 않으므로 여기서 둘 다 짚어 준다.
    */
    const hint =
      res.status === 403
        ? "\n  → GA4 속성 액세스 관리에 서비스 계정 이메일을 뷰어로 넣었는지,\n    Cloud 프로젝트에서 Analytics Data API를 켰는지 둘 다 확인해라."
        : "";
    throw new Error(`runReport 실패 ${res.status}: ${body.error?.message ?? JSON.stringify(body)}${hint}`);
  }
  return body;
}

/* runReport 응답을 [{dim…, metric…}] 배열로 편다 */
export function rows(report) {
  const dims = (report.dimensionHeaders ?? []).map((h) => h.name);
  const mets = (report.metricHeaders ?? []).map((h) => h.name);
  return (report.rows ?? []).map((r) => {
    const o = {};
    dims.forEach((d, i) => (o[d] = r.dimensionValues[i].value));
    mets.forEach((m, i) => (o[m] = Number(r.metricValues[i].value)));
    return o;
  });
}

export function table(title, rowsIn, cols) {
  console.log(`\n══════ ${title} ══════`);
  if (!rowsIn.length) return console.log("데이터 없음");
  const w = cols.map((c) => Math.max(c.label.length, ...rowsIn.map((r) => String(r[c.key] ?? "").length)));
  const line = (cells) => cells.map((c, i) => (cols[i].right ? String(c).padStart(w[i]) : String(c).padEnd(w[i]))).join("  ");
  console.log(line(cols.map((c) => c.label)));
  console.log(w.map((n) => "─".repeat(n)).join("  "));
  for (const r of rowsIn) console.log(line(cols.map((c) => r[c.key] ?? "")));
}
