"use server";

import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";

/*
  「전체 읽음」.

  ⚠️ 대상은 **세션의 사용자로만** 좁힌다 — 폼에서 사용자를 받지 않는다.
  한 건씩 읽는 것은 행을 누를 때다(`[id]/route.ts`).
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
