import { describe, expect, it } from "vitest";

import {
  channelOf,
  decideVisit,
  isBotUserAgent,
  isCountableRequest,
  parseVisitorCookie,
  seoulDate,
  seoulDateOnly,
  serializeVisitorCookie,
} from "@/lib/measure";

/*
  엣지가 요청 하나를 보고 내리는 판정. 여기가 곧 「유효 방문자」의 정의라
  화면 대조보다 이 표가 먼저다(심사 기준서 §3-4).
*/

const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

describe("봇 판정", () => {
  it("알려진 크롤러와 도구를 거른다", () => {
    for (const ua of [
      "Googlebot/2.1 (+http://www.google.com/bot.html)",
      "curl/8.7.1",
      "python-requests/2.32",
      "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/140.0",
      "facebookexternalhit/1.1",
    ]) {
      expect(isBotUserAgent(ua), ua).toBe(true);
    }
  });

  it("사람의 브라우저는 통과한다", () => {
    expect(isBotUserAgent(CHROME)).toBe(false);
  });

  /* UA가 없는 요청은 사람의 브라우저가 아니다 */
  it("UA가 비면 봇으로 본다", () => {
    expect(isBotUserAgent(null)).toBe(true);
    expect(isBotUserAgent("")).toBe(true);
  });
});

describe("셀 요청 고르기", () => {
  const base = { method: "GET", accept: "text/html,*/*", path: "/" };

  it("문서 요청만 센다", () => {
    expect(isCountableRequest(base)).toBe(true);
    expect(isCountableRequest({ ...base, accept: "image/avif,image/webp" })).toBe(false);
    expect(isCountableRequest({ ...base, method: "POST" })).toBe(false);
  });

  /* 애플페이 도메인 증명 — 통과는 시키되 세지 않는다(8/11 조사 보고서) */
  it("well-known과 favicon은 세지 않는다", () => {
    expect(isCountableRequest({ ...base, path: "/.well-known/apple-developer-merchantid" })).toBe(false);
    expect(isCountableRequest({ ...base, path: "/favicon.ico" })).toBe(false);
  });
});

describe("채널", () => {
  const selfHost = "team1.proovit.kr";

  it("UTM이 먼저다", () => {
    expect(channelOf({ url: "https://team1.proovit.kr/?utm_source=Threads", referrer: "https://www.google.com/", selfHost })).toBe("threads");
  });

  it("UTM이 없으면 referrer 호스트가 채널이다", () => {
    expect(channelOf({ url: "https://team1.proovit.kr/", referrer: "https://www.google.com/search?q=x", selfHost })).toBe("google.com");
  });

  it("referrer가 없거나 자기 사이트면 direct다", () => {
    expect(channelOf({ url: "https://team1.proovit.kr/", referrer: null, selfHost })).toBe("direct");
    expect(channelOf({ url: "https://team1.proovit.kr/b", referrer: "https://team1.proovit.kr/a", selfHost })).toBe("direct");
  });
});

describe("방문 판정", () => {
  const now = new Date("2026-10-20T10:00:00+09:00");
  const opts = { now, newId: () => "11111111-1111-1111-1111-111111111111", isBot: false, countable: true };

  it("쿠키가 없으면 오늘 첫 방문이고 새 세션이다", () => {
    const d = decideVisit({ ...opts, visitorRaw: undefined, sessionRaw: undefined });
    expect(d).toMatchObject({ count: true, newVisitor: true, newSession: true, engaged: false });
    expect(d.visitor.countedOn).toBe("2026-10-20");
  });

  it("같은 날 두 번째 요청은 방문자로 안 센다", () => {
    const first = decideVisit({ ...opts, visitorRaw: undefined, sessionRaw: undefined });
    const second = decideVisit({
      ...opts,
      visitorRaw: serializeVisitorCookie(first.visitor),
      sessionRaw: `${first.session.id}.${first.session.lastAt}.${first.session.views}`,
    });
    expect(second.newVisitor).toBe(false);
    expect(second.newSession).toBe(false);
    /* 두 장을 봤으니 즉시 이탈이 아니다 */
    expect(second.engaged).toBe(true);
  });

  it("날이 바뀌면 다시 센다", () => {
    const yesterday = { id: "22222222-2222-2222-2222-222222222222", countedOn: "2026-10-19" };
    const d = decideVisit({ ...opts, visitorRaw: serializeVisitorCookie(yesterday), sessionRaw: undefined });
    expect(d.newVisitor).toBe(true);
    /* 같은 사람이므로 식별자는 그대로다 */
    expect(d.visitor.id).toBe(yesterday.id);
  });

  it("30분 넘게 쉬면 새 세션이다", () => {
    const old = `33333333-3333-3333-3333-333333333333.${now.getTime() - 31 * 60 * 1000}.4`;
    expect(decideVisit({ ...opts, visitorRaw: undefined, sessionRaw: old }).newSession).toBe(true);
  });

  it("봇은 아무것도 세지 않고 세션도 안 만든다", () => {
    const d = decideVisit({ ...opts, isBot: true, visitorRaw: undefined, sessionRaw: undefined });
    expect(d).toMatchObject({ count: false, newVisitor: false, newSession: false });
  });

  it("깨진 쿠키는 없는 것과 같게 다룬다", () => {
    expect(parseVisitorCookie("깨진값")).toBeNull();
    expect(decideVisit({ ...opts, visitorRaw: "깨진값", sessionRaw: "x" }).newVisitor).toBe(true);
  });
});

describe("한국 날짜", () => {
  /* UTC로 자르면 오전 9시 전 방문이 전날로 붙는다 */
  it("자정 직후도 그날로 센다", () => {
    expect(seoulDate(new Date("2026-10-20T00:10:00+09:00"))).toBe("2026-10-20");
    expect(seoulDate(new Date("2026-10-20T23:50:00+09:00"))).toBe("2026-10-20");
  });

  /*
    하루치 표의 날짜 칸이 이 값이다. 수집·롤업·참가작 상세가 **같은 하루**를
    봐야 한다 — 한쪽만 UTC로 자르면 한국 시간 오전 9시 전에 하루가 어긋나고,
    그러면 「최근 7일」의 끝 칸이 빈다(실제로 그랬다).
  */
  it("서울 자정을 그 날짜의 UTC 0시로 적는다", () => {
    const iso = (d: Date) => d.toISOString();
    expect(iso(seoulDateOnly(new Date("2026-10-20T00:10:00+09:00")))).toBe(
      "2026-10-20T00:00:00.000Z",
    );
    /* 오전 9시 전 — UTC로는 아직 전날이지만 서울로는 같은 날이다 */
    expect(iso(seoulDateOnly(new Date("2026-10-20T08:59:00+09:00")))).toBe(
      "2026-10-20T00:00:00.000Z",
    );
    expect(iso(seoulDateOnly(new Date("2026-10-20T23:50:00+09:00")))).toBe(
      "2026-10-20T00:00:00.000Z",
    );
  });
});
