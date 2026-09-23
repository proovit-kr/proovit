import { type NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/access";
import { notiHref } from "@/lib/notifications-view";
import { prisma } from "@/lib/prisma";

/*
  알림 행을 눌렀을 때 — 읽음으로 두고 그 알림의 링크로 보낸다.

  ⚠️ 대상은 `id`와 **세션의 사용자**로 함께 좁힌다(updateMany) — id만으로
  찾으면 남의 알림을 읽음 처리할 수 있다(IDOR).

  링크는 `<a>`로만 건다(`next/link`가 아니다) — 프리페치가 GET을 미리 부르면
  열어 보지도 않은 알림이 읽힌다.
*/
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const back = new URL("/notifications", request.url);

  const user = await getSessionUser();
  if (!user || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.redirect(back);

  const row = await prisma.notification.findFirst({
    where: { id, userId: user.id },
    select: { linkUrl: true, readAt: true },
  });
  if (!row) return NextResponse.redirect(back);

  if (!row.readAt) {
    await prisma.notification.updateMany({
      where: { id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
  }

  const href = notiHref(row.linkUrl);
  return NextResponse.redirect(href ? new URL(href, request.url) : back);
}
