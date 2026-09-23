"use server";

import { revalidatePath } from "next/cache";

import { JudgmentResult } from "@/generated/prisma/enums";
import { canAccess, getSessionUser, loadAccessContext } from "@/lib/access";
import { JUDGING_FAILURE_MESSAGE } from "@/lib/judging";
import { judgeBatch, type BatchItem } from "@/lib/judging-store";

/*
  판정 일괄 저장 — 시안 `#mdl-batch` 「저장하고 통지」.

  ⚠️ 판정은 참가팀의 시즌을 끝낼 수도 있는 쓰기다(미통과 → 탈락). 그래서
  ① 권한을 다시 보고 ② 사유를 강제하고 ③ 감사 로그를 남긴다(judging-store).

  ⚠️ 판정값은 pass·fail만 받는다 — 시안 부제 「판정값은 pass와 fail 2값, 보완 없음」.
  스키마의 `revision`은 옛 판정을 읽을 때만 남아 있다.
*/

export type JudgingState = {
  message?: string;
  done?: number;
  /** 저장 못 한 줄 — 제출 id와 이유 */
  failed?: { submissionId: string; message: string }[];
};

const ALLOWED: string[] = [JudgmentResult.pass, JudgmentResult.fail];

export async function saveJudgments(
  _prev: JudgingState,
  formData: FormData,
): Promise<JudgingState> {
  const user = await getSessionUser();
  if (!user) return { message: "로그인이 풀렸습니다." };

  const permission = canAccess("adminJudging", await loadAccessContext());
  if (!permission.ok) return { message: permission.message };

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { message: "잘못된 요청입니다." };
  }
  if (!Array.isArray(raw)) return { message: "잘못된 요청입니다." };

  const items: BatchItem[] = [];
  for (const it of raw) {
    if (
      !it ||
      typeof it.submissionId !== "string" ||
      typeof it.feedback !== "string" ||
      !ALLOWED.includes(it.result)
    ) {
      return { message: "잘못된 요청입니다." };
    }
    items.push({ submissionId: it.submissionId, result: it.result, feedback: it.feedback });
  }
  if (items.length === 0) return { message: "저장할 판정이 없습니다." };

  const { failed } = await judgeBatch({ items, judgeId: user.id });

  /*
    판정은 참가자 화면 셋을 동시에 바꾼다 — 심사 결과·대시보드 결론·리더보드.
    운영 화면만 새로 그리면 참가자는 옛 상태를 본다.
  */
  revalidatePath("/", "layout");
  return {
    done: Date.now(),
    failed: failed.map((f) => ({
      submissionId: f.submissionId,
      message: JUDGING_FAILURE_MESSAGE[f.code],
    })),
    ...(failed.length ? { message: `${failed.length}건은 저장하지 못했습니다.` } : {}),
  };
}
