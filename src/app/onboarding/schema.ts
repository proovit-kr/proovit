import { z } from "zod";

/*
  온보딩 입력 규칙. 서버 액션(검증)과 폼(maxLength·안내문)이 같은 값을 봐야
  "화면에선 되는데 저장이 안 되는" 상태가 생기지 않는다.
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

export const OnboardingSchema = z.object({
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

export type OnboardingInput = z.infer<typeof OnboardingSchema>;
