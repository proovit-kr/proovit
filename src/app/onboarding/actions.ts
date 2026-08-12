"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getSessionUser, safeNext } from "@/lib/access";
import { prisma } from "@/lib/prisma";

import { OnboardingSchema } from "./schema";

export interface OnboardingState {
  /** 필드별 오류. 첫 줄만 화면에 보여준다. */
  errors?: { name?: string[]; nickname?: string[] };
  /** 필드에 못 붙는 오류(로그인 만료 등). */
  message?: string;
  /** 되돌려 채울 입력값. 없으면 사용자가 방금 친 것을 잃는다. */
  values?: { name: string; nickname: string };
}

export async function saveOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  /*
    ⚠️ 화면이 로그인 뒤에 있다고 액션의 인증을 생략하지 않는다.
    서버 액션은 그 자체로 호출 가능한 엔드포인트다 — 폼을 거치지 않고
    직접 부를 수 있다. 사용자 id도 폼에서 받지 않고 세션에서만 읽는다.
  */
  const user = await getSessionUser();
  if (!user) {
    return { message: "로그인이 풀렸습니다. 다시 로그인해 주세요." };
  }

  const raw = {
    name: String(formData.get("name") ?? ""),
    nickname: String(formData.get("nickname") ?? ""),
  };
  const values = { name: raw.name, nickname: raw.nickname };

  const parsed = OnboardingSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors, values };
  }
  const { name, nickname } = parsed.data;

  /*
    ⚠️ 닉네임 중복 검사가 앱에만 있고 DB 제약이 없다.
    종결본 스키마의 users.nickname에는 @unique가 없어서, 두 사람이 같은 순간에
    같은 닉네임을 넣으면 둘 다 통과한다. 실제로는 거의 안 일어나지만
    "리더보드에 뜨는 이름"이라 남의 팀 이름을 그대로 쓰는 사칭이 가능해진다.
    → 8/17에 unique 제약 추가를 올릴 것. 제약이 생기면 이 코드는 그대로 두고
      P2002만 잡으면 된다.

    citext가 아니라 VarChar라 대소문자를 안 가린다 — insensitive로 비교한다.
  */
  const taken = await prisma.user.findFirst({
    where: { nickname: { equals: nickname, mode: "insensitive" }, NOT: { id: user.id } },
    select: { id: true },
  });
  if (taken) {
    return {
      errors: { nickname: ["이미 사용 중인 닉네임입니다. 다른 이름을 써 주세요."] },
      values,
    };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      name,
      nickname,
      /*
        이미 값이 있으면 덮어쓰지 않는다. onboarded_at은 "언제 가입 절차를
        마쳤나"라서 나중에 이름을 고칠 때마다 뒤로 밀리면 안 된다.
        emailVerifiedAt을 다루는 방식과 같은 이유다(auth.ts events.linkAccount).
      */
      onboardedAt: user.onboardedAt ?? new Date(),
    },
  });

  // redirect()는 예외를 던져 흐름을 끊는다 — try 안에 두면 안 된다.
  redirect(safeNext(String(formData.get("next") ?? "")) ?? "/");
}
