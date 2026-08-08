/**
 * 사전 신청 폼의 동의 문안.
 *
 * 원본은 팀장(이윤서)의 「16. 운영규칙서」 하위 문서다. **문구는 팀장 소관이며
 * 개발이 임의로 고치지 않는다.** 여기 있는 것은 그 원본을 화면에 옮긴 사본이다.
 *   - 필수 개인정보 수집·이용 → 「개인정보 수집 및 이용 동의문」 §2 문안 A
 *   - 만 14세 이상 확인      → 「마케팅 정보 수신 동의(선택) & 만 14세 이상 확인」 §3
 *   - 선택 마케팅 수신 동의   → 같은 문서 §2
 *
 * 문안이 바뀌면 반드시 VERSION을 올린다. 고지 4요소(목적·항목·기간·거부권)가
 * 하나라도 바뀌면 기존 동의자에게 재동의를 받아야 하고(D6), 그 판단의 근거가
 * 리드에 저장된 버전 문자열이다.
 */

/** 문안 A(필수 수집·이용)의 버전. 리드의 `privacyConsentVersion`에 그대로 저장된다. */
export const PRIVACY_CONSENT_VERSION = "v1.0";

/** 마케팅 수신 동의 문안의 버전. 필수 문안과 독립적으로 개정될 수 있어 따로 둔다. */
export const MARKETING_CONSENT_VERSION = "v1.0";

export interface ConsentTableRow {
  /** 수집 항목 */
  item: string;
  /** 수집·이용 목적 */
  purpose: string;
  /**
   * 보유·이용 기간.
   * D3에 따라 화면에서 굵게 표시한다 — 법이 "중요한 내용"으로 지정한 항목이다.
   */
  period: string;
}

export interface ConsentItem {
  /** 폼 필드명이자 서버가 받는 키 */
  key: "privacy" | "age" | "marketing";
  required: boolean;
  /** 체크박스 옆 한 줄. 앞의 [필수]/[선택] 표기를 포함한다 */
  label: string;
  /** 펼쳤을 때 보이는 본문 */
  body?: string;
  table?: ConsentTableRow[];
  /** 표 아래 덧붙는 문장들 */
  notes?: string[];
}

/**
 * 사전 신청 폼에 표시할 동의 항목.
 *
 * 순서와 분리 배치가 곧 법정 요건이다(D2·M2) — 수집·이용 동의와 홍보 목적 동의는
 * 절대 한 체크박스로 묶지 않는다. 선택 항목은 기본 해제여야 한다(D4).
 */
export const PREREGISTER_CONSENTS: ConsentItem[] = [
  {
    key: "privacy",
    required: true,
    label: "[필수] 개인정보 수집·이용 동의",
    body: "PROOVIT 사전 신청 접수를 위해 아래와 같이 개인정보를 수집·이용해요.",
    table: [
      {
        item: "이메일 주소",
        purpose: "서비스 오픈 및 시즌1 모집 개시 안내 발송",
        period: "시즌1 모집 종료 후 6개월 또는 동의 철회 시까지",
      },
    ],
    notes: [
      "동의를 거부할 권리가 있어요. 다만 이 항목은 신청 접수와 안내 발송에 꼭 필요해서, 동의하지 않으면 사전 신청을 접수할 수 없어요.",
    ],
  },
  {
    key: "age",
    required: true,
    label: "[필수] 만 14세 이상입니다",
    body: "PROOVIT은 만 14세 이상만 이용할 수 있어요. 만 14세 미만은 가입할 수 없어요.",
  },
  {
    key: "marketing",
    required: false,
    label: "[선택] 마케팅 정보 수신 동의 (이메일)",
    body: "시즌 모집 소식, 이벤트, 제휴 혜택 등 광고성 정보를 이메일로 받아볼 수 있어요.",
    table: [
      {
        item: "이메일 주소",
        purpose: "시즌 모집·이벤트·제휴 소식 등 광고성 정보 발송을 위한 연락",
        period: "수신 동의 철회 시까지",
      },
    ],
    notes: [
      "동의하지 않아도 사전 신청·회원가입·시즌 참가에 아무 제한이 없어요. 마감 안내나 심사 결과처럼 서비스 이용에 꼭 필요한 알림은 동의 여부와 관계없이 보내드려요.",
      "수신 동의는 언제든 메일 하단의 수신거부 링크(무료)로 철회할 수 있어요.",
    ],
  },
];
