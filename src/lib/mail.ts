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
 *
 * ## 테스트만 막는다
 *
 * 개발 서버에서도 **진짜로 나간다**(2026-09-21 수연 지시 — 도달을 봐야 한다).
 * `.env.development.local`에 키가 들어 있으므로 폼을 누르면 그대로 발송이다.
 *
 * ⚠️ 그래서 **팀원 초대 이메일 칸에 아무 주소나 넣지 않는다.** 남의 주소로
 * 나가면 되돌릴 수 없다. 로컬 시험에는 내가 받을 수 있는 주소만 쓴다.
 * 끄고 싶은 날은 `MAIL_LIVE=0 npm run dev`.
 *
 * 테스트(`NODE_ENV=test`)만은 무엇을 켜도 막는다. 목을 빠뜨린 테스트가 진짜
 * 메일을 쏘는 길을 남기지 않기 위해서다.
 */

import { deadlineParts } from "@/lib/kst-format";
import { formatInviteCode } from "@/lib/team";

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
 * 진짜로 쏘는 환경인가(머리 주석).
 *
 * 테스트만 무조건 막는다 — 목을 빠뜨린 테스트가 진짜 메일을 쏘면 안 된다.
 * 개발은 키가 있으면 나가고, `MAIL_LIVE=0`으로만 끈다.
 */
function live(): boolean {
  if (process.env.NODE_ENV === "test") return false;
  return process.env.MAIL_LIVE !== "0";
}

/**
 * 닿을 수 없는 주소인가 — 예약 도메인(RFC 2606·6761). 시드와 개발 바의 계정이
 * 이 주소를 쓴다(`@demo.proovit.local`, `@example.com`). 개발에서도 메일이 진짜
 * 나가므로 그 팀을 판정하면 반송만 쌓이고, 반송률은 보내는 도메인의 평판이 된다.
 */
function undeliverable(to: string): boolean {
  const domain = to.slice(to.lastIndexOf("@") + 1).toLowerCase();
  return (
    /(^|\.)example\.(com|net|org)$/.test(domain) ||
    /\.(test|invalid|local|localhost|example)$/.test(domain)
  );
}

/**
 * 이행 메일 한 통. 실패해도 예외를 던지지 않는다 — 부르는 쪽의 본래 작업
 * (접수 저장)이 메일 때문에 깨지면 안 된다. 실패는 로그로 남긴다.
 */
