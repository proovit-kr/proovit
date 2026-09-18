import { z } from "@/lib/z";

import { MEMO_MAX } from "@/lib/submission";

/*
  s2·s4·s5 제출의 순수 절반 — 길이·형식 규칙과 화면 문구.

  ⚠️ **왜 `src/lib/submission.ts`가 아니라 여기인가.** s1·s3은 그 파일에 있다.
  본래는 같은 자리에 두는 것이 맞고, 이 셋도 거기로 옮겨야 한다. 지금 라우트
  안에 둔 것은 이 화면들을 급히 채우는 동안 `src/lib/`을 다른 작업이 쥐고 있었기
  때문이다. **옮길 때 고칠 자리는 import 경로뿐이다** — 스키마 모양은 s1·s3과
  같게 맞춰 두었다.

  근거는 PLN6 필드 정의서 3장(공통)·4장(스테이지별)과 디자인 시안 ver4의
  `#scr-submit` 블록이다. 표에 없는 칸을 여기서 만들지 않는다.

  ⚠️ **지표 칸은 스키마에 없다.** s2의 방문자·사전 신청자, s4의 주간 방문·가입,
  s5의 최종 지표는 전부 엣지가 세는 값이라 **참가자가 입력하지 않는다**(랜딩이
  약속한 「참가자가 숫자를 입력하지 않는다」가 이 자리의 규칙이다). 화면은 읽어서
  보여주기만 하고, 그래서 제출 payload에 들어갈 것이 없다.
*/

export const CHANNEL_MAX = 40;
export const CHANNEL_COUNT_MAX = 8;
export const LINK_MAX = 500;
export const ACTIVITY_MAX = 1000;
export const IMPROVED_MAX = 200;
export const RETRO_MAX = 2000;

/* 가이드 완료 체크는 스테이지마다 개수가 고정이다 — 순서가 곧 뜻이라 배열로 센다 */
export const S2_GUIDE_CHECKS = [
  "수요검증 랜딩 배포 완료",
  "스레드 포스팅 1개 이상 발행",
  "사전 신청 폼에 유입 경로 문항 포함",
];

export const S4_GUIDE_CHECKS = [
  "이번 주 유입 채널 1개 이상 새로 시도",
  "내 지표에서 이탈 지점 1개 확인",
  "확인한 이탈 지점 1개 개선",
];

export const S5_GUIDE_CHECKS = [
  "결제사 정산 화면 원본 준비 (수익화 시)",
  "회고 작성",
  "공개 동의 확인",
];

/* 화면 문구. s1·s3이 `src/content/submission.ts`에서 읽는 것과 같은 모양이다 */
export const S2_FIELDS = {
  landingUrl: {
    label: "랜딩 주소",
    hint: "팀명.proovit.kr 이어야 방문과 사전 신청이 집계됩니다.",
  },
  channels: {
    label: "홍보한 채널",
    hint: "s1에서 정한 페르소나 채널과 대조됩니다. 최소 한 개.",
  },
  postUrl: {
    label: "배포 채널 포스팅 링크",
    hint: "발행한 글 주소 하나를 적습니다.",
  },
};

export const S4_FIELDS = {
  activity: {
    label: "그 주에 한 활동",
    hint: "무엇을 했는지 사실만 적습니다. 지표는 따로 세고 있습니다.",
  },
  channels: { label: "새로 쓴 유입 채널", hint: "선택입니다." },
  improved: {
    label: "개선한 이탈 지점",
    hint: "선택입니다. 내 지표에서 확인한 자리를 적습니다.",
  },
};

export const S5_FIELDS = {
  retro: {
    label: "회고",
    hint: "5주 동안 무엇을 배웠는지. 시즌 리포트에 실릴 수 있습니다.",
  },
};

/* 주소는 s3의 ServiceUrlSchema와 같은 이유로 https만 받는다 */
const httpsUrl = (message: string) =>
  z
    .string()
    .trim()
    .min(1, message)
    .max(LINK_MAX)
    .refine(
      (value) => value.startsWith("https://"),
      "https:// 로 시작하는 주소여야 해요.",
    );

const channelList = z
  .array(z.string().trim().max(CHANNEL_MAX))
  .max(CHANNEL_COUNT_MAX);

