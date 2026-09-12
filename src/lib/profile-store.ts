import { z } from "@/lib/z";

import { hasAnyEntry } from "@/lib/apply-store";
import { prisma } from "@/lib/prisma";
import { ProfileSchema, type ProfileFieldErrors } from "@/lib/profile";

/*
  이름·닉네임 저장. **서버 전용이다** — prisma를 쓰므로 클라이언트 컴포넌트에서
  import하면 빌드가 깨진다. 규칙(길이·문자 제한)은 profile.ts에 있고 그쪽은
  클라이언트도 읽는다.

  같은 값을 받는 화면이 둘이다 — /onboarding(가입 직후 처음 받는 자리)과
  /settings(나중에 고치는 자리). 규칙과 저장을 양쪽에 복사하면 한쪽만 고쳐져서
  "설정에서는 되는데 온보딩에서는 안 되는" 상태가 생긴다.

  차이는 하나뿐이다: 온보딩만 onboarded_at을 채운다.

  ────────────────────────────────────────────────────────────
  ⚠️ 실명(name)은 **참가 신청이 확정되면 잠근다** (2026-08-12 결정 · DEV3에서 구현)

  실명은 상금 지급 때 예금주와 대조하는 값이라 아무 때나 바뀌면 안 된다.
  다만 지금 잠그는 것도 답이 아니다 — 우리는 본인인증·실명확인을 하지 않으므로
  잠가도 그 값이 진짜라는 보장이 없고, 오타 하나가 곧 운영 문의가 된다
  (/settings를 9/2에서 당겨온 이유가 그 문의를 없애는 것이었다).

  그래서 기준은 "언제부터 의미를 갖느냐"다. Entry가 생기는 순간(= 계약 성립)
  부터 잠근다. 심사 기준서가 과금 유형을 "제출 후 변경 불가"로 잡은 것과 같은 구조다.

  구현: Entry가 하나라도 있으면 name은 무시하고 nickname만 반영한다(아래 nameLocked).
  화면(/settings)도 같은 판정으로 실명 칸을 읽기 전용으로 바꾼다 — 서버만 막고
  화면을 열어두면 고쳐지지 않는 칸에 입력을 받는 꼴이 된다.

  ⚠️ 남은 구멍: 지금은 실명이 바뀌어도 **흔적이 남지 않는다.** 진짜 위험은
  "수정 가능"이 아니라 여기다 — 지급 대상자가 조용히 바뀌어도 아무도 모른다.
  audit_logs는 W3(DEV8 나머지)이므로 그때 이 경로를 기록 대상에 넣을 것.
  ────────────────────────────────────────────────────────────
*/

export type SaveProfileResult =
  | { ok: true }
  | { ok: false; errors: ProfileFieldErrors };

export async function saveProfile(
  user: { id: string; onboardedAt: Date | null },
  raw: { name: string; nickname: string },
  options: { markOnboarded: boolean },
): Promise<SaveProfileResult> {
  const parsed = ProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
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
    where: {
      nickname: { equals: nickname, mode: "insensitive" },
      NOT: { id: user.id },
    },
    select: { id: true },
  });
  if (taken) {
    return {
      ok: false,
      errors: {
        nickname: ["이미 사용 중인 닉네임입니다. 다른 이름을 써 주세요."],
      },
    };
  }

  /*
    참가가 하나라도 있으면 실명은 잠긴다. 온보딩(아직 참가 전)은 항상 통과하고,
    /settings에서만 걸린다. 화면이 이미 읽기 전용이라 여기까지 오는 값은
    폼을 거치지 않은 요청인데, 서버 액션은 직접 호출할 수 있으므로 여기서도 막는다.
  */
  const nameLocked = await hasAnyEntry(user.id);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: nameLocked ? undefined : name,
      nickname,
      /*
        이미 값이 있으면 덮어쓰지 않는다. onboarded_at은 "언제 가입 절차를
        마쳤나"라서 나중에 /settings에서 이름을 고칠 때마다 뒤로 밀리면 안 된다.
        emailVerifiedAt을 다루는 방식과 같은 이유다(auth.ts events.linkAccount).
      */
      onboardedAt: options.markOnboarded
        ? (user.onboardedAt ?? new Date())
        : undefined,
    },
  });

  return { ok: true };
}
