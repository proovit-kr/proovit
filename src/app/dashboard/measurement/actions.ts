"use server";

import { revalidatePath } from "next/cache";

import { canAccess, loadViewerState, toAccessContext } from "@/lib/access";
import {
  HostLabelSchema,
  MEASUREMENT_FAILURE_MESSAGE,
  OriginUrlSchema,
} from "@/lib/measurement";
import { registerHostname } from "@/lib/measurement-store";

/*
  측정 주소 등록.

  ⚠️ 판정은 `canAccess("dashboardMeasurement")` 하나가 한다 — 화면이 폼을 그릴 때
  부르는 것과 같은 함수다. 서버 액션은 그 자체로 호출 가능한 엔드포인트다.

  ⚠️ 팀장만 등록한다. 측정 주소는 팀의 지표가 어디서 세어지는지를 정하는 값이라
  팀 단위 쓰기다(G5).
*/

export type MeasurementState = {
  errors?: { label?: string; originUrl?: string };
  message?: string;
  done?: boolean;
  values?: { label: string; originUrl: string };
};

export async function saveMeasurement(
  _prev: MeasurementState,
  formData: FormData,
): Promise<MeasurementState> {
  const values = {
    label: String(formData.get("label") ?? ""),
    originUrl: String(formData.get("originUrl") ?? ""),
  };

  const viewer = await loadViewerState();
  if (!viewer.user) {
    return { message: "로그인이 풀렸습니다. 다시 로그인해 주세요.", values };
  }
  if (!viewer.entry || !viewer.team) {
    return { message: "참가 기록이 없습니다.", values };
  }

  const ctx = toAccessContext(viewer);
  const permission = canAccess("dashboardMeasurement", ctx);
  if (!permission.ok) return { message: permission.message, values };
  if (!viewer.team.isLeader) {
    return { message: "측정 주소 등록은 팀장만 할 수 있습니다.", values };
  }

  const label = HostLabelSchema.safeParse(values.label);
  const origin = OriginUrlSchema.safeParse(values.originUrl);
  if (!label.success || !origin.success) {
    return {
      errors: {
        label: label.success ? undefined : label.error.issues[0]?.message,
        originUrl: origin.success ? undefined : origin.error.issues[0]?.message,
      },
      values,
    };
  }

  const result = await registerHostname({
    entryId: viewer.entry.id,
    label: label.data,
    originUrl: origin.data,
  });
  if (!result.ok) {
    return { message: MEASUREMENT_FAILURE_MESSAGE[result.code], values };
  }

  /*
    측정 연동은 온보딩 체크리스트의 둘째 항목이라 허브의 결론이 바뀐다.
    s3 제출 화면도 이 상태를 읽어 안내를 바꾼다.
  */
  revalidatePath("/dashboard/measurement");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/submit/s3");
  return { done: true, values };
}
