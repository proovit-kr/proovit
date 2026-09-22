import { z } from "@/lib/z";

/*
  참가 신청(/apply)의 **규칙**만 둔다. 저장은 apply-store.ts다.

  ⚠️ 나누는 이유는 profile.ts / profile-store.ts와 같다 — 이 파일을 클라이언트
  컴포넌트(ApplyForm)가 maxLength·전화번호 표기 때문에 import하는데, 여기에
  prisma가 같이 있으면 클라이언트 번들이 node:module을 끌어와 빌드가 깨진다.

  필드의 출처:
    teamName·ideaTitle·ideaSummary → 「개인정보 수집 및 이용 동의문」 문안 C가
      수집 항목으로 명시한 "팀명 / 참가작 정보(명칭·URL·소개)"
    track       → 시안 ver4 ①의 「트랙 선택」. 받아서 **검사만 하고 저장하지 않는다**
    inviteEmail → 시안 ver4 ①의 「팀원 초대 이메일」. 「혼자 참가」를 풀었을 때만 받는다

  phone → **뺐다(2026-09-21 수연 결정).**

    08-12에는 여기서 전원에게 받았다. 카카오 동의항목을 필수로 걸면 미동의자가
    로그인 자체를 못 하므로, 진입로가 아니라 참가 신청 요건으로 돌린다는
    판단이었다(근거는 노션 DEV3에 그대로 있다).

    뒤집힌 이유 셋:
      · 동의문 문안 C의 수집 항목이 「연락처(휴대전화 **또는** 이메일)」다.
        이메일만 받아도 동의문이 약속한 범위 안이다.
      · 통지 정본은 email·inapp이다(schema.prisma의 notifications.channel 주석).
        알림톡은 users.phone이 있을 때만 얹는 **보조**지 정본이 아니다.
      · 그 보조가 지금 막혀 있다 — 사업자 등록 전까지 알림톡을 못 쓴다.
    셋을 합치면 신청 자리에서 번호를 받아도 쓸 데가 없다.

    users.phone 컬럼과 normalizePhone·formatPhone·PhoneSchema는 **남긴다.**
    카카오가 인증해 넘겨주는 값이고, 설정 화면이 나중에 받을 자리다.

  여기 **없는** 것:
    serviceUrl  → 신청 시점에는 아직 배포한 것이 없다. 측정 연동에서 받는다
    chargeType  → 심사 기준서가 "s1 제출 폼에서 받고 이후 변경 불가"로 잡았다
    trackId     → 시즌1은 단일 트랙(아래 TRACK 주석)
*/

/**
 * teams.name = VarChar(60).
 *
 * 09-21 시안대로 60이다. 옛 근거는 리더보드 폭이라 20자로 끊었는데, 시안 라벨이
 * 「팀명 최대 60자」여서 그대로 두면 라벨이 거짓말이 된다. 긴 이름이 행을 미는
 * 문제는 입력을 막는 쪽이 아니라 **화면에서 잘라서** 막는다.
 */
export const TEAM_NAME_MAX = 60;
/**
 * entries.idea_title = VarChar(120).
 *
 * 위와 같다 — 09-21 시안대로 120이다. 옛 근거는 참가작 카드·리더보드 폭이었다.
 */
export const IDEA_TITLE_MAX = 120;
/** 한 줄 소개. DB는 Text지만 "한 줄"이 요건이라 화면에서 끊는다. */
export const IDEA_SUMMARY_MAX = 200;
/** team_invitations.email과 같은 한도. 참가 신청과 팀 관리의 초대 칸이 함께 쓴다. */
export const INVITE_EMAIL_MAX = 200;

const NO_CONTROL_CHARS = /^[^\p{Cc}\p{Cf}]+$/u;
const collapseSpaces = (value: string) => value.trim().replace(/\s+/g, " ");

/*
  전화번호 정규화.

  카카오가 주는 값은 `+82 10-1234-5678` 형태이고 발송사(알림톡·SMS)는
  `01012345678`을 받는다. 저장 형식을 하나로 고정하지 않으면 같은 번호가
  여러 모양으로 쌓여 중복 판정도, 발송도 어긋난다.

  ⚠️ 국내 휴대폰만 받는다. 마감 통지가 알림톡·SMS로 나가는데 해외 번호는
  그 경로가 없다. 해외 참가자가 생기면 이메일 통지로 갈음하는 예외를 따로 판단한다.

  ⚠️ **참가 신청은 이 셋을 더 이상 쓰지 않는다**(머리 주석의 phone 항목).
  users.phone과 설정 화면이 쓸 자리라 남겨 둔 것이다.
*/
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  // +82 10-…  →  국가번호를 떼고 0을 붙인다
  if (digits.startsWith("82")) return `0${digits.slice(2)}`;
  return digits;
}

const PHONE_PATTERN = /^01[016789]\d{7,8}$/;

