import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/*
  IP 레이트리밋 — 06 ARCHITECTURE §12

  막으려는 것은 서버 부하가 아니라 **KPI 오염**이다.
  사전신청 수는 시즌1 KPI#1이자 '모두의 창업 2기' 지원서에 들어갈 수요 검증 근거라,
  봇이 부풀린 숫자가 섞이면 그 근거 자체가 못 쓰게 된다.

  한도를 세게 잡지 않는 이유: 한국 이동통신망은 CGNAT라 수많은 이용자가 같은 공인 IP를
  공유한다. 카페·사무실도 마찬가지다. 과하게 조이면 진짜 신청자가 막혀 KPI가 반대로
  과소집계된다. 봇은 수백 건을 시도하므로 느슨한 한도로도 걸러진다.
*/
const LIMIT = 10;
const WINDOW = "10 m" as const;

function createUpstashLimiter() {
  // Upstash 콘솔이 주는 이름 그대로. Vercel 통합을 붙여도 같은 키가 주입된다.
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  return new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(LIMIT, WINDOW),
    // analytics는 요청마다 커맨드를 추가로 쓴다. 무료 플랜 한도를 아끼려 끈다.
    analytics: false,
    prefix: "proovit:rl:leads",
  });
}

/*
  Upstash가 없을 때의 폴백. 인스턴스 메모리라 서버리스에서는 인스턴스 수만큼
  한도가 곱해지고 콜드스타트마다 초기화된다. **정확한 방어가 아니다** —
  env가 빠진 채 배포돼도 엔드포인트가 무방비로 열리지 않게 하는 안전망일 뿐이다.
  운영에서는 반드시 Upstash env가 들어가 있어야 한다.
*/
const memoryHits = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;

function checkInMemory(key: string) {
  const now = Date.now();
  const recent = (memoryHits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);

  if (recent.length >= LIMIT) {
    memoryHits.set(key, recent);
    return { success: false, reset: recent[0] + WINDOW_MS };
  }

  recent.push(now);
  memoryHits.set(key, recent);

  // 오래된 키가 쌓여 메모리를 먹지 않도록 가끔 청소한다.
  if (memoryHits.size > 5000) {
    for (const [k, hits] of memoryHits) {
      if (hits.every((at) => now - at >= WINDOW_MS)) memoryHits.delete(k);
    }
  }

  return { success: true, reset: now + WINDOW_MS };
}

const upstash = createUpstashLimiter();

/*
  Next 16에는 request.ip가 없다. 프록시 헤더에서 직접 읽어야 한다.
  x-forwarded-for는 "클라이언트, 프록시1, 프록시2" 순서라 맨 앞이 원 클라이언트다.

  주의: 이 헤더는 클라이언트가 위조할 수 있다. Vercel 앞단에서 덮어써 주기 때문에
  운영에서는 신뢰할 수 있지만, 다른 곳에 셀프호스팅하게 되면 이 전제를 다시 봐야 한다.
*/
export function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export type RateLimitResult = {
  success: boolean;
  /** 429 응답의 Retry-After에 쓸 초 단위 값 */
  retryAfterSeconds: number;
};

export async function limitByIp(ip: string): Promise<RateLimitResult> {
  if (upstash) {
    try {
      const { success, reset } = await upstash.limit(ip);
      return {
        success,
        retryAfterSeconds: Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
      };
    } catch (error) {
      /*
        Upstash가 죽었을 때 신청을 막지 않는다(fail-open).
        레이트리밋이 잠깐 없는 것보다 진짜 신청자를 놓치는 쪽이 더 큰 손실이다.
      */
      console.error("[ratelimit] Upstash 호출 실패 — 통과시킨다", error);
      return { success: true, retryAfterSeconds: 0 };
    }
  }

  const { success, reset } = checkInMemory(ip);
  return {
    success,
    retryAfterSeconds: Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
  };
}
