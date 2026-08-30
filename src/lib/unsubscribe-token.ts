/**
 * 수신거부·신청취소 링크의 토큰.
 *
 * 구현 규칙 6이 「토큰 방식, 로그인 없이 1회 클릭 처리」를 요구한다.
 * 사전신청자는 계정이 없으므로 세션으로 본인을 확인할 방법이 아예 없다.
 *
 * ## 왜 컬럼을 추가하지 않았나
 *
 * 리드 id에 서명을 붙여 만든다(HMAC-SHA256). DB에 토큰을 저장하면
 *   - 마이그레이션이 필요하고,
 *   - 그 값이 사실상 **비밀번호와 같은 무게**를 갖는데 평문으로 눕는다.
 * 서명 방식은 저장할 것이 없고, 시크릿을 바꾸면 발급된 링크가 한꺼번에
 * 무효가 된다(그건 의도된 성질이다 — 유출 시의 회수 수단).
 *
 * ⚠️ 만료를 넣지 않는다. 수신거부 링크가 만료되면 「철회할 수단이 없는
 * 상태」가 되고, 그건 보유기간을 「동의 철회 시까지」로 약속한 것과 어긋난다.
 * 오래된 메일에서 눌러도 동작해야 한다.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 서명 키. Auth.js가 이미 쓰는 시크릿을 함께 쓴다 — 비밀 하나를 더 늘리면
 * 회전할 때 빠뜨릴 자리가 하나 더 생긴다.
 */
function secret(): string {
  const value = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!value) {
    throw new Error(
      "AUTH_SECRET이 없어 수신거부 토큰을 만들 수 없습니다. .env를 확인하세요.",
    );
  }
  return value;
}

const sign = (leadId: string) =>
  createHmac("sha256", secret()).update(`unsubscribe:${leadId}`).digest("base64url");

export function makeUnsubscribeToken(leadId: string): string {
  return `${leadId}.${sign(leadId)}`;
}

/** 토큰이 가리키는 리드 id. 위조·변형이면 null */
export function readUnsubscribeToken(token: string | undefined): string | null {
  if (!token) return null;
  const at = token.lastIndexOf(".");
  if (at <= 0) return null;

  const leadId = token.slice(0, at);
  const given = Buffer.from(token.slice(at + 1));
  const want = Buffer.from(sign(leadId));

  /* 길이가 다르면 timingSafeEqual이 던진다. 길이 자체도 비밀이 아니므로 먼저 본다 */
  if (given.length !== want.length) return null;
  return timingSafeEqual(given, want) ? leadId : null;
}
