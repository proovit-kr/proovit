"use server";

import { revalidatePath } from "next/cache";

import { JudgmentResult } from "@/generated/prisma/enums";
import { canAccess, getSessionUser, loadAccessContext } from "@/lib/access";
import { JUDGING_FAILURE_MESSAGE } from "@/lib/judging";
import { judgeSubmission } from "@/lib/judging-store";

/*
  판정 접수.

  ⚠️ 판정은 참가팀의 시즌을 끝낼 수도 있는 쓰기다(미통과 → 탈락). 그래서
  ① 권한을 다시 보고 ② 사유를 강제하고 ③ 감사 로그를 남긴다(judging-store).

  ⚠️ 판정 결과를 폼 문자열로 받되 열거값에 있는 것만 통과시킨다.
*/

export type JudgingState = { message?: string; done?: boolean };

export async function submitJudgment(
  _prev: JudgingState,
  formData: FormData,
): Promise<JudgingState> {
  const user = await getSessionUser();
  if (!user) return { message: "로그인이 풀렸습니다." };

  const permission = canAccess("adminJudging", await loadAccessContext());
  if (!permission.ok) return { message: permission.message };

  const submissionId = String(formData.get("submissionId") ?? "");
  const raw = String(formData.get("result") ?? "");
  const feedback = String(formData.get("feedback") ?? "");

  const result = (Object.values(JudgmentResult) as string[]).includes(raw)
    ? (raw as JudgmentResult)
    : null;
  if (!submissionId || !result) return { message: "잘못된 요청입니다." };

  const outcome = await judgeSubmission({
    submissionId,
    result,
    feedback,
    judgeId: user.id,
  });
  if (!outcome.ok) {
    return { message: JUDGING_FAILURE_MESSAGE[outcome.code] };
  }

  /*
    판정은 참가자 화면 셋을 동시에 바꾼다 — 심사 결과·대시보드 결론·리더보드.
    운영 화면만 새로 그리면 참가자는 옛 상태를 본다.
  */
  revalidatePath("/admin/judging");
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/judgments");
  return { done: true };
}
