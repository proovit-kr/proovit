"use server";

import { redirect } from "next/navigation";

import { getSessionUser, safeNext } from "@/lib/access";
import { type ProfileFieldErrors } from "@/lib/profile";
import { saveProfile } from "@/lib/profile-store";

export interface OnboardingState {
  /** 필드별 오류. 첫 줄만 화면에 보여준다. */
  errors?: ProfileFieldErrors;
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

  const values = {
    name: String(formData.get("name") ?? ""),
    nickname: String(formData.get("nickname") ?? ""),
  };

  // 온보딩만 onboarded_at을 채운다 — /settings는 안 건드린다.
  const result = await saveProfile(user, values, { markOnboarded: true });
  if (!result.ok) return { errors: result.errors, values };

  // redirect()는 예외를 던져 흐름을 끊는다 — try 안에 두면 안 된다.
  redirect(safeNext(String(formData.get("next") ?? "")) ?? "/");
}