// ── s2 — 랜딩·수요조사 (GATE 1) ──────────────────────────────

export const S2Schema = z.object({
  landingUrl: httpsUrl("랜딩 주소를 적어 주세요."),
  /* 최소 한 개 — 「어디에 알렸는가」가 수요 신호의 출처다 */
  channels: channelList.refine(
    (list) => list.filter((item) => item.trim()).length > 0,
    "홍보한 채널을 최소 한 개 적어 주세요.",
  ),
  postUrl: httpsUrl("포스팅 링크를 적어 주세요."),
  guideChecks: z.array(z.boolean()),
  memo: z.string().trim().max(MEMO_MAX).optional(),
});

export const S2DraftSchema = z.object({
  landingUrl: z.string().trim().max(LINK_MAX),
  channels: channelList,
  postUrl: z.string().trim().max(LINK_MAX),
  guideChecks: z.array(z.boolean()),
  memo: z.string().trim().max(MEMO_MAX).optional(),
});

export type S2Payload = z.infer<typeof S2Schema>;

// ── s4 — 마케팅과 유저 유입 (주간 반복) ──────────────────────

export const S4Schema = z.object({
  activity: z
    .string()
    .trim()
    .min(1, "이번 주에 한 활동을 적어 주세요.")
    .max(ACTIVITY_MAX, `${ACTIVITY_MAX}자까지 쓸 수 있어요.`),
  channels: channelList,
  improved: z.string().trim().max(IMPROVED_MAX).optional(),
  guideChecks: z.array(z.boolean()),
  memo: z.string().trim().max(MEMO_MAX).optional(),
});

export const S4DraftSchema = z.object({
  activity: z.string().trim().max(ACTIVITY_MAX),
  channels: channelList,
  improved: z.string().trim().max(IMPROVED_MAX).optional(),
  guideChecks: z.array(z.boolean()),
  memo: z.string().trim().max(MEMO_MAX).optional(),
});

export type S4Payload = z.infer<typeof S4Schema>;

// ── s5 — 트래픽과 매출 (GATE 2) ──────────────────────────────

/*
  s5는 입력이 아니라 **확인**이다(시안 info-strip: 「이 화면의 제출은 확인 버튼
  역할」). 최종 지표는 11.01 24:00에 자동 확정되므로 여기서 받는 것은 그 지표를
  어떻게 읽어야 하는지에 대한 참가팀의 신고 둘(수익화 시도·결제 연동)과 회고,
  그리고 아카이브 공개 동의다.
*/
export const S5Schema = z.object({
  monetized: z.boolean(),
  paymentConnected: z.boolean(),
  retro: z
    .string()
    .trim()
    .min(1, "회고를 적어 주세요.")
    .max(RETRO_MAX, `${RETRO_MAX}자까지 쓸 수 있어요.`),
  guideChecks: z.array(z.boolean()),
  /* 필수 동의다. 스키마에서 true를 강제한다 — 아카이브 공개의 근거가 이 값뿐이다 */
  archiveConsent: z
    .boolean()
    .refine((value) => value, "아카이브 공개 동의가 필요해요."),
  memo: z.string().trim().max(MEMO_MAX).optional(),
});

export const S5DraftSchema = z.object({
  monetized: z.boolean(),
  paymentConnected: z.boolean(),
  retro: z.string().trim().max(RETRO_MAX),
  guideChecks: z.array(z.boolean()),
  archiveConsent: z.boolean(),
  memo: z.string().trim().max(MEMO_MAX).optional(),
});

export type S5Payload = z.infer<typeof S5Schema>;

/**
 * 가이드 완료 체크가 전부 켜졌는가.
 *
 * ⚠️ 스키마로는 못 잡는다 — 체크박스는 타입이 boolean이라 **전부 false여도
 * 통과한다**(s3의 `s3Missing`이 같은 이유로 있다). 화면과 서버가 같은 함수를
 * 불러야 버튼을 잠그는 조건과 거절하는 조건이 갈리지 않는다.
 */
export function guideIncomplete(checks: boolean[], count: number): boolean {
  return checks.length !== count || !checks.every(Boolean);
}
