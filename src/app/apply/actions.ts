"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/access";
import { type ApplyFieldErrors } from "@/lib/apply";
import { submitApplication, type ApplyFailureCode } from "@/lib/apply-store";

export interface ApplyState {
  errors?: ApplyFieldErrors;
  /** 필드에 못 붙는 오류(모집 마감·동의 누락·로그인 만료) */
  message?: string;
  code?: ApplyFailureCode;
  /** 되돌려 채울 입력값. 없으면 사용자가 방금 친 것을 잃는다. */
  values?: {
    isSolo: boolean;
    teamName: string;
    ideaTitle: string;
    ideaSummary: string;
    phone: string;
  };
}

export async function submitApply(
  _prev: ApplyState,
  formData: FormData,
): Promise<ApplyState> {
  /*
    ⚠️ 화면이 로그인 뒤에 있다고 액션의 인증을 생략하지 않는다.
    서버 액션은 그 자체로 호출 가능한 엔드포인트다(onboarding/actions.ts와 같은 이유).
  */
  const user = await getSessionUser();
  if (!user) {
    return { message: "로그인이 풀렸습니다. 다시 로그인해 주세요." };
  }
  if (!user.onboardedAt) {
    // 온보딩을 건너뛴 채로 액션만 부른 경우. 이름 없이 참가팀을 만들 수 없다.
    redirect("/onboarding?next=%2Fapply");
  }

  const values = {
    isSolo: formData.get("isSolo") === "solo",
    teamName: String(formData.get("teamName") ?? ""),
    ideaTitle: String(formData.get("ideaTitle") ?? ""),
    ideaSummary: String(formData.get("ideaSummary") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  };

  /*
    동의 값은 체크박스 3개를 각각 읽는다. 하나로 묶어 받으면 D2(항목별 분리
    동의)가 서버 기록에서 무너진다 — 화면만 나눠 두고 저장이 하나면 소용없다.
  */
  const consent = {
    privacy: formData.get("consent-privacy") === "on",
    terms: formData.get("consent-terms") === "on",
    metrics: formData.get("consent-metrics") === "on",
  };

  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for");

  const result = await submitApplication(user, values, consent, {
    ip: forwarded?.split(",")[0]?.trim() ?? requestHeaders.get("x-real-ip"),
    userAgent: requestHeaders.get("user-agent"),
  });

  if (!result.ok) {
    return {
      errors: result.errors,
      message: result.message,
      code: result.code,
      values,
    };
  }

  /*
    접수 뒤에는 이 화면으로 돌아오지 않는다. 대시보드(DEV4)가 아직 없어서
    같은 주소로 보내되, 이미 신청한 사람에게는 페이지가 접수 완료 화면을 그린다.
    redirect()는 예외를 던져 흐름을 끊으므로 try 안에 두지 않는다.
  */
  redirect("/apply?done=1");
}
