/*
  CSP 검증 — 프로덕션 빌드를 띄워 놓고 모든 화면을 돌며 CSP 위반을 센다.

  next.config.ts의 허용 목록이 실제로 쓰는 출처를 다 담았는지는 헤더를 읽어서는
  알 수 없다. 화면이 떠서 폰트·GA·Turnstile을 실제로 불러 봐야 한다. 그래서
  각 문서에 `securitypolicyviolation` 리스너를 심고, 위반이 있으면 지시어와
  막힌 URL을 화면별로 적는다. 0건이어야 통과다.

  세 가지를 본다. 위반 수만으로는 부족해서 뒤의 둘을 더했다 — CSP가 위반을
  **안 띄우고** 화면을 깨는 길이 있기 때문이다(①의 스킴 상향이 그랬다).
    ① 스킴 상향 지시어가 개발 CSP에 섞였는지 (설정에서 직접 읽는다)
    ② 화면마다 CSS 규칙이 실제로 실렸는지
    ③ 화면마다 CSP 위반 수

  ⚠️ **프로덕션 빌드로 잰다.** dev 서버는 HMR·리프레시 스크립트를 더 넣어서
  운영에 없는 위반이 섞인다. 다만 `next start`는 .env(운영 DB)를 읽으므로
  DATABASE_URL을 dev로 먼저 덮어 띄운다:

    npx next build
    node --env-file=.env.development.local node_modules/.bin/next start &
    node scripts/design-diff/csp.mjs

  로그인 뒤 화면은 csp-session.mts가 dev DB에 만든 세션 쿠키로 연다.
  DevBar는 프로덕션 빌드에서 안 뜨기 때문에 쿠키를 직접 심는다.
*/
import { spawnSync } from "node:child_process";
import { withPage, IMPL_URL, REPO } from "./cdp.mjs";

/*
  ① 스킴을 올리는 지시어가 개발 CSP에 섞이지 않았는지 본다.

  `upgrade-insecure-requests`는 문서 안의 http 요청을 https로 바꿔 받게 한다.
  운영은 HTTPS라 할 일이 없지만 **개발 서버는 http로 뜨고 TLS가 없다.**
  사파리는 이 지시어를 localhost에도 적용해서 `/_next/*.css`를 https로
  올려 받으려다 전부 실패한다 — 스타일이 통째로 빠진 화면이 된다.

  아래 화면 순회로는 이걸 못 잡는다. 두 가지가 겹친다.
    · 크롬은 localhost를 예외로 둬서 증상 자체가 안 나온다.
    · 스킴 상향은 `securitypolicyviolation`을 **안 띄운다.** 조용히 URL만 바꾼다.
  그래서 브라우저에 기대지 않고, 설정에서 두 환경의 CSP를 직접 뽑아 비교한다.
*/
const CSP_PROBE = `
  const m = await import(process.cwd() + "/next.config.ts");
  /* tsx로 읽으면 default가 한 겹 더 감싸진다 */
  const cfg = typeof m.default?.headers === "function" ? m.default : m.default?.default;
  const hs = await cfg.headers();
  console.log(hs.flatMap((x) => x.headers).find((x) => x.key === "Content-Security-Policy")?.value ?? "");
`;

const cspOf = (env) => {
  const r = spawnSync("node", ["--import", "tsx", "--input-type=module", "-e", CSP_PROBE], {
    cwd: REPO,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: env },
  });
  if (r.status !== 0) throw new Error(`${env} CSP를 못 읽었다:\n${r.stderr}`);
  return r.stdout.trim().split("\n").at(-1);
};

const UPGRADE = "upgrade-insecure-requests";
const schemeBad = [];
if (cspOf("development").includes(UPGRADE))
  schemeBad.push(`개발 CSP에 ${UPGRADE}가 있다 — 사파리에서 개발 서버의 CSS가 통째로 빠진다`);
if (!cspOf("production").includes(UPGRADE)) schemeBad.push(`운영 CSP에 ${UPGRADE}가 없다`);
for (const m of schemeBad) console.log(`  ✗ ${m}`);
if (!schemeBad.length) console.log("  ✓ 스킴 상향: 개발 없음 / 운영 있음");

const mk = spawnSync(
  "node",
  ["--env-file=.env.development.local", "--import", "tsx", "scripts/design-diff/csp-session.mts"],
  { cwd: REPO, encoding: "utf8" },
);
if (mk.status !== 0) throw new Error(`세션을 못 만들었다:\n${mk.stderr}`);
const { leader, admin, entryId, seasonSlug } = JSON.parse(mk.stdout.trim().split("\n").at(-1));

/* [화면, 경로, 누구로] — 순서대로 돈다. 쿠키는 역할이 바뀔 때만 갈아 끼운다 */
const PAGES = [
  ["랜딩", "/", null],
  ["로그인", "/login", null],
  ["회원가입", "/signup", null],
  ["규칙", "/rules", null],
  ["개인정보처리방침", "/privacy", null],
  ["이용약관", "/terms", null],
  ["수신거부", "/unsubscribe", null],
  ["시즌", `/seasons/${seasonSlug}`, null],
  ["리더보드", `/seasons/${seasonSlug}/leaderboard`, null],
  ["참가작 상세", `/projects/${entryId}`, null],
  ["참가신청", "/apply", "leader"],
  ["대시보드", "/dashboard", "leader"],
  ["이의신청", "/dashboard/appeal", "leader"],
  ["크레딧", "/dashboard/credits", "leader"],
  ["심사 결과", "/dashboard/judgments", "leader"],
  ["측정", "/dashboard/measurement", "leader"],
  ["내 지표", "/dashboard/metrics", "leader"],
  ["보증금", "/dashboard/payment", "leader"],
  ["제출", "/dashboard/submit/s1", "leader"],
  ["팀", "/dashboard/team", "leader"],
  ["설정", "/settings", "leader"],
  ["알림", "/notifications", "leader"],
  ["운영 홈", "/admin", "admin"],
  ["운영 어뷰징", "/admin/abuse", "admin"],
  ["운영 감사 로그", "/admin/audit-logs", "admin"],
  ["운영 시상", "/admin/awards", "admin"],
  ["운영 참가작", "/admin/entries", "admin"],
  ["운영 심사", "/admin/judging", "admin"],
  ["운영 리드", "/admin/leads", "admin"],
  ["운영 지표", "/admin/metrics", "admin"],
  ["운영 알림", "/admin/notifications", "admin"],
  ["운영 시즌", "/admin/seasons", "admin"],
  ["운영 스폰서", "/admin/sponsors", "admin"],
];

