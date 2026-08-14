import { z } from "zod";

/*
  측정 연동의 **순수** 절반 — 주소 규칙. 화면(클라이언트)도 이 파일을 읽는다.
  저장은 measurement-store.ts에 있다.

  근거는 8/11에 확정된 신규 요구사항 3건이고, **공통 근거가 「안내문으로는 못 막는다」**다.
  참가자가 안내를 못 보고 지나가면 시즌 도중에 터지고 그때는 되돌릴 수 없다.

  차단 목록의 정본은 **「참가작 배포처 조사 보고서」(동혁, 8/9) 5장**이다 —
  금지 둘(Vercel·GitHub Pages)이 거기서 나왔고, 그 문서도 "주소 등록 단계에서
  자동 차단을 구현해야 한다"고 같은 말을 적었다.
*/

/** 참가작이 서비스되는 주소의 뿌리. 시즌1은 여기만 허용한다(ADR-007) */
export const ROOT_DOMAIN = "proovit.kr";

export const LABEL_MIN = 3;
export const LABEL_MAX = 30;

/*
  서브도메인 라벨.

  소문자·숫자·하이픈만 받는다. 대문자를 받으면 DNS에서 같은 이름이 되어 두 팀이
  같은 주소를 잡은 것처럼 보이고, 밑줄은 호스트명에서 못 쓴다.
  하이픈으로 시작·끝나는 것도 막는다(RFC 1123).
*/
const LABEL_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * 우리가 이미 쓰는 이름.
 *
 * 참가팀이 `www`나 `api`를 잡으면 우리 주소와 부딪힌다. 지금 안 쓰는 것도
 * 미리 막아둔다 — 나중에 회수하려면 참가팀의 배포 주소를 바꾸게 해야 한다.
 */
export const RESERVED_LABELS = [
  "www",
  "api",
  "admin",
  "app",
  "dashboard",
  "mail",
  "smtp",
  "ns",
  "cdn",
  "static",
  "assets",
  "docs",
  "blog",
  "status",
  "dev",
  "staging",
  "test",
  "proovit",
];

export const HostLabelSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(LABEL_MIN, `${LABEL_MIN}자 이상이어야 해요.`)
  .max(LABEL_MAX, `${LABEL_MAX}자까지 쓸 수 있어요.`)
  .refine(
    (value) => LABEL_PATTERN.test(value),
    "영문 소문자·숫자·하이픈만 쓸 수 있고, 하이픈으로 시작하거나 끝날 수 없어요.",
  )
  .refine(
    (value) => !RESERVED_LABELS.includes(value),
    "이미 쓰고 있는 이름이라 고를 수 없어요.",
  );

/*
  ⚠️ **오리진으로 쓸 수 없는 배포처.**

  근거는 8/11 결정 ②다 — Vercel·GitHub Pages는 **약관상 상업적 사용을 금지**한다.
  참가작이 결제를 붙이는 순간 약관 위반이고, 계정이 정지되면 그 팀의 지표가
  통째로 날아간다. 시즌 도중에 그렇게 되면 되돌릴 방법이 없다.

  "안내문으로 알린다"로 처리하지 않는 이유가 이것이다 — 못 보고 지나간 팀이
  치르는 대가가 시즌 탈락이다.
*/
export const BLOCKED_ORIGIN_HOSTS = [
  { suffix: ".vercel.app", label: "Vercel" },
  { suffix: ".github.io", label: "GitHub Pages" },
];

export function blockedOrigin(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  const hit = BLOCKED_ORIGIN_HOSTS.find((item) => host.endsWith(item.suffix));
  return hit ? hit.label : null;
}

/**
 * 오리진 — 참가팀이 실제로 배포한 주소.
 *
 * 우리 서브도메인이 이 주소 앞에 선다. https만 받는 이유는 s3 제출 폼과 같다
 * (출시 전 점검 A8 「전 구간 HTTPS」).
 */
export const OriginUrlSchema = z
  .string()
  .trim()
  .min(1, "배포한 주소를 적어 주세요.")
  .max(500)
  .refine(
    (value) => value.startsWith("https://"),
    "https:// 로 시작하는 주소여야 해요.",
  )
  .refine((value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }, "주소 형식이 아니에요.")
  /*
    ⚠️ 막힌 배포처 이름을 문구에 끼워 넣고 싶지만 zod의 오류 메시지는 값을
    받지 않는다. 어느 쪽이 걸렸는지는 화면이 `blockedOrigin()`으로 직접 물어
    구체적으로 알려준다 — 여기 문구는 서버 직접 호출을 막는 최종선이다.
  */
  .refine(
    (value) => blockedOrigin(value) === null,
    "Vercel·GitHub Pages는 약관에서 상업적 사용을 금지해요. 결제를 붙이는 순간 위반이 되고, 계정이 막히면 그동안의 지표가 사라집니다. 다른 배포처를 써 주세요.",
  );

export function fullHostname(label: string): string {
  return `${label}.${ROOT_DOMAIN}`;
}

export type MeasurementFailureCode =
  | "LABEL_TAKEN"
  | "LOCKED"
  | "NOT_FOUND"
  | "CUSTOM_BLOCKED";

export const MEASUREMENT_FAILURE_MESSAGE: Record<
  MeasurementFailureCode,
  string
> = {
  LABEL_TAKEN: "다른 팀이 이미 쓰고 있는 주소예요.",
  LOCKED: "소유 확인이 끝난 뒤에는 주소를 바꿀 수 없어요. 운영에 문의해 주세요.",
  NOT_FOUND: "참가 기록을 찾을 수 없어요.",
  CUSTOM_BLOCKED: `시즌1은 ${ROOT_DOMAIN} 서브도메인만 등록할 수 있어요.`,
};
