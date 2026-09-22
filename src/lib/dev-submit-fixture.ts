import type { Prisma } from "@/generated/prisma/client";

/*
  스테이지 제출 화면 검토용 제출물 — 시안 ver4 `#scr-submit` 목업 그대로.

  ⚠️ **화면 검토용 dev 데이터다.** 개발 바 「제출」 줄(dev-sandbox.ts
  `setSandboxSubmit`)과 대조 스크립트(`scripts/design-diff/submit-state.mts`)가
  이 값을 심어 시안과 글자까지 같게 본다. 운영에서는 참가팀이 쓴 값만 들어온다.

  모양은 submission.ts의 스키마를 따른다(`toForm`이 그대로 편다).
*/

export const SPEC_S1: Prisma.InputJsonObject = {
  concept: "1인 카페 사장님을 위한 시그니처 레시피 구독",
  persona:
    "개업 1~3년차 1인 카페 사장님. 주 2회 신메뉴 원가를 엑셀로 계산하다 포기한 적 있고, 레시피 유료 강의를 한 번 이상 결제한 적 있음.",
  problem:
    "1인 카페 사장님은 매주 신메뉴를 개발해야 하지만 원가 계산과 레시피 검증까지 혼자 하기 벅차다",
  problemDoc:
    "신메뉴 개발에 매주 3시간 이상 쓰지만, 원가 계산과 레시피 검증까지 혼자 하기 벅찬 1인 카페 사장님이 대상이에요. 빈도는 주 1~2회, 강도는 \"개발을 포기하고 프랜차이즈 메뉴를 베낀다\"는 수준이에요…",
  surveyCount: "인터뷰 6명",
  surveyChannel: "카페 사장님 오픈채팅 2곳, 인스타 DM",
  surveyStranger: "all",
  surveySummary:
    "6명 중 5명이 \"원가표를 같이 주면 돈 낼 의향 있다\"고 답함. 레시피 자체보다 원가표와 재료 대체안에 반응이 큼.",
  hypothesisChange:
    "초기 가설은 \"레시피 구독\"이었으나 조사 결과 \"원가표 포함 레시피 구독\"으로 수정. 재료 대체안을 핵심 기능 후보에 추가.",
  alternatives: [
    { name: "유튜브 레시피 영상", pain: "원가 계산이 없고 카페용 분량이 아님" },
    { name: "엑셀 수작업 원가표", pain: "매주 3시간, 재료비 변동 반영이 안 됨" },
  ],
  differentiation:
    "레시피와 원가표를 한 장으로 묶어 보내고, 주간 재료 시세를 반영해 대체 재료를 제안. 영상과 엑셀 어느 쪽도 이걸 못 함.",
  coreFeature: "주 1회 레시피와 원가표 메일 발송",
  notBuilding: ["커뮤니티 게시판", "모바일 앱"],
  buildPlan:
    "3주차: Lovable로 랜딩 변환, 가입 폼, 메일 발송 자동화. 4주차: 원가표 템플릿, 결제 페이지. 리스크: 메일 발송 한도. 대응: 무료 티어 500통 내 운영, 초과 시 수동 발송.",
  timeline:
    "09.28 등록, 09.29 랜딩 배포, 09.30 오픈채팅 포스팅 2곳, 10.01 인터뷰 3건, 10.02 인터뷰 3건과 문서 제출.",
  pricing: "1인 카페 사장님, 월 9,900원, 주 1회 레시피와 원가표 (유사 서비스 월 1~3만 원 참고)",
  monetizationPlan:
    "4주차에 결제 페이지를 열고, 5주차 레이스 안에 첫 유료 결제 3건 확보를 목표로 함.",
  riskiest: "사장님들이 레시피에 월 구독료를 낼 의사가 있다",
  guideChecks: [true, true, true],
  memo: "",
};

/** 랜딩 주소는 팀 주소다 — 호스트를 받아 만든다 */
export const specS2 = (host: string): Prisma.InputJsonObject => ({
  landingUrl: `https://${host}`,
  channels: ["스레드", "카카오 오픈채팅"],
  postUrl: "https://www.threads.net/@little_potion/post/…",
  guideChecks: [true, true, true],
  memo: "두 번째 포스팅이 첫 번째보다 반응이 좋았음. 다음엔 원가표 이미지를 먼저 보여줄 것.",
});

/** s3 임시저장 — 시안은 A1~A5만 켜고 가입 토글이 꺼진 모양이다 */
export const specS3 = (host: string, submitted: boolean): Prisma.InputJsonObject => ({
  serviceUrl: `https://${host}`,
  builder: "replit",
  signupConnected: submitted,
  paymentReturnRegistered: submitted,
  launchChecks: submitted
    ? Array.from({ length: 10 }, () => true)
    : [true, true, true, true, true, false, false, false, false, false],
  aiFeature: false,
  aiChecks: Array.from({ length: 5 }, () => false),
  guideChecks: submitted ? [true, true, true] : [true, false, false],
  memo: "",
});

/** s4 주간 — 시안의 「2주차 작성 중」 내용. dev 일정은 s4가 한 주라 1주차에 심는다 */
export const SPEC_S4: Prisma.InputJsonObject = {
  activity: "스레드 연재 3편 발행, 카페 사장님 오픈채팅 2곳에 소개, 첫 유료 문의 1건 응대",
  channels: ["인스타 릴스"],
  improved: "가입 폼 필드 6개 → 2개로 축소",
  guideChecks: [true, true, false],
  memo: "",
};

/** 시안 s2 `.ro` — 방문자 471 · 사전 신청자 24(5.1%). 허브 h4와 같은 수 */
export const SPEC_S2_VISITORS = 471;
export const SPEC_S2_LEADS = 24;

/** 시안 s4 `.ro` — 방문 214 · 가입 38 */
export const SPEC_S4_VISITORS = 214;
export const SPEC_S4_SIGNUPS = 38;
