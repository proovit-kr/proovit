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
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** 리포 뿌리. scripts/design-diff/ 에서 두 칸 위다 */
export const REPO = resolve(fileURLToPath(import.meta.url), "../../..");

const HOST = process.env.CDP_HOST ?? "http://127.0.0.1:9222";

/*
  시안 정본. `design/` 안에서 **버전 숫자가 가장 큰 것**이다 — 윤서가 ver4를
  주면 그 파일을 넣는 것만으로 대상이 바뀐다.

  옛 버전으로 재려면 SPEC_HTML로 넘긴다. ver2로 맞춘 화면이 ver3에서
  어디가 어긋나는지 볼 때 쓴다.

    SPEC_HTML=design/proovit_디자인시안_ver2.html node scripts/design-diff/globals.mjs

  ⚠️ 대상이 조용히 바뀌면 안 되므로 어느 파일로 쟀는지 매번 찍는다.
*/
function resolveSpec() {
  if (process.env.SPEC_HTML) return resolve(process.env.SPEC_HTML);
  const dir = join(REPO, "design");
  const latest = readdirSync(dir)
    .filter((f) => /ver(\d+)\.html$/.test(f))
    .sort((a, b) => Number(a.match(/ver(\d+)/)[1]) - Number(b.match(/ver(\d+)/)[1]))
    .at(-1);
  if (!latest) throw new Error(`시안이 없다: ${dir}`);
  return join(dir, latest);
}

export const SPEC_PATH = resolveSpec();
console.log(`시안: ${relative(REPO, SPEC_PATH)}`);

export const SPEC_URL = "file://" + encodeURI(SPEC_PATH);

/**
 * 화면에 **보이는 글자를 전부** 긁는 표현식. `p.eval(textNodes(sel))`.
 *
 * ⚠️ 대조의 네 축 중 하나다(값·상태·글자·구조). `getComputedStyle`은 값만
 * 보므로 문구가 통째로 바뀌어도 통과한다 — 실제로 시안이 심사 기준·FAQ·
 * 히어로 배지를 갈았는데 값 대조는 0건이라고 말했다.
 *
 * `display:none`인 가지는 건너뛴다. 미디어 쿼리로 숨는 것이 있어 폭마다
 * 다시 재야 한다.
 */
export const textNodes = (sel) => `(() => {
  const root = document.querySelector(${JSON.stringify(sel)});
  if (!root) return null;
  const out = [];
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) {
        const t = c.textContent.replace(/\\s+/g, " ").trim();
        if (t) out.push(t);
      } else if (c.nodeType === 1 && getComputedStyle(c).display !== "none") {
        walk(c);
      }
    }
  };
  walk(root);
  return out;
})()`;

/**
 * 긁어 온 글자 두 벌을 견준다. 다른 것만 찍고 개수를 돌려준다.
 *
 * 시안은 한 텍스트 노드로 쓰는 문장을 우리는 값을 끼워 넣느라 쪼갠다
 * (「시즌 1, 2026.09.28 개막」 하나 vs 세 조각). 조각을 이어 붙인 것이
 * 상대 쪽에 있으면 맞는 것으로 본다 — **이을 때는 공백을 통째로 뺀다.**
 * 노드마다 trim이 걸려 공백만 있던 노드가 사라지기 때문이다.
 *
 * @param ignore 데이터가 정하는 것만 넣는다. ⚠️ 여기 넣는 순간 그 문구는
 *   영원히 대조되지 않는다 — **판단이 서지 않으면 넣지 말고 빨간 줄로 남긴다.**
 */
