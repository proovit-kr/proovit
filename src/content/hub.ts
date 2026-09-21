/*
  대시보드 허브에 실제로 나가는 문구 — 시안 `#scr-hub` h1~h9.

  ⚠️ **문구의 정본은 시안이다.** 여기 있는 문장은 시안에서 그대로 옮긴 것이고,
  시안에 없는 자리(온보딩의 두 번째 단계 등)만 만들어 썼다. 만든 문장에는
  「시안에 없다」를 주석으로 남긴다.

  ⚠️ **골든패스 항목은 제출 폼의 가이드 체크와 순서가 1:1이다.** 문구는 허브가
  명령형(「~하기」), 폼이 완료형(「~했어요」)으로 갈리지만 **같은 체크**다 —
  허브의 ✓는 폼에서 누른 체크를 읽어 그린다. 순서를 바꾸면 저장된
  `payload.guideChecks` 배열의 뜻이 어긋난다(content/submission.ts 주석과 같은
  사정). 항목을 늘려야 하면 뒤에 붙인다.

  ⚠️ 문구에 숫자를 넣지 않는다. 마감·순위·지표는 DB에서 온 값만 화면이 그린다.
*/

import type { HubPane } from "@/lib/hub-state";

/** 판마다 제목 한 줄과 부제 한 줄. 시안 `.hb-h1`·`.hb-sub` */
export const HUB_HEAD: Record<HubPane, { title: string; sub: string }> = {
  onboarding: {
    title: "온보딩을 시작해요",
    sub: "두 가지만 마치면 s1 제출이 열려요.",
  },
  s1: {
    title: "s1, 아이디어 등록과 고도화",
    sub: "온보딩 완료 ✓, 이제 아이디어를 제출 형태로 다듬어요.",
  },
  s2: {
    title: "s2, 랜딩, 수요조사",
    sub: "1차 심사 게이트예요, 수요를 숫자로 보여줄 차례.",
  },
  gate1: {
    title: "1차 심사 진행 중",
    sub: "마감 후 48시간 안에 결과를 알려드려요. 판정은 pass와 fail 두 가지예요.",
  },
  s3: {
    title: "s3, AI 빌드와 배포",
    sub: "1차 통과 ✓, 이제 진짜로 만들어요.",
  },
  race: {
    title: "s4, 마케팅과 유저 유입",
    sub: "레이스 기간이에요. 지금 이 순간에도 집계 중이니 이번 주 활동 제출을 잊지 마세요.",
  },
  gate2: {
    title: "2차 심사 진행 중",
    sub: "최종 지표가 확정 집계됐어요. 발표를 기다려요.",
  },
  /* 제목의 「시즌 1」은 시즌명이라 화면이 데이터로 채운다 */
  awarded: {
    title: "결과",
    sub: "상금 없이 순위와 시상 발표까지 진행돼요.",
  },
  archived: {
    title: "요약",
    sub: "시즌이 아카이브됐어요. 모든 기록은 읽기 전용이에요.",
  },
};

/*
  온보딩 두 단계 — 시안 h1의 `.gp`.

  `ONBOARDING_STEPS`(content/dashboard.ts)와 같은 두 단계이고 순서도 같다.
  저쪽은 체크리스트용 설명 문장까지 들고 있어 자리가 다르다.
*/
export const HUB_ONBOARDING = {
  title: "ONBOARDING",
  items: ["팀 구성하기", "측정 연동하기"],
} as const;

/** 아직 시작 전인 항목의 칩. 시안 h1이 1번에 「진행 중」, 2번에 「대기」를 단다 */
export const HUB_STEP_CHIP = { now: "진행 중", wait: "대기" } as const;

/*
  스테이지별 골든패스 — 시안 h2·h3·h5의 `.gp`.

  마지막 항목은 **제출 그 자체**라 가이드 체크가 아니다. 앞의 것들이 폼의
  체크와 1:1이고, 마지막은 제출 여부로 갈린다.
*/
export const HUB_GOLDEN_PATH = {
  /* 시안 h2. 앞 3개는 S1_GUIDE_CHECKS와 1:1 */
  s1: {
    title: "GOLDEN PATH, CH.1",
    checks: [
      "프롬프트 3개를 같은 대화방에서 실행하기",
      "레드팀 판정 통과하기",
      "문제 정의 1페이지 저장하기",
    ],
    last: "등록 정보 제출",
  },
  /*
    시안 h3. 앞 3개는 S2_GUIDE_CHECKS와 1:1이다 — 폼 쪽 문구는
    「수요검증 랜딩 배포 완료」·「스레드 포스팅 1개 이상 발행」·
    「사전 신청 폼에 유입 경로 문항 포함」이고 뜻이 같은 순서다.
    세 번째에는 지금까지 모인 사전 신청자 수를 칩으로 단다.
  */
  s2: {
    title: "GOLDEN PATH, CH.2",
    checks: ["수요검증 랜딩 만들기", "스레드에 알리기", "사전 신청 모으기"],
    last: "s2 제출",
  },
  /*
    시안 h5. s3은 폼의 모양이 달라 체크 배열 하나로 1:1이 되지 않는다 —
    빌더·핵심 기능·주소는 칸이고, 점검은 A1~A10·B1~B5 두 벌이다.
    그래서 판정 재료를 화면이 칸별로 고른다(hub-read.ts `s3Steps`).
  */
  s3: {
    title: "GOLDEN PATH, CH.5",
    checks: ["AI 빌더 열기", "핵심 기능 1개 구현하기", "배포하고 주소 연결하기"],
    last: "출시 전 점검",
  },
} as const;

