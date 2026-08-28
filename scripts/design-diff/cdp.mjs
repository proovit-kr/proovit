/*
  Chrome DevTools Protocol 직결 드라이버. 설치물 없음 —
  Node 24 내장 WebSocket + 9222에 떠 있는 헤드리스 Chrome만 쓴다.

  용도: 시안(file://)과 구현본(localhost:3000)에서 **같은 스크립트**를 돌려
  getComputedStyle 값을 뽑아 표로 대조한다. CSS 파일끼리 비교로는 캐스케이드
  충돌(뒤에 온 규칙이 덮는 경우)을 못 잡는데, 이건 잡는다.

  함정 둘 — 넘겨받은 것이고 실제로 확인했다.
    ① captureBeyondViewport는 캡처 중 뷰포트를 콘텐츠 크기로 늘린다.
       → 반드시 **측정을 캡처보다 먼저** 한다.
    ② mobile:true는 <meta name="viewport">가 없으면 레이아웃 뷰포트를 980px로
       떨어뜨린다. 폭 기준 대조에는 mobile:false. 매 폭마다 innerWidth를 검증한다.
*/
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOST = process.env.CDP_HOST ?? "http://127.0.0.1:9222";

/** 시안 정본. 위치가 다르면 SPEC_HTML로 넘긴다 */
export const SPEC_URL =
  "file://" +
  encodeURI(
    process.env.SPEC_HTML ??
      "/Users/sy/Downloads/proovit_디자인시안_ver2.html",
  );

/** 구현본. `npm run dev`가 떠 있어야 한다 */
export const IMPL_URL = process.env.IMPL_URL ?? "http://localhost:3000";

/** 시안의 @media 경계에 맞춘 대조 폭. 시안은 1024와 760에서 갈린다 */
export const WIDTHS = [1440, 768, 390];

export function shotDir(name) {
  const dir = join(tmpdir(), "proovit-design-diff", name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function rpc(ws) {
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else {
      for (const l of listeners) l(msg);
    }
  });
  return {
    send(method, params = {}, sessionId) {
      const n = ++id;
      return new Promise((resolve, reject) => {
        pending.set(n, { resolve, reject });
        ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    },
    once(method, sessionId) {
      return new Promise((resolve) => {
        const l = (msg) => {
          if (msg.method === method && (!sessionId || msg.sessionId === sessionId)) {
            listeners.splice(listeners.indexOf(l), 1);
            resolve(msg.params);
          }
        };
        listeners.push(l);
      });
    },
  };
}

export async function withPage(fn) {
  let version;
  try {
    version = await (await fetch(`${HOST}/json/version`)).json();
  } catch {
    throw new Error(
      `${HOST}에 붙지 못했다. 헤드리스 Chrome을 먼저 띄운다:\n` +
        `  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \\\n` +
        `    --headless=new --remote-debugging-port=9222 \\\n` +
        `    --user-data-dir="$(mktemp -d)" about:blank &`,
    );
  }
  const { webSocketDebuggerUrl } = version;
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", rej, { once: true });
  });
  const cdp = rpc(ws);
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });

  const page = {
    send: (m, p) => cdp.send(m, p, sessionId),
    once: (m) => cdp.once(m, sessionId),

    async goto(url) {
      await this.send("Page.enable");
      const loaded = this.once("Page.loadEventFired");
      await this.send("Page.navigate", { url });
      await loaded;
      // 웹폰트가 붙기 전에 재면 자폭이 달라진다
      await this.eval("document.fonts.ready.then(() => 1)", true);
    },

    async resize(width, height = 900) {
      await this.send("Emulation.setDeviceMetricsOverride", {
        width, height, deviceScaleFactor: 1,
        mobile: false, // ← 함정 ②
      });
      const w = await this.eval("innerWidth");
      if (w !== width) throw new Error(`레이아웃 뷰포트가 ${width}가 아니라 ${w}다`);
    },

    async eval(expression, awaitPromise = false) {
      const { result, exceptionDetails } = await this.send("Runtime.evaluate", {
        expression, returnByValue: true, awaitPromise,
      });
      if (exceptionDetails) throw new Error(exceptionDetails.text + " " + (exceptionDetails.exception?.description ?? ""));
      return result.value;
    },

    /**
     * 시안 문서에서 **뷰어 크롬을 걷어낸다.** 반드시 resize 전에 부른다.
     *
     * 시안은 `#nav`(264px, ≤1024에서 212px) + `#topbar`(52px) + `.state-bar`(41px)
     * 안에 화면을 담은 뷰어다. 그 사이드바가 콘텐츠 폭을 먹어서, 창을 390으로
     * 맞춰도 화면이 실제로 받는 폭은 178px이 된다 — 제품에는 없는 조건이다.
     * 그대로 재면 줄바꿈·플렉스 여백이 전부 어긋난다.
     *
     * `@media`는 창 폭을 보므로 여기서 건드리지 않는다. 시안 작성자도 제품
     * 뷰포트를 기준으로 브레이크포인트를 적었다고 보는 것이 맞다.
     */
    async stripViewerShell() {
      await this.eval(`(() => {
        for (const sel of ["#nav", "#topbar", ".state-bar"]) {
          document.querySelectorAll(sel).forEach(el => { el.style.display = "none" });
        }
        /* #app은 height:100vh + overflow:hidden이고 #stage가 안에서 스크롤한다.
           문서 스크롤로 바꿔야 우리 화면과 같은 조건이 된다 */
        const app = document.getElementById("app");
        if (app) { app.style.height = "auto"; app.style.overflow = "visible" }
        const stage = document.getElementById("stage");
        if (stage) { stage.style.overflow = "visible" }
        return 1;
      })()`);
    },

    /** ⚠️ 반드시 측정을 끝낸 뒤에 부른다 (함정 ①) */
    async shot(path) {
      const { data } = await this.send("Page.captureScreenshot", {
        format: "png", captureBeyondViewport: false,
      });
      writeFileSync(path, Buffer.from(data, "base64"));
      return path;
    },
  };

  try {
    return await fn(page);
  } finally {
    await cdp.send("Target.closeTarget", { targetId });
    ws.close();
  }
}

/** 브라우저가 정규화한 값이라 표기 흔들림이 거의 없지만, 남는 것만 정리한다 */
export const norm = (v) =>
  String(v).replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();

/** 두 맵을 비교해 다른 행만 표로 찍는다. 반환값은 불일치 수 */
export function diffTable(title, spec, impl) {
  const rows = [];
  for (const k of Object.keys(spec)) {
    const s = norm(spec[k]);
    const i = k in impl ? norm(impl[k]) : "(없음)";
    if (s !== i) rows.push([k, s, i]);
  }
  console.log(`\n══════ ${title} ══════`);
  if (!rows.length) {
    console.log(`차이 없음 ✓  (${Object.keys(spec).length}개 대조)`);
    return 0;
  }
  const w = Math.max(...rows.map((r) => r[0].length));
  for (const [k, s, i] of rows) {
    console.log(`  ✗ ${k.padEnd(w)}  시안: ${s}`);
    console.log(`    ${" ".repeat(w)}  구현: ${i}`);
  }
  return rows.length;
}