const HOOK = `
  window.__csp = [];
  document.addEventListener("securitypolicyviolation", (e) => {
    window.__csp.push({
      directive: e.effectiveDirective || e.violatedDirective,
      blocked: e.blockedURI,
      at: e.sourceFile ? e.sourceFile + ":" + e.lineNumber : "",
    });
  });
`;

const host = new URL(IMPL_URL).hostname;
const tokens = { leader, admin };

await withPage(async (p) => {
  await p.send("Network.enable");
  await p.send("Runtime.enable");
  await p.send("Page.enable");
  await p.send("Page.addScriptToEvaluateOnNewDocument", { source: HOOK });

  /*
    위반 0건은 「허용 목록이 충분하다」는 뜻이지 「GA·Turnstile이 실제로
    실렸다」는 뜻이 아니다. 빌드에 NEXT_PUBLIC_GA_ID·NEXT_PUBLIC_TURNSTILE_SITE_KEY가
    없으면 둘 다 안 그려져서 검사가 통째로 비게 된다. 그래서 화면마다 실제로
    요청이 나간 외부 호스트를 같이 적는다 — 폰트 두 곳만 보이면 그 빌드는 못 믿는다.

    채우는 법은 .env.example의 애널리틱스 항목에 있다. 요약하면 두 키를
    `.env.production.local`에 두고, GA는 **가짜 측정 ID**를 쓴다 — 진짜를 쓰면
    이 검사가 여는 33개 화면이 운영 GA4에 페이지뷰로 쌓인다.
  */
  let hosts = new Set();
  p.on("Network.requestWillBeSent", ({ request }) => {
    const h = new URL(request.url).host; // data: URL은 host가 비어 있다
    if (h && h !== new URL(IMPL_URL).host) hosts.add(h);
  });

  await p.send("Log.enable");

  /* 한 화면에 CSP 헤더가 실제로 왔는지도 같이 본다 */
  const headerOf = async () => {
    const r = await p.eval(
      `fetch(location.href, { method: "HEAD" }).then(r => r.headers.get("content-security-policy") ?? "")`,
      true,
    );
    return r;
  };

  let role = undefined;
  const rows = [];
  const noCss = [];
  let total = 0;

  for (const [name, path, who] of PAGES) {
    if (who !== role) {
      await p.send("Network.clearBrowserCookies");
      if (who) {
        await p.send("Network.setCookie", {
          name: "authjs.session-token", value: tokens[who], domain: host, path: "/",
        });
      }
      role = who;
    }

    hosts = new Set();
    await p.goto(IMPL_URL + path);
    await p.resize(1440);
    /* GA·Turnstile은 하이드레이션 뒤에 붙는다. 잠깐 기다리고 끝까지 스크롤한다 */
    await p.eval("new Promise(r => setTimeout(r, 1500))", true);
    await p.eval("window.scrollTo(0, document.body.scrollHeight)");
    await p.eval("new Promise(r => setTimeout(r, 800))", true);

    /*
      ② 화면이 실제로 스타일을 입었는지 본다.

      위반 0건은 「막힌 게 없다」는 뜻이지 「화면이 멀쩡하다」는 뜻이 아니다.
      ①처럼 위반을 안 띄우고 자원만 조용히 사라지는 길이 있어서, 규칙 수가
      0이면 CSS가 통째로 빠진 것으로 보고 떨어뜨린다.
      (교차 출처 시트는 cssRules를 못 읽으니 0으로 친다 — 우리 CSS는 같은 출처다)
    */
    const rules = Number(
      await p.eval(`[...document.styleSheets].reduce((n, s) => {
        try { return n + s.cssRules.length } catch (e) { return n }
      }, 0)`),
    );

    const finalPath = await p.eval("location.pathname + location.search");
    const hits = await p.eval("JSON.stringify(window.__csp)");
    const list = JSON.parse(hits);
    const header = await headerOf();
    total += list.length;
    rows.push({
      화면: name,
      경로: finalPath === path ? path : `${path} → ${finalPath}`,
      위반: list.length,
      CSS규칙: rules,
      CSP: header ? "있음" : "없음",
      외부호스트: [...hosts].sort().join(" "),
    });
    if (rules === 0) {
      noCss.push(name);
      console.log(`  ✗ ${name}: CSS 규칙 0개 — 스타일이 통째로 안 실렸다`);
    }
    for (const v of list) {
      console.log(`  ✗ ${name}: ${v.directive} ← ${v.blocked} ${v.at}`);
    }
  }

  console.table(rows);
  console.log(total === 0 ? "CSP 위반 0건" : `CSP 위반 ${total}건`);
  if (noCss.length) console.log(`스타일이 빠진 화면 ${noCss.length}개: ${noCss.join(", ")}`);
  if (schemeBad.length) console.log(`스킴 상향 문제 ${schemeBad.length}건`);
  process.exitCode = total === 0 && noCss.length === 0 && schemeBad.length === 0 ? 0 : 1;
});
