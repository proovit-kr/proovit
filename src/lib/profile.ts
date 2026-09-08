import { z } from "@/lib/z";

/*
  이름·닉네임의 **규칙**만 둔다. 저장(DB 쓰기)은 profile-store.ts다.

  ⚠️ 나누는 이유는 취향이 아니다. 이 파일을 클라이언트 컴포넌트
  (ProfileFields.tsx)가 maxLength 때문에 import하는데, 여기에 prisma가 같이
  있으면 클라이언트 번들이 node:module을 끌어와 빌드가 통째로 깨진다.
  실제로 깨져서 나눴다.

  같은 값을 받는 화면이 둘이다 — /onboarding(가입 직후 처음 받는 자리)과
  /settings(나중에 고치는 자리). 규칙을 양쪽에 복사하면 한쪽만 고쳐져서
  "설정에서는 되는데 온보딩에서는 안 되는" 상태가 생긴다.
*/

export const NAME_MAX = 60; // users.name = VarChar(60)
/*
  users.nickname은 DB상 60자까지 들어가지만 화면에서는 20자로 끊는다.
  리더보드 행과 참가작 카드에 들어가는 값이라 길면 줄이 깨지고, 긴 이름으로
  다른 팀 이름을 감싸 흉내 내는 것도 막는다. DB를 60으로 둔 것은 종결본 그대로다 —
  줄이려면 마이그레이션이라 화면 제한으로 먼저 잡는다.
*/
export const NICKNAME_MAX = 20;

/** 제어문자(줄바꿈·탭 포함)를 막는다. 이름에 들어갈 이유가 없고 화면을 깨뜨린다. */
const NO_CONTROL_CHARS = /^[^\p{Cc}\p{Cf}]+$/u;

/** 연속 공백을 하나로 줄인다. "홍  길동"과 "홍 길동"이 다른 사람이 되지 않게. */
const collapseSpaces = (value: string) => value.trim().replace(/\s+/g, " ");

export const ProfileSchema = z.object({
  name: z
    .string()
    .transform(collapseSpaces)
    .refine((v) => v.length >= 2, { error: "실명을 2자 이상 입력해 주세요." })
    .refine((v) => v.length <= NAME_MAX, {
      error: `실명은 ${NAME_MAX}자를 넘을 수 없습니다.`,
    })
    .refine((v) => NO_CONTROL_CHARS.test(v), {
      error: "실명에 사용할 수 없는 문자가 있습니다.",
    }),
  nickname: z
    .string()
    .transform(collapseSpaces)
    .refine((v) => v.length >= 2, { error: "닉네임을 2자 이상 입력해 주세요." })
    .refine((v) => v.length <= NICKNAME_MAX, {
      error: `닉네임은 ${NICKNAME_MAX}자를 넘을 수 없습니다.`,
    })
    .refine((v) => NO_CONTROL_CHARS.test(v), {
      error: "닉네임에 사용할 수 없는 문자가 있습니다.",
    }),
});

export interface ProfileFieldErrors {
  name?: string[];
  nickname?: string[];
}
