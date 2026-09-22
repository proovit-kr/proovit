"use server";

import { revalidatePath } from "next/cache";

import { canAccess, loadViewerState, toAccessContext } from "@/lib/access";
import {
  HostLabelSchema,
  MEASUREMENT_FAILURE_MESSAGE,
  OriginUrlSchema,
  type MeasurementState as Panel,
} from "@/lib/measurement";
import {
  loadMeasurement,
  registerHostname,
  verifyHostname,
} from "@/lib/measurement-store";

/*
  측정 연동의 쓰기 둘 — 등록(`register`)과 검증(`verify`).

  ⚠️ 판정은 `canAccess("dashboardMeasurement")` 하나가 한다 — 화면이 폼을 그릴 때
  부르는 것과 같은 함수다. 서버 액션은 그 자체로 호출 가능한 엔드포인트다.

  ⚠️ 팀장만 쓴다. 측정 주소는 팀의 지표가 어디서 세어지는지를 정하는 값이라
  팀 단위 쓰기다(G5). 정책의 `leaderOnly`가 그것을 걸고 있다.

  등록은 **바로 검증까지 한다.** 등록만 하고 「확인 중」에 세워 두면 참가자가
  다시 눌러야 할 버튼이 하나 늘 뿐이다 — 주소가 살아 있으면 그 자리에서 ②가 된다.
  검증(`verify`)은 시안 ①③의 「다시 검증하기」다. ③에서는 배포 주소를 고쳐 낼
  수 있으므로(시안 ③ 원인 문구가 「최종 배포 주소인지 확인한 뒤」라 고칠 자리가
  있어야 한다) 값이 바뀌었으면 다시 등록한 뒤 검증한다.
*/

export type MeasurementActionState = {
  errors?: { label?: string; originUrl?: string };
  message?: string;
  /** 검증까지 끝났을 때 도달한 판. 화면은 서버가 다시 그린 것을 본다 */
  done?: Panel;
  values?: { label: string; originUrl: string };
};

export async function manageMeasurement(
  _prev: MeasurementActionState,
  formData: FormData,
): Promise<MeasurementActionState> {
  const op = String(formData.get("op") ?? "");
  const values = {
    label: String(formData.get("label") ?? ""),
    originUrl: String(formData.get("originUrl") ?? ""),
  };

  const viewer = await loadViewerState();
  if (!viewer.user) {
    return { message: "로그인이 풀렸어요. 다시 로그인해 주세요.", values };
  }
  if (!viewer.entry || !viewer.team) {
    return { message: "참가 기록이 없어요.", values };
  }

  const permission = canAccess("dashboardMeasurement", toAccessContext(viewer));
  if (!permission.ok) return { message: permission.message, values };

  const entryId = viewer.entry.id;

  if (op === "register") {
    const label = HostLabelSchema.safeParse(values.label);
    const origin = OriginUrlSchema.safeParse(values.originUrl);
    if (!label.success || !origin.success) {
      return {
        errors: {
          label: label.success ? undefined : label.error.issues[0]?.message,
          originUrl: origin.success
            ? undefined
            : origin.error.issues[0]?.message,
        },
        values,
      };
    }
    const saved = await registerHostname({
      entryId,
      label: label.data,
      originUrl: origin.data,
    });
    if (!saved.ok) {
      return { message: MEASUREMENT_FAILURE_MESSAGE[saved.code], values };
    }
  } else if (op === "verify") {
    const current = await loadMeasurement(entryId);
    if (!current.label) return { message: "먼저 주소를 등록해 주세요.", values };
    /* ③에서 배포 주소를 고쳐 냈으면 그 값으로 다시 등록한다. 빈 값은 「그대로」다 */
    if (values.originUrl && values.originUrl !== current.originUrl) {
      const origin = OriginUrlSchema.safeParse(values.originUrl);
      if (!origin.success) {
        return {
          errors: { originUrl: origin.error.issues[0]?.message },
          values,
        };
      }
      const saved = await registerHostname({
        entryId,
        label: current.label,
        originUrl: origin.data,
      });
      if (!saved.ok) {
        return { message: MEASUREMENT_FAILURE_MESSAGE[saved.code], values };
      }
    }
  } else {
    return { message: "알 수 없는 요청이에요.", values };
  }

  const verified = await verifyHostname(entryId);
  if (!verified.ok) {
    return { message: MEASUREMENT_FAILURE_MESSAGE[verified.code], values };
  }

  /*
    측정 연동은 온보딩 체크리스트의 둘째 항목이라 허브의 결론이 바뀌고,
    사이드바·헤더도 온보딩을 읽는다. s3 제출 화면도 이 상태로 안내를 바꾼다.
  */
  revalidatePath("/", "layout");
  return { done: verified.state, values };
}
