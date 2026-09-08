import { z } from "@/lib/z";

/*
  참가 신청(/apply)의 **규칙**만 둔다. 저장은 apply-store.ts다.

  ⚠️ 나누는 이유는 profile.ts / profile-store.ts와 같다 — 이 파일을 클라이언트
  컴포넌트(ApplyForm)가 maxLength·전화번호 표기 때문에 import하는데, 여기에
  prisma가 같이 있으면 클라이언트 번들이 node:module을 끌어와 빌드가 깨진다.

  필드의 출처:
    teamName·ideaTitle·ideaSummary → 「개인정보 수집 및 이용 동의문」 문안 C가
      수집 항목으로 명시한 "팀명 / 참가작 정보(명칭·URL·소개)"
    phone → 2026-08-12 결정. 로그인 요건이 아니라 참가 신청 요건이다.
      카카오 동의항목을 필수로 걸면 미동의자가 로그인 자체를 못 하므로
      진입로가 아니라 여기서 전원에게 받는다.

  여기 **없는** 것:
    serviceUrl  → 신청 시점에는 아직 배포한 것이 없다. 측정 연동에서 받는다
    chargeType  → 심사 기준서가 "s1 제출 폼에서 받고 이후 변경 불가"로 잡았다
    trackId     → 시즌1은 단일 트랙
*/

/** teams.name은 60자까지 들어가지만 화면에서는 20자로 끊는다 — 리더보드 행에 뜨는 값이다. */
export const TEAM_NAME_MAX = 20;
/** entries.idea_title = VarChar(120). 참가작 카드·OG 카드에 들어가므로 화면은 더 짧게 잡는다. */
export const IDEA_TITLE_MAX = 60;
/** 한 줄 소개. DB는 Text지만 "한 줄"이 요건이라 화면에서 끊는다. */
export const IDEA_SUMMARY_MAX = 200;

const NO_CONTROL_CHARS = /^[^\p{Cc}\p{Cf}]+$/u;
const collapseSpaces = (value: string) => value.trim().replace(/\s+/g, " ");

/*
  전화번호 정규화.

  카카오가 주는 값은 `+82 10-1234-5678` 형태이고 발송사(알림톡·SMS)는
  `01012345678`을 받는다. 저장 형식을 하나로 고정하지 않으면 같은 번호가
  여러 모양으로 쌓여 중복 판정도, 발송도 어긋난다.

  ⚠️ 국내 휴대폰만 받는다. 마감 통지가 알림톡·SMS로 나가는데 해외 번호는
  그 경로가 없다. 해외 참가자가 생기면 이메일 통지로 갈음하는 예외를 따로 판단한다.
*/
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  // +82 10-…  →  국가번호를 떼고 0을 붙인다
  if (digits.startsWith("82")) return `0${digits.slice(2)}`;
  return digits;
}

const PHONE_PATTERN = /^01[016789]\d{7,8}$/;

export const ApplySchema = z.object({
  /** 1인 참가도 1인 팀으로 통일한다. 참가 단위가 둘이면 심사·지표·시상이 두 갈래가 된다. */
  isSolo: z.boolean(),

  teamName: z
    .string()
    .transform(collapseSpaces)
    .refine((v) => v.length >= 2, { error: "팀 이름을 2자 이상 입력해 주세요." })
    .refine((v) => v.length <= TEAM_NAME_MAX, {
      error: `팀 이름은 ${TEAM_NAME_MAX}자를 넘을 수 없습니다.`,
    })
    .refine((v) => NO_CONTROL_CHARS.test(v), {
      error: "팀 이름에 사용할 수 없는 문자가 있습니다.",
    }),

  ideaTitle: z
    .string()
    .transform(collapseSpaces)
    .refine((v) => v.length >= 2, {
      error: "참가작 이름을 2자 이상 입력해 주세요.",
    })
    .refine((v) => v.length <= IDEA_TITLE_MAX, {
      error: `참가작 이름은 ${IDEA_TITLE_MAX}자를 넘을 수 없습니다.`,
    })
    .refine((v) => NO_CONTROL_CHARS.test(v), {
      error: "참가작 이름에 사용할 수 없는 문자가 있습니다.",
    }),

  /*
    한 줄 소개는 선택이다. 신청 시점에 아이디어가 한 줄로 정리되지 않았다고
    접수를 막을 이유가 없고, 참가작 페이지는 배포 단계에서 다시 손본다.
  */
  ideaSummary: z
    .string()
    .transform((v) => v.trim())
    .refine((v) => v.length <= IDEA_SUMMARY_MAX, {
      error: `한 줄 소개는 ${IDEA_SUMMARY_MAX}자를 넘을 수 없습니다.`,
    }),

  phone: z
    .string()
    .transform(normalizePhone)
    .refine((v) => v.length > 0, {
      error: "연락처를 입력해 주세요.",
    })
    .refine((v) => PHONE_PATTERN.test(v), {
      error: "휴대전화 번호를 정확히 입력해 주세요. (예: 010-1234-5678)",
    }),
});

export type ApplyValues = z.input<typeof ApplySchema>;

export interface ApplyFieldErrors {
  teamName?: string[];
  ideaTitle?: string[];
  ideaSummary?: string[];
  phone?: string[];
}

/** 저장된 번호(01012345678)를 화면에 보여줄 때 쓴다. */
export function formatPhone(value: string): string {
  const d = normalizePhone(value);
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return value;
}
