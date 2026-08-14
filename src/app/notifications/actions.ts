"use server";

import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";

/*
  알림 읽음 처리.

  ⚠️ 대상은 **세션의 사용자로만** 좁힌다. 알림 id를 폼에서 받되 `userId`를 함께
  where에 넣는다 — id만으로 지우면 남의 알림을 읽음 처리할 수 있다(IDOR).
  updateMany를 쓰는 이유도 그것이다. update는 PK 하나로 찾아 소유자 조건을
  where에 못 넣는다.
*/

export async function markRead(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;

  const id = String(formData.get("id") ?? "");
  const now = new Date();

  if (id === "all") {
    await prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: now },
    });
  } else if (id) {
    await prisma.notification.updateMany({
      where: { id, userId: user.id, readAt: null },
      data: { readAt: now },
    });
  }

  revalidatePath("/notifications");
}