async function send(mail: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<MailResult> {
  if (!configured()) return { ok: true, skipped: true };
  if (undeliverable(mail.to)) {
    console.info(`[mail] 받을 수 없는 주소라 보내지 않았습니다 → ${mail.to} / ${mail.subject}`);
    return { ok: true, skipped: true };
  }
  if (!live()) {
    /* 조용히 넘기지 않는다 — 「보낸 줄 알았는데 안 갔다」가 제일 나쁘다 */
    console.info(
      `[mail] 발송이 꺼져 있어 보내지 않았습니다 → ${mail.to} / ${mail.subject}` +
        " (테스트이거나 MAIL_LIVE=0)",
    );
    return { ok: true, skipped: true };
  }

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
        /*
          text와 html을 함께 보낸다. 이미지를 막아 둔 클라이언트, 스크린리더,
          스팸 필터가 모두 text를 본다 — html만 보내면 도달률이 떨어진다.
        */
        text: mail.text,
        html: mail.html,
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

/*
  ── 메일 HTML ────────────────────────────────────────────────

  ⚠️ 메일은 웹이 아니다. 여기서만 지키는 규칙 넷.

    1. **인라인 스타일만.** `<style>` 블록과 클래스는 Gmail이 지운다.
    2. **레이아웃은 표로.** flex·grid는 Outlook에서 무너진다.
    3. **웹폰트를 부르지 않는다.** 대부분 막히고, 막히면 대체 글꼴이
       제각각이라 자간이 다 어긋난다. 시스템 글꼴 목록을 쓴다.
    4. **밝은 바탕에 어두운 글씨.** 제품은 어두운 화면이지만 메일에서
       어두운 바탕은 클라이언트마다 반전·덧칠이 제각각이라 못 믿는다.

  워드마크의 체크는 라임(#c8ff3d)이 아니라 한 단계 어두운 #8fc400을 쓴다.
  밝은 바탕에서 라임은 대비가 모자라 글자가 안 읽힌다.
*/
const INK = "#12161f";
const MUTED = "#5b6472";
const LINE = "#e4e7ec";
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

/** 값 하나짜리 줄. 「받는 주소: …」처럼 이름과 값이 붙는다 */
const row = (label: string, value: string) => `
  <tr>
    <td style="padding:6px 0;font-size:13px;color:${MUTED};width:88px;vertical-align:top">${label}</td>
    <td style="padding:6px 0;font-size:13px;color:${INK};vertical-align:top">${value}</td>
  </tr>`;

function shell(inner: string): string {
  return `<!doctype html>
<html lang="ko"><body style="margin:0;padding:0;background:#f6f7f9">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9">
    <tr><td align="center" style="padding:40px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:520px;background:#ffffff;border:1px solid ${LINE};border-radius:14px">
        <tr><td style="padding:36px 32px;font-family:${FONT}">
${inner}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * 사전 신청 접수 확인 메일.
 *
 * ⚠️ **이행 메일이다.** 신청이 접수됐다는 사실과 그 처리에 필요한 것만 담는다.
 * 시즌 혜택·상금·크레딧 같은 말을 한 줄이라도 넣으면 광고성 정보가 되어
 * (광고) 표기와 수신동의 요건이 붙는다(구현 규칙 9).
 *
 * 하단 버튼이 규칙 6·10이 요구하는 철회 수단이다. **눈에 띄게 둔다** —
 * 법이 요구하는 것은 링크의 존재가 아니라 찾을 수 있음이다.
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
    "수집 항목: 이메일 주소",
    "보유 기간: 시즌1 모집 종료 후 6개월 또는 동의 철회 시까지",
    "",
    "사전 신청 취소(동의 철회)와 광고성 정보 수신거부:",
    unsubscribeUrl,
    "",
    "PROOVIT | 운영자: 이윤서 | 문의: help@proovit.kr",
  ].join("\n");

  const html = shell(`
          <div style="font-size:17px;font-weight:800;letter-spacing:.06em;color:${INK}">
            PROO<span style="color:#8fc400">✓</span>IT
          </div>

          <h1 style="margin:26px 0 0;font-size:21px;line-height:1.45;font-weight:800;color:${INK}">
            ${seasonTitle} 사전 신청이<br>접수됐어요.
          </h1>
          <p style="margin:14px 0 0;font-size:15px;line-height:1.75;color:${MUTED}">
            서비스 오픈과 시즌 모집이 시작되면 이 주소로 안내를 보내드려요.
            그때까지 따로 하실 일은 없어요.
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="margin:28px 0 0;border-top:1px solid ${LINE};border-bottom:1px solid ${LINE}">
            <tr><td style="padding:10px 0">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${row("받는 주소", email)}
                ${row("수집 항목", "이메일 주소")}
                ${row("보유 기간", "시즌1 모집 종료 후 6개월 또는 동의 철회 시까지")}
              </table>
            </td></tr>
          </table>

          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 0">
            <tr><td style="border-radius:10px;background:${INK}">
              <a href="${unsubscribeUrl}"
                 style="display:inline-block;padding:13px 22px;font-size:14px;font-weight:700;
                        color:#ffffff;text-decoration:none;border-radius:10px;border:1px solid ${INK}">
                사전 신청 취소 · 수신거부
              </a>
            </td></tr>
          </table>
          <p style="margin:12px 0 0;font-size:12px;line-height:1.7;color:${MUTED}">
            본 메일을 잘못 받으셨다면 위 버튼으로 신청을 취소하실 수 있어요.
            취소하시면 저장된 이메일 주소를 지워요.
          </p>

          <p style="margin:30px 0 0;padding-top:18px;border-top:1px solid ${LINE};
                    font-size:12px;line-height:1.8;color:${MUTED}">
            PROOVIT &nbsp;|&nbsp; 운영자: 이윤서 &nbsp;|&nbsp;
            문의: <a href="mailto:help@proovit.kr" style="color:${MUTED}">help@proovit.kr</a><br>
            <span style="color:#98a0ad">© 2026 PROOVIT</span>
          </p>`);

  return send({
    to: email,
    subject: `[PROOVIT] ${seasonTitle} 사전 신청이 접수됐어요`,
    text,
    html,
  });
}

/** 날짜를 한국 시각으로. 메일은 서버 시간대를 믿을 수 없어 못박는다. */
function kstDate(value: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(value);
}

/**
 * 마감을 한국 시각으로 — 「2026년 10월 18일 23:59」. 자정 마감은 **전날 24:00**이다
 * (제출 화면 `formatDeadline`과 같은 규칙, kst-format.ts `deadlineParts`).
 *
 * 초대 메일의 기한이 날짜만이던 때(`kstDate`)는 합류 마감이 자정(10.19 00:00)이면
 * 「10월 19일까지」가 되어 하루를 더 주는 것처럼 읽혔다(2026-09-26 리뷰 지적).
 */
function kstDeadline(value: Date): string {
  const part = deadlineParts(value);
  return `${part.year}년 ${Number(part.month)}월 ${Number(part.day)}일 ${part.time}`;
}

/**
 * 팀원 초대 메일.
 *
 * ⚠️ **이행 메일이다.** 초대받았다는 사실과 수락에 필요한 것(코드·링크·기한)만
 * 담는다. 상금·크레딧 같은 말을 한 줄이라도 넣으면 광고성 정보가 되어
 * (광고) 표기와 수신동의 요건이 붙는다(머리 주석 구현 규칙 9).
 *
 * ⚠️ 수신거부 링크를 달지 않는다. 사전신청 메일과 달리 **우리가 들고 있는
 * 명단에서 보내는 것이 아니라** 팀장이 적어 준 주소로 한 통 나가는 것이고,
 * 이 주소는 초대가 끝나면 team_invitations 행에만 남는다. 대신 「모르는
 * 초대라면 무시하면 된다」를 본문에 둔다 — 받는 사람이 할 수 있는 일이 그것뿐이다.
 *
 * ⚠️ 실패해도 던지지 않는다. 부르는 쪽(참가 접수)이 메일 때문에 깨지면 안 된다.
 */
export async function sendTeamInvite(params: {
  email: string;
  /** 초대한 사람의 닉네임. 실명은 쓰지 않는다 — 메일은 전달되면 그대로 남는다 */
  inviterNickname: string;
  teamName: string;
  ideaTitle: string;
  seasonTitle: string;
  code: string;
  /**
   * 「유효 기한」에 적는 시각 — 초대 만료와 합류 마감(s1 달력 마감) 중 이른 쪽
   * (team.ts `inviteValidUntil`). 만료만 적으면 합류가 먼저 닫혀도 메일은 더 늦은
   * 날을 말한다(2026-09-26).
   */
  validUntil: Date;
}): Promise<MailResult> {
  const { email, inviterNickname, teamName, ideaTitle, seasonTitle, code: rawCode } =
    params;
  /* 사람이 읽는 모양으로(PRV-LP-7F3K). 주소에 넣어도 normalize가 하이픈을 뗀다 */
  const code = formatInviteCode(rawCode);
  const until = kstDeadline(params.validUntil);
  const url = `${siteUrl()}/apply?invite=${encodeURIComponent(code)}`;

  const text = [
    `${inviterNickname}님이 ${seasonTitle} 참가 팀 「${teamName}」에 초대했어요.`,
    "",
    "아래 링크를 열면 초대 내용을 확인하고 합류할 수 있어요.",
    url,
    "",
    "─────────────",
    `팀명: ${teamName}`,
    `참가작: ${ideaTitle}`,
    `초대 코드: ${code}`,
    `유효 기한: ${until}까지`,
    "",
    "모르는 초대라면 아무것도 하지 않으셔도 돼요. 기한이 지나면 자동으로 만료돼요.",
    "",
    "PROOVIT | 운영자: 이윤서 | 문의: help@proovit.kr",
  ].join("\n");

  const html = shell(`
          <div style="font-size:17px;font-weight:800;letter-spacing:.06em;color:${INK}">
            PROO<span style="color:#8fc400">✓</span>IT
          </div>

          <h1 style="margin:26px 0 0;font-size:21px;line-height:1.45;font-weight:800;color:${INK}">
            ${inviterNickname}님이<br>팀에 초대했어요.
          </h1>
          <p style="margin:14px 0 0;font-size:15px;line-height:1.75;color:${MUTED}">
            ${seasonTitle}에 함께 나갈 팀원으로 초대받았어요.
            아래 버튼을 눌러 초대 내용을 확인해 주세요.
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="margin:28px 0 0;border-top:1px solid ${LINE};border-bottom:1px solid ${LINE}">
            <tr><td style="padding:10px 0">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${row("팀명", teamName)}
                ${row("참가작", ideaTitle)}
                ${row("초대 코드", code)}
                ${row("유효 기한", `${until}까지`)}
              </table>
            </td></tr>
          </table>

          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 0">
            <tr><td style="border-radius:10px;background:${INK}">
              <a href="${url}"
                 style="display:inline-block;padding:13px 22px;font-size:14px;font-weight:700;
                        color:#ffffff;text-decoration:none;border-radius:10px;border:1px solid ${INK}">
                초대 확인하고 합류하기
              </a>
            </td></tr>
          </table>
          <p style="margin:12px 0 0;font-size:12px;line-height:1.7;color:${MUTED}">
            모르는 초대라면 아무것도 하지 않으셔도 돼요. 기한이 지나면 자동으로 만료돼요.
          </p>

          <p style="margin:30px 0 0;padding-top:18px;border-top:1px solid ${LINE};
                    font-size:12px;line-height:1.8;color:${MUTED}">
            PROOVIT &nbsp;|&nbsp; 운영자: 이윤서 &nbsp;|&nbsp;
            문의: <a href="mailto:help@proovit.kr" style="color:${MUTED}">help@proovit.kr</a><br>
            <span style="color:#98a0ad">© 2026 PROOVIT</span>
          </p>`);

  return send({
    to: email,
    subject: `[PROOVIT] ${inviterNickname}님이 「${teamName}」 팀에 초대했어요`,
    text,
    html,
  });
}

/** 본문 글자를 HTML에 안전하게 싣는다 — 운영자가 적은 글이 그대로 들어간다 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 제목·본문·버튼 하나짜리 통지 메일 — 공지와 심사 결과가 이 모양이다. 본문은
 * 운영자가 적은 글일 수 있어 이스케이프한다. `note`는 버튼 밑의 작은 한 줄.
 *
 * ⚠️ 본문은 `<p>` 여는 태그에 바로 붙인다. 운영자 글의 줄바꿈을 살리려고
 * `pre-line`을 걸었는데, 들여쓰기 줄을 띄우면 그 줄바꿈도 빈 줄로 보인다.
 */
function sendBrief(params: {
  email: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  note?: string;
}): Promise<MailResult> {
  const { email, title, body, href, cta, note } = params;
  const text = [
    title,
    "",
    body,
    "",
    `${cta}: ${href}`,
    ...(note ? ["", note] : []),
    "",
    "PROOVIT | 문의: help@proovit.kr",
  ].join("\n");
  const html = shell(`
          <div style="font-size:17px;font-weight:800;letter-spacing:.06em;color:${INK}">
            PROO<span style="color:#8fc400">✓</span>IT
          </div>
          <h1 style="margin:26px 0 0;font-size:21px;line-height:1.45;font-weight:800;color:${INK}">
            ${escapeHtml(title)}
          </h1>
          <p style="margin:14px 0 0;font-size:15px;line-height:1.75;color:${MUTED};white-space:pre-line">${escapeHtml(body)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 0">
            <tr><td style="border-radius:10px;background:${INK}">
              <a href="${href}"
                 style="display:inline-block;padding:13px 22px;font-size:14px;font-weight:700;
                        color:#ffffff;text-decoration:none;border-radius:10px;border:1px solid ${INK}">
                ${cta}
              </a>
            </td></tr>
          </table>${
            note
              ? `
          <p style="margin:12px 0 0;font-size:12px;line-height:1.7;color:${MUTED}">
            ${note}
          </p>`
              : ""
          }
          <p style="margin:30px 0 0;padding-top:18px;border-top:1px solid ${LINE};
                    font-size:12px;line-height:1.8;color:${MUTED}">
            PROOVIT &nbsp;|&nbsp;
            문의: <a href="mailto:help@proovit.kr" style="color:${MUTED}">help@proovit.kr</a>
          </p>`);
  return send({ to: email, subject: `[PROOVIT] ${title}`, text, html });
}

/**
 * 운영 공지 메일 — 공지 발송 화면(시안 `#scr-adm-noti`)의 「메일」 채널.
 *
 * ⚠️ **이행 메일이다.** 공지 창구는 시즌 이행 통지 전용이라(notify-store.ts 머리
 * 주석) 여기도 그 몫만 싣는다. 참가팀 명단에 보내는 것이라 수신거부 링크 대신
 * 대시보드 알림센터 링크를 둔다 — 같은 공지가 인앱에도 남는다.
 *
 * 계정 설정의 「메일」 스위치를 보지 않는다 — 그 스위치는 심사 결과와 마감 알림만
 * 말한다(`sendAlertMails`). 일정 변경·결과 발표 같은 공지는 끈 사람에게도 가야
 * 한다(2026-09-29 수연).
 */
export async function sendNoticeMail(params: {
  email: string;
  title: string;
  body: string;
}): Promise<MailResult> {
  return sendBrief({
    ...params,
    href: `${siteUrl()}/notifications`,
    cta: "알림센터에서 보기",
  });
}

/** 심사 결과 통지 한 건 — content/notifications.ts의 `NOTI_JUDGMENT`·`NOTI_GATE_MISSED` 한 칸 */
export type AlertNotice = { title: string; body: string; linkUrl: string };

/**
 * 심사 결과·마감 알림 메일 — 계정 설정 「메일: 심사 결과와 마감 알림을 메일로
 * 받아요」(시안 `#scr-settings`)가 말하는 두 가지. 운영자 판정(judging-store)·게이트
 * 미제출 탈락(gate-miss)·마감 알림(deadline-remind)이 인앱 통지와 **같은 글**로 보낸다.
 *
 * 받는 사람은 그 스위치를 켠 팀원뿐이다. 탈퇴한 계정은 주소가 비고 스위치도
 * 꺼지므로(settings/actions.ts) 여기서 같이 빠진다.
 *
 * ⚠️ **이행 메일이다.** 판정 사실과 볼 곳만 싣는다.
 * ⚠️ 트랜잭션이 닫힌 **뒤에** 부른다. 안에서 부르면 롤백돼도 메일은 이미 나갔다.
 * 실패해도 던지지 않는다 — 판정은 인앱 통지로 이미 성립했다.
 */
export async function sendAlertMails(
  members: { email: string | null; notifyEmail: boolean }[],
  notice: AlertNotice,
): Promise<void> {
  for (const m of members) {
    if (!m.notifyEmail || !m.email) continue;
    await sendBrief({
      email: m.email,
      title: notice.title,
      body: notice.body,
      href: `${siteUrl()}${notice.linkUrl}`,
      cta: "대시보드에서 보기",
      note: "심사 결과와 마감 알림 메일은 계정 설정에서 끌 수 있어요.",
    });
  }
}

/**
 * 크레딧 발급 메일 — 스폰서 크레딧 「발급 가능 팀에 일괄 발송」(시안 `#mdl-crbatch` 「채널 이메일」).
 *
 * ⚠️ **이행 메일이다.** 참가하면서 열린 혜택을 전달하는 것이라 코드·링크·기한·적용
 * 방법만 싣는다. 새 혜택을 알리는 홍보 문구를 섞으면 광고성이 된다(머리 주석 규칙 9).
 * 같은 코드가 대시보드 「혜택과 크레딧」에도 선다.
 */
export async function sendCreditMail(params: {
  email: string;
  /** 「C1 빌더 크레딧」 */
  card: string;
  /** 카드 이름 뒤 주격 조사(「이」·「가」). 괄호가 끼면 받침을 못 읽어 부르는 쪽이 준다 */
  josa: string;
  sponsor: string | null;
  code: string | null;
  link: string | null;
  validUntil: Date | null;
  howto: string | null;
}): Promise<MailResult> {
  const { email, card, josa, sponsor, code, link, validUntil, howto } = params;
  const title = `${card}${josa} 발급됐어요`;
  const until = validUntil ? kstDate(validUntil) : null;
  const center = `${siteUrl()}/dashboard/credits`;
  const text = [
    title,
    "",
    sponsor ? `스폰서: ${sponsor}` : null,
    code ? `코드: ${code}` : null,
    link ? `링크: ${link}` : null,
    until ? `유효기간: ${until}까지` : null,
    howto ? `적용 방법: ${howto}` : null,
    "",
    `혜택과 크레딧: ${center}`,
    "",
    "PROOVIT | 문의: help@proovit.kr",
  ]
    .filter((l) => l !== null)
    .join("\n");
  const html = shell(`
          <div style="font-size:17px;font-weight:800;letter-spacing:.06em;color:${INK}">
            PROO<span style="color:#8fc400">✓</span>IT
          </div>
          <h1 style="margin:26px 0 0;font-size:21px;line-height:1.45;font-weight:800;color:${INK}">
            ${escapeHtml(title)}
          </h1>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="margin:24px 0 0;border-top:1px solid ${LINE};border-bottom:1px solid ${LINE}">
            <tr><td style="padding:10px 0">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${sponsor ? row("스폰서", escapeHtml(sponsor)) : ""}
                ${code ? row("코드", `<span style="font-family:monospace">${escapeHtml(code)}</span>`) : ""}
                ${link ? row("링크", `<a href="${escapeHtml(link)}" style="color:${INK}">${escapeHtml(link)}</a>`) : ""}
                ${until ? row("유효기간", `${until}까지`) : ""}
                ${howto ? row("적용 방법", escapeHtml(howto)) : ""}
              </table>
            </td></tr>
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 0">
            <tr><td style="border-radius:10px;background:${INK}">
              <a href="${center}"
                 style="display:inline-block;padding:13px 22px;font-size:14px;font-weight:700;
                        color:#ffffff;text-decoration:none;border-radius:10px;border:1px solid ${INK}">
                혜택과 크레딧에서 보기
              </a>
            </td></tr>
          </table>
          <p style="margin:30px 0 0;padding-top:18px;border-top:1px solid ${LINE};
                    font-size:12px;line-height:1.8;color:${MUTED}">
            PROOVIT &nbsp;|&nbsp;
            문의: <a href="mailto:help@proovit.kr" style="color:${MUTED}">help@proovit.kr</a>
          </p>`);
  return send({ to: email, subject: `[PROOVIT] ${title}`, text, html });
}

/**
 * 이메일 변경 인증 코드 — 계정 설정의 이메일 변경(lib/email-change.ts). **새 주소로**
 * 간다. 이 코드를 넣어야 주소가 바뀐다.
 *
 * ⚠️ 이행 메일이다. 코드와 기한만 싣는다. 스위치(`notifyEmail`)와 무관하다 — 본인이
 * 방금 요청한 것이다.
 */
export async function sendEmailChangeCode(params: {
  email: string;
  code: string;
  minutes: number;
}): Promise<MailResult> {
  const { email, code, minutes } = params;
  const title = "이메일 변경 인증 코드";
  const text = [
    title,
    "",
    `코드: ${code}`,
    `${minutes}분 안에 계정 설정 화면에 입력해 주세요.`,
    "",
    "요청하지 않았다면 이 메일을 무시해 주세요. 주소는 바뀌지 않아요.",
    "",
    "PROOVIT | 문의: help@proovit.kr",
  ].join("\n");
  const html = shell(`
          <div style="font-size:17px;font-weight:800;letter-spacing:.06em;color:${INK}">
            PROO<span style="color:#8fc400">✓</span>IT
          </div>
          <h1 style="margin:26px 0 0;font-size:21px;line-height:1.45;font-weight:800;color:${INK}">
            ${title}
          </h1>
          <p style="margin:14px 0 0;font-size:15px;line-height:1.75;color:${MUTED}">
            ${minutes}분 안에 계정 설정 화면에 입력해 주세요.
          </p>
          <div style="margin:24px 0 0;padding:16px 0;border-top:1px solid ${LINE};border-bottom:1px solid ${LINE};
                      font-family:monospace;font-size:30px;font-weight:700;letter-spacing:.3em;color:${INK}">
            ${code}
          </div>
          <p style="margin:14px 0 0;font-size:12px;line-height:1.7;color:${MUTED}">
            요청하지 않았다면 이 메일을 무시해 주세요. 주소는 바뀌지 않아요.
          </p>
          <p style="margin:30px 0 0;padding-top:18px;border-top:1px solid ${LINE};
                    font-size:12px;line-height:1.8;color:${MUTED}">
            PROOVIT &nbsp;|&nbsp;
            문의: <a href="mailto:help@proovit.kr" style="color:${MUTED}">help@proovit.kr</a>
          </p>`);
  return send({ to: email, subject: `[PROOVIT] ${title} ${code}`, text, html });
}
