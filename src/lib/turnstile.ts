/**
 * Cloudflare Turnstile 검증 (서버).
 *
 * 06 §12가 `POST /api/leads`에 IP 레이트리밋 **과** Turnstile을 함께 요구한다.
 * 레이트리밋은 한 IP의 연사만 막는다. 사전신청 수는 KPI#1이자 '모두의 창업'
 * 지원서에 들어갈 수치라, 분산 IP로 흩뿌린 봇 한 번이면 숫자가 통째로 오염되고
 * 그건 되돌릴 수 없다.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** 검증 결과. 거절 사유를 나눠야 사용자에게 다른 문장을 보여줄 수 있다. */
export type TurnstileResult =
  | { ok: true; skipped: boolean }
  | { ok: false; reason: "MISSING_TOKEN" | "REJECTED" | "UNAVAILABLE" };

/**
 * 키가 설정돼 있는가.
 *
 * 키가 없으면 검증을 건너뛴다. 이건 '열어두는' 선택이 아니라 **아직 도입 전**이라는
 * 뜻이다 — 키를 넣기 전까지는 지금(=검증 없음)과 똑같이 동작해야 배포가 안전하다.
 * 키를 넣는 순간부터 아래 fail-closed 규칙이 적용된다.
 */
export function isTurnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

export async function verifyTurnstile(
  token: string | undefined,
  remoteIp: string | undefined,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true };

  if (!token) return { ok: false, reason: "MISSING_TOKEN" };

  const form = new URLSearchParams({ secret, response: token });
  // 있으면 넘긴다. Cloudflare가 토큰 발급 IP와 대조해 재사용을 잡는다.
  if (remoteIp) form.set("remoteip", remoteIp);

  let data: { success?: boolean };
  try {
    /*
      타임아웃을 거는 이유: 이 호출이 매달리면 사용자는 제출 버튼이 멈춘 화면을
      보게 되고, Vercel 함수 시간도 그대로 잡아먹는다. 5초면 충분하다.
    */
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return { ok: false, reason: "UNAVAILABLE" };
    data = (await res.json()) as { success?: boolean };
  } catch {
    return { ok: false, reason: "UNAVAILABLE" };
  }

  /*
    검증 API가 죽었을 때 통과시킬(fail-open) 것인가를 두고 고른 결과가
    UNAVAILABLE = 거절(fail-closed)이다.

    보통은 반대가 낫다 — 외부 서비스 장애로 진짜 신청자를 잃는 건 손해다.
    여기서 뒤집는 이유는 이 폼이 파는 것이 **숫자의 신뢰성**이기 때문이다.
    사전신청 수는 지원서에 들어가는 실측치고, 한 번 오염되면 "이 숫자는 진짜다"라는
    주장 자체가 무너진다. 놓친 신청자는 다시 받을 수 있지만 오염된 집계는 못 되돌린다.
    그래서 재시도 안내를 주고 막는 쪽을 택했다.
  */
  return data.success ? { ok: true, skipped: false } : { ok: false, reason: "REJECTED" };
}
