"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import {
  EntryStage,
  EntryStatus,
  SeasonPhase,
} from "@/generated/prisma/enums";
import {
  DEV_SESSION_COOKIE,
  checkDevSandbox,
  impersonate,
  setSandboxPhase,
  setSandboxStage,
  setSandboxStatus,
  toggleSandboxFlag,
} from "@/lib/dev-sandbox";
import { featureFlagsSchema, type FeatureFlagKey } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

/*
  개발용 상태 토글의 서버 액션.

  ⚠️ 모든 액션이 `checkDevSandbox()`를 **다시** 부른다. 화면이 바를 안 그렸다는
  사실은 아무것도 막지 못한다 — 서버 액션은 그 자체로 호출 가능한 엔드포인트다.
  (dev-sandbox.ts의 쓰기 함수들도 각자 한 번 더 본다. 세 겹이다.)

  ⚠️ 여기 있는 것은 **권한 판정이 아니다.** 운영자 권한을 확인하지 않는 이유는
  이 도구가 애초에 운영 DB에서 안 열리기 때문이고, dev에서는 아무나 아무 팀으로
  갈아탈 수 있는 것이 목적이다.
*/

export type DevActionState = { message?: string; done?: string };

/** 화면에서 온 문자열을 enum으로. 목록에 없으면 null */
function toEnum<T extends Record<string, string>>(
  values: T,
  raw: unknown,
): T[keyof T] | null {
  const value = String(raw ?? "");
  return (Object.values(values) as string[]).includes(value)
    ? (value as T[keyof T])
    : null;
}

function guard(): { ok: true } | { ok: false; message: string } {
  const check = checkDevSandbox();
  return check.ok ? { ok: true } : { ok: false, message: check.reason };
}

/*
  바꾼 뒤 **레이아웃까지** 무효화한다. 대시보드·운영 콘솔 내비가 플래그를 읽어
  항목을 그리므로(layout.tsx), 페이지만 갱신하면 메뉴가 옛 상태로 남는다.
*/
function refresh(): void {
  revalidatePath("/", "layout");
}

/** 이 팀 팀장으로 갈아탄다 */
export async function devImpersonate(
  _prev: DevActionState,
  formData: FormData,
): Promise<DevActionState> {
  const gate = guard();
  if (!gate.ok) return { message: gate.message };

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { message: "어느 계정인지 알 수 없습니다." };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, nickname: true },
  });
  if (!user) return { message: "그 계정이 없습니다." };

  const { token, expires } = await impersonate(user.id);
  const jar = await cookies();
  jar.set(DEV_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires,
  });

  refresh();
  return { done: `${user.nickname} 계정으로 바꿨습니다.` };
}

/** 로그아웃. 갈아탄 세션을 버린다 */
export async function devSignOut(): Promise<DevActionState> {
  const gate = guard();
  if (!gate.ok) return { message: gate.message };

  const jar = await cookies();
  const token = jar.get(DEV_SESSION_COOKIE)?.value;
  if (token) {
    /* 쿠키만 지우면 세션 행이 dev DB에 계속 쌓인다 */
    await prisma.session.deleteMany({ where: { sessionToken: token } });
    jar.delete(DEV_SESSION_COOKIE);
  }

  refresh();
  return { done: "로그아웃했습니다." };
}

export async function devSetStage(
  _prev: DevActionState,
  formData: FormData,
): Promise<DevActionState> {
  const gate = guard();
  if (!gate.ok) return { message: gate.message };

  const entryId = String(formData.get("entryId") ?? "");
  const stage = toEnum(EntryStage, formData.get("stage"));
  if (!entryId || !stage) return { message: "잘못된 요청입니다." };

  /*
    제출물을 만들 때 `submitted_by`에 넣을 사람이 필요하다. 지금 로그인한
    사람이 아니라 **그 팀의 팀장**이어야 한다 — 남의 팀 제출에 내 이름이 박히면
    제출 분쟁 화면을 검토할 때 화면이 거짓말을 한다.
  */
  const leader = await prisma.entry.findUnique({
    where: { id: entryId },
    select: {
      team: {
        select: {
          members: { where: { role: "leader" }, take: 1, select: { userId: true } },
        },
      },
    },
  });
  const leaderId = leader?.team.members[0]?.userId;
  if (!leaderId) return { message: "그 팀에 팀장이 없습니다." };

  await setSandboxStage({ entryId, stage, userId: leaderId });
  refresh();
  return { done: `진도를 ${stage}로 바꿨습니다.` };
}

export async function devSetStatus(
  _prev: DevActionState,
  formData: FormData,
): Promise<DevActionState> {
  const gate = guard();
  if (!gate.ok) return { message: gate.message };

  const entryId = String(formData.get("entryId") ?? "");
  const status = toEnum(EntryStatus, formData.get("status"));
  if (!entryId || !status) return { message: "잘못된 요청입니다." };

  await setSandboxStatus({ entryId, status });
  refresh();
  return { done: `상태를 ${status}로 바꿨습니다.` };
}

export async function devSetPhase(
  _prev: DevActionState,
  formData: FormData,
): Promise<DevActionState> {
  const gate = guard();
  if (!gate.ok) return { message: gate.message };

  const seasonId = String(formData.get("seasonId") ?? "");
  const phase = toEnum(SeasonPhase, formData.get("phase"));
  if (!seasonId || !phase) return { message: "잘못된 요청입니다." };

  await setSandboxPhase({ seasonId, phase });
  refresh();
  return { done: `페이즈를 ${phase}로 바꿨습니다.` };
}

export async function devToggleFlag(
  _prev: DevActionState,
  formData: FormData,
): Promise<DevActionState> {
  const gate = guard();
  if (!gate.ok) return { message: gate.message };

  const seasonId = String(formData.get("seasonId") ?? "");
  const raw = String(formData.get("flag") ?? "");
  const value = formData.get("value") === "1";

  /* 플래그 이름은 스키마에 있는 것만 받는다 — 오타가 조용히 JSONB에 남지 않게 */
  const known = Object.keys(featureFlagsSchema.shape);
  if (!seasonId || !known.includes(raw)) {
    return { message: "잘못된 요청입니다." };
  }

  await toggleSandboxFlag({
    seasonId,
    flag: raw as FeatureFlagKey,
    value,
  });
  refresh();
  return { done: `${raw} ${value ? "켬" : "끔"}` };
}