/*
  행동 상자(`.act.hero`) — 제목 한 줄, 설명 한 줄, 버튼.

  ⚠️ 설명에 들어가는 마감·주소는 화면이 데이터로 채운다. 여기 있는 것은
  그 앞뒤 문장뿐이다.
*/
export const HUB_ACT = {
  /* 시안 h1 */
  onboardingTeam: {
    title: "팀부터 완성해요",
    body: "혼자면 개인 참가로 확정, 둘이면 초대 메일 한 통이면 돼요.",
    label: "팀 구성하기",
    href: "/dashboard/team",
  },
  /*
    ⚠️ 시안에 없다 — 시안 h1은 팀이 남은 모양 하나만 그린다. 팀을 먼저 끝낸
    팀에게 같은 상자를 그대로 두면 「팀부터 완성해요」가 거짓이 된다.
  */
  onboardingMeasurement: {
    title: "배포 주소만 연결하면 끝나요",
    body: "주소의 소유 확인이 끝나야 방문이 집계되기 시작해요.",
    label: "측정 연동하기",
    href: "/dashboard/measurement",
  },
  /* 시안 h2 */
  s1: {
    title: "준비됐으면 바로 제출해요",
    body: "제출 즉시 s2가 열려요.",
    label: "등록 정보 제출하기",
    href: "/dashboard/submit/s1",
  },
  /* 시안 h3 */
  s2: {
    title: "지표가 모였으면 제출해요",
    body: "방문, 신청자 수와 홍보 채널을 함께 내요.",
    label: "랜딩 만들고 s2 제출",
    href: "/dashboard/submit/s2",
  },
  /* 시안 h5 */
  s3: {
    title: "배포하면 레이스 준비 끝",
    body: "배포 즉시 트래픽이 자동으로 집계되기 시작해요.",
    label: "제품 배포하기",
    href: "/dashboard/submit/s3",
  },
  /* 시안 h6 */
  race: {
    title: "오늘도 한 명 더",
    body: "홍보 링크는 팀 주소 그대로예요, 어디에 뿌려도 집계돼요.",
    label: "홍보 링크 복사",
    second: { label: "지표 보기", href: "/dashboard/metrics" },
  },
  /* 시안 h8 — 보증금은 보류(도입 미정)라 버튼이 눌리지 않는다 */
  deposit: {
    title: "보증금 환불",
    body: "완주 확인 후 신청 계좌로 돌려드려요.",
    label: "보증금 환불 신청",
    badge: "도입 미정",
  },
} as const;

/*
  심사 대기 알림(`.lockpill`). 뒤에 붙는 날짜는 화면이 채운다.

  ⚠️ **자물쇠·경고 이모지는 문구에 넣지 않는다.** 시안은 마크업에 이모지를
  쓰지만 로드 직후 스크립트가 통째로 SVG로 바꿔치운다(`ICONS` 표) — 우리는
  처음부터 `Icon`으로 낸다(그 컴포넌트 머리 주석).
*/
export const HUB_LOCK = {
  gate1: "심사 대기, 결과는 알림으로 알려드려요",
  gate2: "심사 대기, 시상은",
} as const;

/** 카드 라벨. 시안이 대문자로 쓰는 것은 대문자 그대로다 */
export const HUB_LABEL = {
  countdown: "남은 시간",
  due: "마감",
  validUsers: "VALID USERS",
  myRank: "MY RANK",
  today: "TODAY",
  finalRank: "FINAL RANK",
  snapValidUsers: "유효 이용자",
  snapWeeklyActive: "주간 활성",
  snapRetention: "재방문율",
  snapRevenue: "매출 (가산점)",
  archiveRank: "최종 순위",
  archiveUsers: "총 유효 이용자",
  archiveSubmissions: "제출",
  archiveGates: "게이트",
  landingUrl: "랜딩 주소",
  visitors: "방문자",
  leads: "사전 신청자",
  conversion: "전환율",
  measurement: "측정 연동",
} as const;
