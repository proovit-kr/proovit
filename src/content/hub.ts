/*
  대시보드 허브에 실제로 나가는 문구 — 시안 `#scr-hub` h1~h17.

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

import { PREREGISTER } from "@/lib/header-state";
import type { HubPane } from "@/lib/hub-state";

/**
 * 판마다 제목 한 줄과 부제 한 줄. 시안 `.hb-h1`·`.hb-sub`
 *
 * ⚠️ **부제가 없는 판이 있다**(h10·h13) — 시안이 경고줄로 사정을 이미 말해
 * 놓고 제목 바로 아래에 할 일을 둔다. 없는 자리에 한 줄을 지어 넣지 않는다.
 */
export const HUB_HEAD: Record<HubPane, { title: string; sub?: string }> = {
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

  /* ── 예외 ─────────────────────────────────────────────── */

  /* 시안 h10. 부제가 없다 — 경고줄이 사정을 말하고 바로 할 일로 간다 */
  late: { title: "온보딩을 서둘러요" },
  s5: {
    title: "s5, 트래픽과 매출",
    sub: "최종 지표는 자동으로 집계돼요, 이 화면은 확인 버튼 역할이에요.",
  },
  missed: {
    title: "이번 시즌은 여기까지예요",
    sub: "마감 도달로 게이트가 fail 처리됐어요. 만든 랜딩과 데이터는 그대로 남아요.",
  },
  /* 제목의 「1차」는 게이트 차수라 화면이 데이터로 채운다(`HUB_GATE_ORDINAL`) */
  gateFail: {
    title: "심사 결과, 미통과",
    sub: "대시보드는 계속 볼 수 있지만, 지표와 제출 메뉴는 닫혔어요.",
  },
  /* 시안 h13. 여기도 부제가 없다 */
  undeployed: { title: "지금이라도 배포해요" },
  disqualified: {
    title: "소명할 수 있어요",
    sub: "통지 후 5영업일 내에 소명을 접수하면, 근거 지표와 함께 회신해 드려요.",
  },
};

/*
  실격 사유 — 시안 h14의 「사유: 지표 조작 의심 (봇 트래픽 감지)」 자리.

  ⚠️ **헤더의 `SANCTION_REASON`과 같은 enum, 다른 꼴이다**(header-state.ts).
  저쪽은 문장 속 부사절(「…판정으로 실격 처리되었어요」)이고 여기는 「사유:」
  뒤에 오는 명사다. 사유가 늘면 두 표를 같이 고친다.
*/
export const HUB_SANCTION_REASON: Record<string, string> = {
  bot_traffic: "레이스 지표 어뷰징",
  multi_account: "다중 계정",
  paid_signup: "유료 가입 유도",
  evidence_forged: "증빙 위조",
  undisclosed_ad: "광고 미표기",
  attack_or_spam: "공격과 스팸",
  false_representation: "허위 기재",
};

/** 게이트의 차수. 시안 h12의 「1차 심사 결과, 미통과」 */
export const HUB_GATE_ORDINAL: Record<string, string> = {
  s2: "1차",
  s5: "2차",
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
    /*
      ⚠️ **이 판만 남은 칸이 동시에 진행 중이다**(시안 h3, 2026-09-21 수연 확인).
      「알리기」와 「모으기」는 알려야 모이는 관계라 함께 돌고, 「모으기」는 끝나는
      일이 아니라 숫자가 쌓이는 일이다 — 그래서 그 칸에만 숫자 칩이 붙는다.
      h2·h5는 순서가 있는 길이라 순차다(만들어야 배포한다).
    */
    parallel: true,
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

  /* ── 예외 ─────────────────────────────────────────────── */

  /* 시안 h10 */
  late: {
    title: "남은 시간이 짧아요",
    body: "개인 참가로 확정하면 바로 다음 단계로 갈 수 있어요.",
    label: "팀 구성하기",
    href: "/dashboard/team",
  },
  /* 시안 h15 */
  s5: {
    title: "회고와 공개 동의만 남았어요",
    body: "제출 폼에서 회고를 쓰고 최종 제출을 확인해요.",
    label: "최종 제출 확인",
    href: "/dashboard/submit/s5",
  },
  /*
    시안 h13. 버튼이 가는 곳은 **측정 연동**이다 — 「미배포」를 만드는 것이
    배포 주소의 소유 확인이라(`public-read.ts`의 `notDeployed`) 제출 폼으로
    보내면 화면이 말한 일을 그 자리에서 끝낼 수 없다.
  */
  undeployed: {
    title: "배포하는 순간부터 집계돼요",
    body: "늦지 않았어요. 핵심 기능 1개면 충분해요.",
    label: "제품 배포하기",
    href: "/dashboard/measurement",
  },
  /* 시안 h14 */
  disqualified: {
    title: "소명 접수",
    body: "지금 열려 있는 메뉴는 소명뿐이에요.",
    label: "소명 접수하기",
    href: "/dashboard/appeal",
  },
  /* 시안 h11 */
  missed: {
    title: "다음 시즌에 다시 만나요",
    body: "같은 아이디어로 재도전할 수 있어요, 팀도 그대로 쓸 수 있어요.",
    label: "다음 시즌 소식 받기",
    href: PREREGISTER,
  },
  /* 시안 h12 */
  gateFail: {
    title: "다음 시즌 재도전",
    body: "이번에 만든 랜딩과 학습이 다음 시즌의 출발점이 돼요.",
    label: "다음 시즌 소식 받기",
    href: PREREGISTER,
  },
} as const;

