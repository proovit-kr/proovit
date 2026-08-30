"use server";

import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { readUnsubscribeToken } from "@/lib/unsubscribe-token";

/*
  사전 신청 취소(동의 철회).

  구현 규칙 10이 요구하는 「보유기간 동의 철회 시까지」의 실행 수단이다.
  필수 동의를 철회하면 보관 근거 자체가 사라지므로 **행을 지운다.**
  마케팅 수신거부(선택 동의 철회)와 다른 일이라 경로도 다르다.

  ⚠️ 되돌릴 수 없어서 POST로만 받는다. 메일의 링크는 GET으로 수신거부까지만
  하고, 취소는 결과 화면에서 한 번 더 누르게 한다.
*/
export async function cancelLead(formData: FormData) {
  const token = formData.get("t");
  const leadId = readUnsubscribeToken(
    typeof token === "string" ? token : undefined,
  );
  if (!leadId) redirect("/unsubscribe?s=invalid");

  /* 이미 없으면 성공이다 — 사용자가 원한 상태가 이미 그것이다 */
  await prisma.lead.deleteMany({ where: { id: leadId } });
  redirect("/unsubscribe?s=cancelled");
}
