/**
 * 랜딩 페이지 문구.
 *
 * legacy/vite-prototype/src/mocks/index.ts 에서 옮겨왔다.
 * 목데이터가 아니라 실제로 노출되는 카피이므로 mocks가 아닌 content에 둔다.
 * 문구 수정은 팀장(이윤서) 소관이다.
 */

export interface SeasonStageInfo {
  key: string;
  n: number;
  label: string;
  week: string;
  description: string;
  /** 이 스테이지 끝에 심사 게이트가 있으면 그 이름. 시즌1은 2회뿐이다 */
  gate?: string;
}

/**
 * 시즌 단계 표시용.
 *
 * 3회차 회의(8/5) 확정 — **시즌1 = 5주 · STAGE 1~5**, 게이트는 2회뿐이다.
 * 2회차의 "6주 → 4주"를 거쳐 3회차에서 "4주 → 5 Stage(전체 5주 고정)"로 다시 정해졌다.
 *
 * 심사를 트랙의 별도 칸으로 두지 않는다. 게이트는 스테이지에 붙는 것이고,
 * 제출 2회(step1·step2)와 게이트 2회가 1:1로 대응한다(동혁 요구사항 명세서 용어표).
 *
 * TODO: 지금은 상수다. 03 ERD의 `stages` 테이블이 생기면 DB에서 읽어야 한다.
 * 06 §4에 따르면 stages는 크론이 페이즈를 넘기는 유일한 입력값이라 결국 DB로 가야 한다.
 * 날짜는 여기 두지 않는다 — 시즌1 캘린더(9/28~11/1)는 「제휴 프로그램 신청」(윤서
 * 2026-08-07)의 개최일 9/28 + 5주이고, 마감 시각의 정본은 `stages.opensAt`/`closesAt`
 * 이어야 한다(명세서 3.1.2).
 * ⚠️ WBS 07(8/6)의 9/7~10/11은 낡은 값이다. 추석 때문에 8/7에 9/28로 옮겼는데
 * WBS와 허브가 안 고쳐져 있다. 8/16 사용자 결정으로 9/28을 따른다.
 */
export const SEASON_STAGES: SeasonStageInfo[] = [
  {
    key: "S1",
    n: 1,
    label: "등록·아이디어 고도화",
    week: "1주차",
    description: "아이디어를 실행 가능한 형태로 다듬어요.",
  },
  {
    key: "S2",
    n: 2,
    label: "랜딩·수요조사",
    week: "2주차",
    description: "아이디어의 수요를 데이터로 먼저 확인해요.",
    gate: "1차 심사 — 사업성",
  },
  {
    key: "S3",
    n: 3,
    label: "AI 빌드·배포",
    week: "3주차",
    description: "AI 빌더로 실제 서비스를 만들어 배포해요.",
  },
  {
    key: "S4",
    n: 4,
    label: "마케팅·유저 유입",
    week: "4주차",
    description: "가이드를 따라 직접 유저를 모아요.",
  },
  {
    key: "S5",
    n: 5,
    label: "트래픽·매출",
    week: "5주차",
    description: "실측 지표로 리더보드에서 최종 순위를 겨뤄요.",
    gate: "최종 심사 — 실행",
  },
];

export const LANDING_FAQ = [
  {
    q: "코딩을 못 해도 되나요?",
    a: "네, AI 빌더와 스텝별 가이드로 첫 서비스를 완성할 수 있어요.",
  },
  {
    q: "지표는 어떻게 검증하나요?",
    a: "애널리틱스 원본을 제출받아 운영진이 확인한 뒤 리더보드에 반영해요.",
  },
  {
    q: "상금은 어디서 나오나요?",
    a: "참가비가 아니라 스폰서십과 자체 재원으로만 마련해요.",
  },
  {
    q: "1차에서 떨어지면 끝인가요?",
    a: "아니요, 테스터로 시즌에 계속 참여하고 다음 시즌에 재도전할 수 있어요.",
  },
];

export const LANDING_BENEFITS = [
  {
    title: "스텝별 골든패스 가이드",
    desc: "수요조사부터 빌드·배포·마케팅까지 따라만 하면 돼요.",
  },
  { title: "AI 빌더·API 크레딧", desc: "스테이지를 통과할수록 잠금이 풀려요." },
  { title: "상금과 공개 리더보드", desc: "시즌 성과가 그대로 포트폴리오가 돼요." },
];

export const LANDING_WHY = [
  { no: "01", title: "전 과정 온라인", desc: "어디서든 같은 무대에서 경쟁해요." },
  { no: "02", title: "5주 실측 경쟁", desc: "발표가 아니라 데이터로 평가받아요." },
  {
    no: "03",
    title: "아이디어만 있으면 돼요",
    desc: "코딩 경험 없어도 가이드와 AI로 완성해요.",
  },
];

export const LANDING_CRITERIA = [
  {
    round: "ROUND 1",
    title: "1차 심사 — 사업성",
    items: ["사전 신청자 수", "랜딩 전환율", "문제 정의 명확성"],
  },
  {
    round: "FINAL",
    title: "최종 심사 — 실행",
    items: ["유효 가입자", "활성·재방문", "매출(가산점)"],
  },
];

export const COMPARE = {
  hackathon: ["8시간~1박 2일", "발표와 심사위원 점수", "출품하면 끝"],
  proovit: [
    "5주 리그",
    "실제 유저와 매출 데이터",
    "시즌이 끝나도 서비스는 남아요",
  ],
};
