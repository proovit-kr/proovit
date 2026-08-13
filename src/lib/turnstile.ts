/**
 * Cloudflare Turnstile 검증 (서버).
 *
 * 06 §12가 `POST /api/v1/leads`에 IP 레이트리밋 **과** Turnstile을 함께 요구한다.
 * 레이트리밋은 한 IP의 연사만 막는다. 사전신청 수는 KPI#1이자 '모두의 창업'
 * 지원서에 들어갈 수치라, 분산 IP로 흩뿌린 봇 한 번이면 숫자가 통째로 오염되고
 * 그건 되돌릴 수 없다.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * 검증 결과. 거절 사유를 나눠야 사용자에게 다른 문장을 보여줄 수 있다.
 *
 * MISCONFIGURED를 따로 두는 이유: 시크릿을 잘못 넣으면 Cloudflare는 가짜 토큰과
 * 똑같이 `success: false`를 준다. 구분하지 않으면 **모든 신청이 "사람인지 확인이
 * 필요해요"로 조용히 실패**하고, 사용자는 자기 잘못인 줄 알고 떠나며 우리는
 * 원인을 모른다. 키를 회전할 때마다 밟을 수 있는 함정이라 갈라둔다.
 */
export type TurnstileResult =
  | { ok: true; skipped: boolean }
  | {
      ok: false;
      reason: "MISSING_TOKEN" | "REJECTED" | "UNAVAILABLE" | "MISCONFIGURED";
    };

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

  let data: { success?: boolean; "error-codes"?: string[] };
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
    /*
      상태 코드로 먼저 끊지 않는다. Cloudflare는 시크릿이 틀렸을 때 **HTTP 400**에
      `{"error-codes":["invalid-input-secret"]}`를 담아 준다. 여기서 res.ok만 보고
      돌아서면 그 코드를 영영 못 읽고, 설정 오류가 "일시적 장애"로 둔갑한다.
      본문을 먼저 읽고, 읽지 못했을 때만 장애로 취급한다.
    */
    data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
  } catch {
    return { ok: false, reason: "UNAVAILABLE" };
  }

  if (data.success) return { ok: true, skipped: false };

  /*
    우리 설정이 틀린 경우와 방문자의 토큰이 틀린 경우를 가른다.
    앞의 둘은 사용자가 무엇을 해도 통과할 수 없으므로 사용자를 탓하면 안 된다.
  */
  const codes = data["error-codes"] ?? [];
  if (codes.includes("invalid-input-secret") || codes.includes("missing-input-secret")) {
    return { ok: false, reason: "MISCONFIGURED" };
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
  return { ok: false, reason: "REJECTED" };
}
