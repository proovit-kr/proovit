import { notFound } from "next/navigation";

import { canAccess, getSessionUser, loadAccessContext, loadViewerState } from "@/lib/access";
import { prisma } from "@/lib/prisma";

/*
  사전신청 리드 CSV — 시안 리드 화면의 「CSV 내보내기」.

  주소 전체가 나가는 유일한 길이라 셋을 지킨다.
    ① 운영자만(아니면 404 — 있는 줄도 모르게)
    ② 내려받을 때마다 감사 로그 한 줄(`lead.export`, 몇 건을 누가)
    ③ 수신거부·마케팅 동의 칸을 같이 싣는다 — 발송 대상은 이 칸이 정한다
       (운영규칙 제24조 ②). 목록에 있다는 사실만으로 광고를 보내면 안 된다.

  셀이 `=`·`+`·`-`·`@`로 시작하면 스프레드시트가 수식으로 읽는다(CSV 인젝션) —
  작은따옴표를 앞에 붙인다.
*/

export const dynamic = "force-dynamic";

function cell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const KST = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul",
  dateStyle: "short",
  timeStyle: "short",
});

export async function GET() {
  const permission = canAccess("adminLeads", await loadAccessContext());
  const user = await getSessionUser();
  if (!permission.ok || !user) notFound();

  const viewer = await loadViewerState();
  if (!viewer.season) notFound();

  const rows = await prisma.lead.findMany({
    where: { seasonId: viewer.season.id },
    orderBy: { createdAt: "asc" },
    select: {
      email: true,
      marketingOptIn: true,
      unsubscribedAt: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      sourceChannel: true,
      createdAt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "lead.export",
      targetType: "season",
      targetId: viewer.season.id,
      reason: "사전신청 리드 CSV 내보내기",
      meta: { count: rows.length },
    },
  });

  const head = ["email", "marketing_opt_in", "unsubscribed_at", "created_at", "utm_source", "utm_medium", "utm_campaign", "source_channel"];
  const lines = rows.map((r) =>
    [
      r.email,
      r.marketingOptIn ? "Y" : "N",
      r.unsubscribedAt ? KST.format(r.unsubscribedAt) : "",
      KST.format(r.createdAt),
      r.utmSource ?? "",
      r.utmMedium ?? "",
      r.utmCampaign ?? "",
      r.sourceChannel ?? "",
    ].map(cell).join(","),
  );
  /* 엑셀이 한글을 깨뜨리지 않게 BOM을 앞에 둔다 */
  const body = "﻿" + [head.join(","), ...lines].join("\r\n");
  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="proovit-leads-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
