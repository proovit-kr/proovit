/*
  이의신청·소명의 **순수** 절반. 화면(클라이언트)도 읽는다.

  ⚠️ 창구가 셋이다. 스키마가 그렇게 갈라놨고 근거 조항도 다르다.
    ① `appeals`            — 판정·제재 **결정 후** 정식 이의신청 (제11조)
    ② `sanctions.appeal_text` — 제재 **적용 전** 소명 (제16조 ①)
    ③ `abuse_flags.appeal_text` — 어뷰징 플래그에 대한 소명

  참가자에게는 화면 하나로 보이게 한다 — 자기가 어느 조항에 걸렸는지 알고 창구를
  고르는 사람은 없다. 어느 표에 쓰는지는 대상을 고르면 정해진다.
*/

/** 이의신청 사유 최소 길이. 한 줄짜리 항의는 심사 근거를 다시 볼 재료가 못 된다 */
export const APPEAL_REASON_MIN = 20;
export const APPEAL_REASON_MAX = 2000;

/** 제11조 ② — 운영자는 접수 후 5영업일 이내에 서면으로 답변한다 */
export const RESPONSE_BUSINESS_DAYS = 5;

/**
 * 제11조 ① — 참가자는 **판정 통지 후** 5영업일 이내에 이의신청을 접수한다.
 *
 * 위의 답변 기한과 우연히 같은 값이지만 다른 조항이다. 한 상수로 묶으면
 * 한쪽이 바뀔 때 다른 쪽도 같이 움직인다.
 */
export const APPEAL_BUSINESS_DAYS = 5;

/**
 * 영업일 더하기.
 *
 * 스키마 주석이 "영업일 계산은 애플리케이션이 한다"고 못박아 둔 자리다.
 *
 * ⚠️ **공휴일은 못 센다.** 달력 데이터가 없어서 주말만 건너뛴다 — 그래서 실제
 * 기한은 여기 값보다 늦어질 수 있고, 그건 참가자에게 유리한 방향이라 지금은
 * 이대로 둔다. 공휴일 표가 생기면 이 함수만 고친다.
 */
export function addBusinessDays(from: Date, days: number): Date {
  const result = new Date(from);
  let left = days;
  while (left > 0) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return result;
}

/** 무엇에 대한 이의신청인가 */
export type AppealTargetType = "judgment" | "abuse_flag";

export type AppealFailureCode =
  | "TARGET_NOT_FOUND"
  | "ALREADY_APPEALED"
  | "REASON_TOO_SHORT"
  | "NOT_APPEALABLE";

export const APPEAL_FAILURE_MESSAGE: Record<AppealFailureCode, string> = {
  TARGET_NOT_FOUND: "그 대상을 찾을 수 없어요.",
  ALREADY_APPEALED: "이미 이의신청이 접수됐어요. 답변을 기다려 주세요.",
  REASON_TOO_SHORT: `사유를 ${APPEAL_REASON_MIN}자 이상 적어 주세요. 어느 지표·어느 판단이 어떻게 잘못됐는지가 있어야 다시 볼 수 있어요.`,
  NOT_APPEALABLE: "지금은 이의신청을 받을 수 없는 대상이에요.",
};

/**
 * 그날의 끝(서울 23:59). 「통지 후 5영업일 이내」의 끝은 그날의 끝이다 —
 * 허브 h12와 심사 결과 ③이 같은 기한을 적는다.
 */
export function endOfSeoulDay(at: Date): Date {
  const kst = new Date(at.getTime() + 9 * 60 * 60 * 1000);
  const midnight = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
  return new Date(midnight + (24 * 60 - 9 * 60 - 1) * 60_000);
}