/** 휴대전화 한 칸의 규칙. 받는 화면이 생기면 이걸 그대로 끼운다. */
export const PhoneSchema = z
  .string()
  .transform(normalizePhone)
  .refine((v) => v.length > 0, {
    error: "연락처를 입력해 주세요.",
  })
  .refine((v) => PHONE_PATTERN.test(v), {
    error: "휴대전화 번호를 정확히 입력해 주세요. (예: 010-1234-5678)",
  });

/*
  ── 트랙 ─────────────────────────────────────────────────────

  시안 ①이 라디오 둘을 그린다 — 「자유 주제」와 「테마 트랙」이고 뒤엣것은
  `disabled`에 "스폰서 협의 중, 시즌 2부터"다.

  ⚠️ **받은 값을 저장하지 않는다.** 시즌1은 단일 트랙이라 `entries.trackId`는
  null로 남는다(schema.prisma의 Track 주석). 고를 것이 하나뿐인데 tracks 행을
  만들어 붙이면, 시즌2에서 진짜 트랙이 생겼을 때 "시즌1의 자유 주제"라는
  가짜 트랙이 먼저 들어앉아 시즌 간 비교가 어긋난다.

  ⚠️ 그래도 **검사는 한다.** 화면이 `disabled`인 것은 서버의 방어선이 아니다 —
  서버 액션은 그 자체로 호출 가능한 엔드포인트라 `theme`이 그냥 들어올 수 있다.
  저장하지 않는 값이라도 "받지 않기로 한 값"을 조용히 통과시키면, 나중에
  저장을 켜는 순간 그때까지 들어온 쓰레기가 같이 살아난다.
*/
export const APPLY_TRACKS = ["free", "theme"] as const;
export type ApplyTrack = (typeof APPLY_TRACKS)[number];

export const ApplySchema = z.object({
  /** 1인 참가도 1인 팀으로 통일한다. 참가 단위가 둘이면 심사·지표·시상이 두 갈래가 된다. */
  isSolo: z.boolean(),

  track: z
    .enum(APPLY_TRACKS, { error: "트랙을 선택해 주세요." })
    .refine((v) => v === "free", {
      error: "테마 트랙은 시즌 2부터 열려요. 자유 주제로 신청해 주세요.",
    }),

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
});

export type ApplyValues = z.input<typeof ApplySchema>;

export interface ApplyFieldErrors {
  track?: string[];
  teamName?: string[];
  ideaTitle?: string[];
  ideaSummary?: string[];
  inviteEmail?: string[];
}

/*
  ── 팀원 초대 이메일 ──────────────────────────────────────────

  ApplySchema에 넣지 않은 이유는 **본인 주소인지를 스키마가 모르기 때문**이다.
  세션의 이메일이 있어야 판정이 서는데, 그걸 스키마에 밀어 넣으면 폼 규칙
  하나가 세션을 알게 된다. 한 필드의 규칙이 두 군데로 갈리는 것보다 이 칸만
  통째로 여기 두는 편이 낫다 — 서버도 화면도 같은 함수를 부른다.

  시안 라벨이 「본인 제외 1인」이다. 정원이 2인이라(MAX_TEAM_SIZE) 초대 칸도
  하나뿐이고, 여기서는 한 주소만 받는다.
*/
const InviteEmailFormat = z.email();

/** 이메일 두 개가 같은 사람인가. 도메인·로컬파트 모두 대소문자를 무시한다. */
function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * 초대 이메일 규칙. 통과하면 null, 아니면 화면에 붙일 문구 하나를 준다.
 *
 * 「혼자 참가」면 아예 보지 않는다 — 시안이 그때 칸을 감추므로 빈 값이 정상이고,
 * 사람이 팀으로 적다가 혼자로 바꿔도 남은 글자 때문에 막히면 안 된다.
 */
export function validateInviteEmail(args: {
  isSolo: boolean;
  inviteEmail: string;
  /** 신청하는 본인(세션)의 주소 */
  selfEmail: string;
}): string | null {
  if (args.isSolo) return null;

  const value = args.inviteEmail.trim();
  if (value.length === 0) {
    return "팀원의 이메일을 입력해 주세요. 혼자 참가하려면 「혼자 참가」를 선택해 주세요.";
  }
  if (value.length > INVITE_EMAIL_MAX) {
    return `이메일은 ${INVITE_EMAIL_MAX}자를 넘을 수 없습니다.`;
  }
  if (!InviteEmailFormat.safeParse(value).success) {
    return "이메일 형식이 아닙니다.";
  }
  /*
    본인 주소는 막는다. 초대를 수락하는 쪽에서 ALREADY_MEMBER로 걸리기는 하지만,
    그때는 이미 메일이 한 통 나간 뒤라 "초대했는데 안 들어와지네"가 된다.
  */
  if (sameEmail(value, args.selfEmail)) {
    return "본인 주소는 초대할 수 없어요. 팀원의 이메일을 적어 주세요.";
  }
  return null;
}

/** 저장된 번호(01012345678)를 화면에 보여줄 때 쓴다. */
export function formatPhone(value: string): string {
  const d = normalizePhone(value);
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return value;
}
