"use server";

import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/access";
import { type ProfileFieldErrors } from "@/lib/profile";
import { saveProfile } from "@/lib/profile-store";

export interface SettingsState {
  errors?: ProfileFieldErrors;
  /** 필드에 못 붙는 오류(로그인 만료 등). */
  message?: string;
  /** 저장에 성공했다. 화면에 그대로 머무르므로 결과를 말해줘야 한다. */
  saved?: boolean;
  /** 되돌려 채울 입력값. 없으면 사용자가 방금 친 것을 잃는다. */
  values?: { name: string; nickname: string };
}

export async function saveSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  // 서버 액션은 폼을 거치지 않고 직접 호출할 수 있다. 인증을 생략하지 않는다.
  const user = await getSessionUser();
  if (!user) {
    return { message: "로그인이 풀렸습니다. 다시 로그인해 주세요." };
  }

  const values = {
    name: String(formData.get("name") ?? ""),
    nickname: String(formData.get("nickname") ?? ""),
  };

  /*
    markOnboarded: false — onboarded_at은 "가입 절차를 언제 마쳤나"라서
    나중에 이름을 고칠 때마다 뒤로 밀리면 안 된다.
  */
  const result = await saveProfile(user, values, { markOnboarded: false });
  if (!result.ok) return { errors: result.errors, values };

  /*
    NavBar가 서버에서 세션 사용자를 읽어 이름을 그린다. 저장 후 화면에
    머무르므로 다시 그려주지 않으면 헤더에는 옛 닉네임이 남는다.
  */
  revalidatePath("/", "layout");

  return { saved: true, values };
}
