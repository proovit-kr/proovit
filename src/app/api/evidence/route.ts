import { randomUUID } from "node:crypto";

import { EVIDENCE_MESSAGE } from "@/content/submission";
import type { EntryStage } from "@/generated/prisma/enums";
import {
  accessFailure,
  canAccess,
  canSubmitStage,
  loadViewerState,
  toAccessContext,
} from "@/lib/access";
import { apiFail, apiOk } from "@/lib/api";
import {
  EVIDENCE_KINDS,
  EVIDENCE_MAX_BYTES,
  buildEvidenceKey,
  evidenceName,
  isEvidenceScope,
  isEvidenceSlot,
  safeFileName,
  sniffKind,
} from "@/lib/evidence";
import { evidenceStorage } from "@/lib/evidence-storage";
import { SUBMISSION_FAILURE_MESSAGE, isStageKey } from "@/lib/submission";
import { loadSubmitOverview } from "@/lib/submission-store";

/*
  POST /api/evidence — 증빙 파일 하나를 올린다(multipart: file · stageKey · slot).
  `stageKey`는 스테이지(s1~s5) 또는 소명(`appeal`)이다 — 소명 증빙은 소명 화면의
  권한(`dashboardAppeal`, 실격 팀도 열린다)으로 본다.

  폼과 따로 올리는 이유: 서버 액션은 본문 1MB가 기본이고, 파일을 폼에 실으면
  칩 하나 빼려 해도 폼을 다시 보내야 한다. 여기서 올리고 키만 받아 폼의 hidden에
  쌓는다. 저장은 폼이 저장될 때 제출 행에 붙는다(submission-store.ts) — 올리고
  저장하지 않은 파일은 남지만, 다음 저장이 그 행의 목록과 저장소를 맞춘다.

  권한은 화면·서버 액션과 **같은 함수**로 본다(`canSubmitStage` + 행의 editable).
  잠긴 판에는 올릴 수 없다.

  ⚠️ 종류는 첫 바이트로 본다. 브라우저의 MIME과 확장자는 참고하지 않는다.
*/

export async function POST(request: Request) {
  const viewer = await loadViewerState();
  if (!viewer.user) return apiFail("UNAUTHENTICATED", "로그인이 필요해요.");
  if (!viewer.entry || !viewer.season) return apiFail("NOT_FOUND", "참가 기록이 없어요.");

  /* 본문을 읽기 전에 크기부터 — 10MB 넘는 걸 다 받고 나서 거절하지 않는다 */
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > EVIDENCE_MAX_BYTES + 64 * 1024) {
    return apiFail("VALIDATION_FAILED", EVIDENCE_MESSAGE.tooBig);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiFail("INVALID_JSON", EVIDENCE_MESSAGE.unreadable);
  }
  const stageKey = String(form.get("stageKey") ?? "");
  const slot = String(form.get("slot") ?? "");
  if (
    !isEvidenceScope(stageKey) ||
    !isEvidenceSlot(slot) ||
    (slot === "problem" && stageKey !== "s1")
  ) {
    return apiFail("VALIDATION_FAILED", SUBMISSION_FAILURE_MESSAGE.NOT_FOUND);
  }

  if (stageKey === "appeal") {
    const denied = accessFailure(canAccess("dashboardAppeal", toAccessContext(viewer)));
    if (denied) return denied;
  } else if (isStageKey(stageKey)) {
    /* EntryStage와 StageKey는 s1~s5에서 값이 같다 */
    const permission = canSubmitStage(stageKey as unknown as EntryStage, toAccessContext(viewer));
    const denied = accessFailure(permission);
    if (denied) return denied;
    const overview = await loadSubmitOverview(viewer.entry.id, viewer.season.id);
    const row = overview?.stages.find((s) => s.stageKey === stageKey);
    if (!row) return apiFail("NOT_FOUND", SUBMISSION_FAILURE_MESSAGE.NOT_FOUND);
    if (!row.editable) {
      return apiFail(
        "STAGE_LOCKED",
        SUBMISSION_FAILURE_MESSAGE[row.lockedReason ?? "STAGE_LOCKED"],
      );
    }
  }

  const file = form.get("file");
  if (!(file instanceof File)) return apiFail("VALIDATION_FAILED", EVIDENCE_MESSAGE.noFile);
  if (file.size > EVIDENCE_MAX_BYTES) {
    return apiFail("VALIDATION_FAILED", EVIDENCE_MESSAGE.tooBig);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffKind(bytes);
  if (!kind) return apiFail("VALIDATION_FAILED", EVIDENCE_MESSAGE.badType);

  const storage = evidenceStorage();
  if (!storage) return apiFail("INTERNAL", EVIDENCE_MESSAGE.noStorage);

  const key = buildEvidenceKey({
    entryId: viewer.entry.id,
    stageKey,
    slot,
    id: randomUUID().replace(/-/g, ""),
    name: safeFileName(file.name, kind),
  });
  await storage.put(key, bytes, EVIDENCE_KINDS[kind]);

  return apiOk({ key, name: evidenceName(key) }, { status: 201 });
}