/*
  경고줄(`.wbar`) — 시안 h10·h11·h13·h14가 판 맨 위에 두는 한 줄.

  ⚠️ **⚠️·⏰·⛔은 문구에 넣지 않는다.** 시안은 마크업에 이모지를 쓰지만 로드
  직후 스크립트가 SVG로 바꿔치운다(`ICONS` 표) — 우리는 `Icon`으로 낸다.
  표에 없는 🚀는 시안에서도 글자 그대로라 아래 문장에 남아 있다.
*/
export const HUB_WBAR = {
  /* 시안 h10 — 가운데에 s1 마감이 들어간다 */
  late: {
    head: "지각 참가, 온보딩은 지금 해도 되지만, s1 마감",
    tail: "은 동일해요.",
  },
  /* 시안 h11 — 앞에 게이트 스테이지가 붙는다 */
  missed: "마감이 지나 자동 미통과 처리됐어요.",
  /* 시안 h13 */
  undeployed:
    '🚀 아직 미배포 상태로 레이스에 들어왔어요, 리더보드에 "미배포"로 표시되고 지표는 0이에요.',
  /* 시안 h14 — 뒤에 제재 사유가 붙는다 */
  disqualified: "실격 처리, 리더보드에서 제외됐어요. 사유:",
} as const;

/*
  아직 신청하지 않은 사람 — 대시보드가 온보딩의 출발점이라 여기도 **시안 h1을
  그대로 그린다**(2026-09-21 수연 지시). 제목·부제·골든패스 두 칸·행동 상자가
  전부 h1과 같고, **버튼이 가는 곳만 다르다.**

  ⚠️ **팀을 만드는 곳이 참가 신청이다.** 신청 폼이 팀명을 받고, 「혼자 참가」
  체크와 초대 메일까지 거기서 끝난다(`ApplyForm`) — 행동 상자의 「혼자면 개인
  참가로 확정, 둘이면 초대 메일 한 통이면 돼요」가 그 폼을 말한다. 그래서
  `/dashboard/team`이 아니라 `/apply`로 보낸다(참가 기록이 없으면 팀 관리는 404다).

  모집 구간이 아니면 신청 자체가 닫혀 있어 아래 `closed`를 쓴다.
*/
export const HUB_NO_ENTRY = {
  /*
    **지난 시즌에 참가했던 사람** — 시안 h17. 다음 시즌이 열리는 순간 그쪽이
    「지금 시즌」이 되어(`getCurrentSeason`) 이번 시즌 참가 기록이 없는 사람이
    된다. 처음 온 사람과 같은 온보딩 화면을 그리면 지난 시즌이 없던 일이 된다.

    제목과 버튼 앞의 시즌명은 데이터라 화면이 채운다.
  */
  next: {
    title: "모집이 시작됐어요",
    sub: "이전 시즌 기록은 아카이브에 그대로 남아 있어요.",
    actTitle: "새 엔트리로 다시 도전해요",
    actBody: "팀은 그대로 쓸 수 있어요, 아이디어만 새로 정하면 돼요.",
    label: "참가 신청하기",
    href: "/apply",
  },
  closed: {
    title: "이번 시즌 참가 기록이 없어요",
    sub: "모집이 열리면 이 화면에서 신청할 수 있어요.",
    actTitle: "다음 모집 소식을 받아 보세요",
    actBody: "첫 화면에서 알림을 신청하면 모집이 열릴 때 메일로 알려드려요.",
    label: "첫 화면으로",
    href: "/",
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
  /* 시안 h13의 상태 카드. 「미배포」는 리더보드·참가작이 쓰는 말과 같다 */
  status: "상태",
  notDeployed: "미배포",
  /* 시안 h12의 `.hb-sum` 세 줄 */
  verdict: "판정",
  reasonSummary: "사유 요지",
  appeal: "이의신청",
  /*
    ⚠️ 「5영업일」은 규칙 제11조의 값이다(`appeal.ts`의 `APPEAL_BUSINESS_DAYS`).
    뒤에 붙는 날짜는 화면이 그 상수로 계산한다 — 조항이 바뀌면 둘 다 고친다.
  */
  appealNote: "통지 후 5영업일 내",
} as const;
