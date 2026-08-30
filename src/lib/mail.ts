/**
 * 메일 발송 (Resend).
 *
 * 정본은 노션 「🚀 랜딩 게시용 최종본 (2026-08-31) › 사전신청 폼 문안·푸터」의
 * 구현 규칙 7·9·10이다.
 *
 *   7. 광고성 메일은 제목 앞 (광고) 표기, 발송 08:00~21:00 KST.
 *      **발송 시점에 상호·주소 기재가 필요한데 미확정이라 광고성 발송은 보류**이고,
 *      지금 보낼 수 있는 것은 오픈·모집 안내 같은 **이행 메일**뿐이다.
 *   9. 이행 메일에 할인·혜택·홍보 문구를 섞지 않는다. 섞는 순간 광고성 정보로
 *      전환되어 (광고) 표기와 수신동의 요건이 발동된다.
 *  10. 안내 메일 하단에 「사전 신청 취소(동의 철회)」 링크를 넣는다 —
 *      보유기간 「동의 철회 시까지」의 실행 수단이다.
 *
 * 그래서 이 파일은 **이행 메일만** 보낸다. 광고성 메일을 여기에 태우려면
 * 상호·주소가 확정되고 (광고) 표기·발송시간 제한이 함께 붙어야 한다.
 *
 * ## 키가 없으면 건너뛴다
 *
 * `RESEND_API_KEY`가 없으면 보내지 않고 조용히 지나간다. Turnstile과 같은
 * 방식이고 이유도 같다 — **도입 전에는 지금과 똑같이 동작해야 배포가 안전하다.**
 * 사전신청 접수는 메일이 안 나가도 성립한다. 메일 실패로 접수가 깨지면
 * KPI#1의 원천이 사라진다.
 */

import { PRIVACY_CONSENT_VERSION } from "@/content/consent";

const ENDPOINT = "https://api.resend.com/emails";

/**
 * 보내는 주소. 도메인 인증이 끝난 주소여야 Resend가 받는다.
 * 회신은 받는 자리가 필요하므로 `reply_to`를 문의 주소로 따로 준다.
 */
const FROM = process.env.RESEND_FROM ?? "PROOVIT <noreply@proovit.kr>";
const REPLY_TO = "help@proovit.kr";

/**
 * 절대 주소. 메일 안의 링크는 상대 경로일 수 없다.
 *
 * Vercel이 주는 `VERCEL_PROJECT_PRODUCTION_URL`을 먼저 본다 —
 * `VERCEL_URL`은 배포마다 바뀌는 프리뷰 주소라 메일에 넣으면 그 배포가
 * 사라지는 순간 링크가 죽는다.
 */
export function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;

  /*
    ⚠️ 마지막 수단이다. 여기까지 왔는데 실제로 메일을 보내는 중이면 받는
    사람에게 **누를 수 없는 수신거부 링크**가 나간다 — 그건 보유기간을
    「동의 철회 시까지」로 약속해 놓고 철회 수단을 안 준 것과 같다.
    조용히 지나가면 안 되므로 크게 남긴다.
  */
  if (configured()) {
    console.warn(
      "[mail] NEXT_PUBLIC_SITE_URL이 없어 메일 링크가 localhost로 나갑니다. " +
        "받는 사람은 이 링크를 열 수 없습니다.",
    );
  }
  return "http://localhost:3000";
}

export type MailResult =
  | { ok: true; skipped: boolean }
  | { ok: false; reason: "MISCONFIGURED" | "REJECTED" | "UNAVAILABLE" };

function configured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * 이행 메일 한 통. 실패해도 예외를 던지지 않는다 — 부르는 쪽의 본래 작업
 * (접수 저장)이 메일 때문에 깨지면 안 된다. 실패는 로그로 남긴다.
 */
async function send(mail: {
  to: string;
  subject: string;
  text: string;
}): Promise<MailResult> {
  if (!configured()) return { ok: true, skipped: true };

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [mail.to],
        reply_to: REPLY_TO,
        subject: mail.subject,
        text: mail.text,
      }),
    });
  } catch {
    console.error("[mail] Resend에 닿지 못했습니다.");
    return { ok: false, reason: "UNAVAILABLE" };
  }

  if (response.ok) {
    /*
      메시지 id를 남긴다. 「저 사람이 메일을 받았나」를 나중에 되짚을 수 있는
      유일한 실마리다 — Resend 대시보드에서 이 id로 배달 상태를 본다.
    */
    const { id } = (await response.json().catch(() => ({}))) as { id?: string };
    console.info(`[mail] 보냄 → ${mail.to} (${id ?? "id 없음"})`);
    return { ok: true, skipped: false };
  }

  /*
    401·403은 우리 잘못이다 — 키가 틀렸거나 도메인 인증이 안 끝났다.
    Turnstile의 MISCONFIGURED와 같은 이유로 갈라 둔다. 안 나누면 모든 메일이
    조용히 안 가고, 우리는 원인을 모른 채 「메일이 안 오네」만 듣게 된다.
  */
  const body = await response.text().catch(() => "");
  if (response.status === 401 || response.status === 403) {
    console.error(
      `[mail] Resend가 인증을 거절했습니다(${response.status}). RESEND_API_KEY와 보내는 도메인 인증을 확인하세요. ${body}`,
    );
    return { ok: false, reason: "MISCONFIGURED" };
  }
  console.error(`[mail] 발송 실패(${response.status}). ${body}`);
  return { ok: false, reason: "REJECTED" };
}

/**
 * 사전 신청 접수 확인 메일.
 *
 * ⚠️ **이행 메일이다.** 신청이 접수됐다는 사실과 그 처리에 필요한 것만 담는다.
 * 시즌 혜택·상금·크레딧 같은 말을 한 줄이라도 넣으면 광고성 정보가 되어
 * (광고) 표기와 수신동의 요건이 붙는다(구현 규칙 9).
 *
 * 하단 두 링크가 규칙 6·10이 요구하는 철회 수단이다.
 */
export async function sendLeadWelcome(params: {
  email: string;
  seasonTitle: string;
  unsubscribeUrl: string;
}): Promise<MailResult> {
  const { email, seasonTitle, unsubscribeUrl } = params;

  const text = [
    `${seasonTitle} 사전 신청이 접수됐어요.`,
    "",
    "서비스 오픈과 시즌 모집이 시작되면 이 주소로 안내를 보내드려요.",
    "그때까지 따로 하실 일은 없어요.",
    "",
    "─────────────",
    `받는 주소: ${email}`,
    `수집 항목: 이메일 주소 하나 (동의 문안 ${PRIVACY_CONSENT_VERSION})`,
    "보유 기간: 시즌1 모집 종료 후 6개월 또는 동의 철회 시까지",
    "",
    "사전 신청 취소(동의 철회)와 광고성 정보 수신거부:",
    unsubscribeUrl,
    "",
    "PROOVIT | 운영자: 이윤서 | 문의: help@proovit.kr",
  ].join("\n");

  return send({
    to: email,
    subject: `[PROOVIT] ${seasonTitle} 사전 신청이 접수됐어요`,
    text,
  });
}