export function diffText(spec, impl, { ignore = [], label = "" } = {}) {
  if (!spec || !impl) {
    console.log(`  ⚠️ 글자를 긁지 못했다${label ? ` (${label})` : ""}`);
    return 1;
  }
  const glue = (arr) => arr.join("").replace(/\s+/g, "");
  const bare = (t) => t.replace(/\s+/g, "");
  const implFlat = glue(impl), specFlat = glue(spec);
  const skip = (t) => ignore.some((re) => re.test(t));
  const S = new Set(spec), I = new Set(impl);

  const onlySpec = spec.filter((t) => !I.has(t) && !implFlat.includes(bare(t)) && !skip(t));
  const onlyImpl = impl.filter((t) => !S.has(t) && !specFlat.includes(bare(t)) && !skip(t));

  if (!onlySpec.length && !onlyImpl.length) {
    console.log(`  글자 일치 ✓  (시안 ${spec.length}개 대조)`);
    return 0;
  }
  console.log("  ✗ 글자가 다르다");
  for (const t of onlySpec) console.log(`    시안에만: ${t}`);
  for (const t of onlyImpl) console.log(`    구현에만: ${t}`);
  return onlySpec.length + onlyImpl.length;
}

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
      await this.settle();
    },

    /**
     * 셀렉터가 가리키는 요소에 **:hover를 강제로 켠다.** 끄려면 인자 없이 부른다.
     *
     * ⚠️ 프로브가 구조적으로 못 보던 자리다. `getComputedStyle`은 기본 상태만
     * 돌려주므로 `:hover`·`:focus` 규칙을 빠뜨려도 대조가 0건이라고 말한다.
     * 실제로 푸터 링크의 hover를 통째로 안 옮겼는데 못 잡았다.
     *
     * 전이가 있으면 색이 도중에 잡히므로 켠 뒤 settle()을 부른다.
     */
    async hover(selector) {
      await this.send("DOM.enable");
      await this.send("CSS.enable");
      /*
        ⚠️ 순서가 중요하다. `DOM.getDocument`가 노드 맵을 새로 만들어 앞서
        받은 nodeId를 무효로 만든다 — 먼저 끄고 나서 문서를 다시 받는다.
        (반대로 하면 "Could not find node with given id"로 죽는다.)
      */
      for (const nodeId of this.hovered ?? []) {
        await this.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
      }
      this.hovered = [];
      if (!selector) return;
      const { root } = await this.send("DOM.getDocument", { depth: -1 });
      const { nodeId } = await this.send("DOM.querySelector", {
        nodeId: root.nodeId, selector,
      });
      if (!nodeId) throw new Error(`hover 대상이 없다: ${selector}`);
      await this.send("CSS.forcePseudoState", {
        nodeId, forcedPseudoClasses: ["hover"],
      });
      this.hovered = [nodeId];
      await this.settle();
    },

    /**
     * 진행 중인 전이를 끝낸다. **폭을 바꾼 직후 반드시 부른다.**
     *
     * ⚠️ 시안의 `.btn{transition:.15s}`는 속성 이름이 없어서 **전부**
     * 전이시킨다. 미디어 쿼리가 font-size나 padding을 바꾸는 요소는
     * 폭을 바꾸는 순간 0.15초 동안 값이 움직이고, 바로 재면 그 중간값이
     * 잡힌다(13px → 14.5px 사이의 13.0191px 같은 것). 값은 맞는데
     * 대조가 통째로 가짜 불일치가 된다.
     *
     * 무한 반복(blink·pul·sweep)은 끝낼 수 없으니 유한한 것만 끝낸다.
     */
    async settle() {
      await this.eval(`(() => {
        document.getAnimations().forEach(a => {
          if (a.effect?.getTiming().iterations !== Infinity) a.finish();
        });
        return 1;
      })()`);
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
/*
  ⚠️ **글꼴 스택은 「시안 것으로 시작하는가」만 본다.**

  시안의 `--mono`에는 한글 글리프를 가진 글꼴이 없어서 한글이 시스템 기본
  고정폭(윈도우=굴림)으로 떨어진다. 시안 프롬프트가 「한글에 모노스페이스를
  절대 걸지 않는다」고 정했으므로 우리는 스택 **뒤에** 한글 글꼴을 덧붙였다
  (`korean-font.mjs` 참조). 앞부분이 같으면 라틴 글자는 시안과 똑같이
  그려지고, 뒤는 시안에 없는 상황을 메우는 자리다.

  ⚠️ 앞부분이 다르면 그대로 불일치로 남는다 — 글꼴을 바꾼 것은 여전히 잡힌다.
*/
const fontOk = (key, spec, impl) =>
  /font-family|--mono|--font/.test(key) &&
  impl.startsWith(spec.replace(/,\s*(monospace|sans-serif|serif)$/, ""));

export function diffTable(title, spec, impl) {
  const rows = [];
  for (const k of Object.keys(spec)) {
    const s = norm(spec[k]);
    const i = k in impl ? norm(impl[k]) : "(없음)";
    if (s !== i && !fontOk(k, s, i)) rows.push([k, s, i]);
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
