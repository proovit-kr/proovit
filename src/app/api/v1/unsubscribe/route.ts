import { NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { readUnsubscribeToken } from "@/lib/unsubscribe-token";

/*
  GET /api/v1/unsubscribe?t=… — 메일 하단 링크가 가리키는 곳.

  구현 규칙 6이 「로그인 없이 1회 클릭 처리」를 요구한다. 그래서 GET에서
  광고성 수신거부까지 **끝내고** 결과 화면으로 넘긴다. 누르는 것 말고 아무것도
  요구하지 않아야 한다.

  ⚠️ GET이 상태를 바꾸는 것은 원칙적으로 피할 일이지만, 여기서는 법이 요구하는
  「1회 클릭」이 그 원칙보다 앞선다. 대신 **되돌릴 수 없는 것은 하지 않는다** —
  사전 신청 취소(행 삭제)는 결과 화면에서 POST로 한 번 더 확인받는다.
  메일 클라이언트의 링크 미리보기가 눌러도 잃는 것이 없어야 한다.
*/
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t") ?? undefined;
  const leadId = readUnsubscribeToken(token);
  const to = (state: string) =>
    NextResponse.redirect(
      new URL(`/unsubscribe?s=${state}${token ? `&t=${encodeURIComponent(token)}` : ""}`, request.url),
    );

  if (!leadId) return to("invalid");

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, marketingOptIn: true },
  });
  /* 이미 취소한 사람이 옛 메일에서 다시 눌렀다. 실패가 아니라 이미 된 것이다 */
  if (!lead) return to("gone");

  if (lead.marketingOptIn) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        marketingOptIn: false,
        unsubscribedAt: new Date(),
        status: "unsubscribed",
      },
    });
    return to("done");
  }
  return to("already");
}
