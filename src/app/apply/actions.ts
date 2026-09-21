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
    /** 「혼자 참가」 체크박스. 시안의 기본은 **해제(=팀 참가)**다 */
    isSolo: boolean;
    track: string;
    teamName: string;
    ideaTitle: string;
    ideaSummary: string;
    inviteEmail: string;
  };
}

export async function submitApply(
  _prev: ApplyState,
  formData: FormData,
): Promise<ApplyState> {
  /*
    ⚠️ 화면이 로그인 뒤에 있다고 액션의 인증을 생략하지 않는다.
    서버 액션은 그 자체로 호출 가능한 엔드포인트다.
  */
  const user = await getSessionUser();
  if (!user) {
    return { message: "로그인이 풀렸습니다. 다시 로그인해 주세요." };
  }

  /*
    ⚠️ isSolo는 **체크박스 하나**다(시안 ①의 「혼자 참가할래요」). 체크박스는
    꺼져 있으면 아예 안 실려서 `=== "on"`이 곧 「혼자」이고, 기본값은 해제 =
    팀 참가다. 라디오 둘이던 때와 기본값이 반대라는 것만 주의한다.
  */
  const values = {
    isSolo: formData.get("isSolo") === "on",
    track: String(formData.get("track") ?? "free"),
    teamName: String(formData.get("teamName") ?? ""),
    ideaTitle: String(formData.get("ideaTitle") ?? ""),
    ideaSummary: String(formData.get("ideaSummary") ?? ""),
    inviteEmail: String(formData.get("inviteEmail") ?? ""),
  };

  /*
    동의 값은 체크박스 2개를 각각 읽는다. 하나로 묶어 받으면 D2(항목별 분리
    동의)가 서버 기록에서 무너진다 — 화면만 나눠 두고 저장이 하나면 소용없다.
    항목은 09-21에 셋에서 둘로 줄었다(content/consent.ts의 참가 신청 주석).
  */
  const consent = {
    metrics: formData.get("consent-metrics") === "on",
    evidence: formData.get("consent-evidence") === "on",
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
