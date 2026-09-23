"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/access";
import { notiHref } from "@/lib/notifications-view";
import { prisma } from "@/lib/prisma";

/*
  읽음 처리 — 「전체 읽음」과 행 하나(`openNotification`).

  ⚠️ 대상은 **세션의 사용자로** 좁힌다. 행 하나는 `id`와 함께 where에 넣는다 —
  id만으로 찾으면 남의 알림을 읽음 처리할 수 있다(IDOR). updateMany를 쓰는 이유다.

*/

export async function markAllRead(): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;

  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/", "layout");
}

/**
 * 행 하나 — 읽음으로 두고 그 알림의 링크로 보낸다.
 *
 * ⚠️ **이동은 여기서 `redirect`로 한다.** 재검증한 액션은 끝날 때 액션을 부른
 * 화면으로 다시 이동하므로, 클라이언트가 따로 `Link`·`router.push`로 떠나면 두
 * 이동이 겹쳐 새 기록이 안 쌓이고 뒤로가기가 알림센터를 건너뛴다(2026-09-23 재현).
 * 액션의 redirect는 SPA push 한 번이고, 재검증이 라우터 캐시를 비우므로
 * 뒤로가기가 읽은 상태로 다시 그린다.
 */
export async function openNotification(id: string): Promise<void> {
  const user = await getSessionUser();
  if (!user || !/^[0-9a-f-]{36}$/i.test(id)) redirect("/notifications");

  const row = await prisma.notification.findFirst({
    where: { id, userId: user.id },
    select: { linkUrl: true, readAt: true },
  });
  if (row && !row.readAt) {
    await prisma.notification.updateMany({
      where: { id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    revalidatePath("/", "layout");
  }

  redirect(notiHref(row?.linkUrl ?? null) ?? "/notifications");
}
