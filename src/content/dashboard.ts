import type { BlockedReason } from "@/lib/dashboard-state";

/*
  대시보드 허브에 실제로 나가는 문구.

  판정은 키만 돌려주고 문구는 화면이 정한다(dashboard-state.ts `BlockedReason` 주석).
  같은 사유라도 자리마다 다르게 써야 하기 때문이다 — 허브에서는 "무엇을 하면
  풀리는지"를 쓰고, 제출 화면에서는 "왜 지금 못 내는지"를 쓴다.

  ⚠️ 문구에 숫자를 넣지 않는다(CLAUDE.md 규칙 1). 마감일·순위·지표는 DB에서
  온 값만 화면이 직접 그린다.
*/

type BlockedCopy = {
  /** 한 줄 요약. 체크리스트 항목의 제목이다 */
  title: string;
  /** 이걸 풀려면 무엇을 하는가. 갈 곳이 있으면 아래 href와 짝이다 */
  hint: string;
  href?: string;
  /** 참가자가 지금 할 수 있는 일인가. 아니면 기다리는 일이다 */
  actionable: boolean;
};

export const BLOCKED_COPY: Record<BlockedReason, BlockedCopy> = {
  team_not_ready: {
    title: "팀 구성이 아직 끝나지 않았어요",
    hint: "초대한 팀원이 수락하면 완료됩니다.",
    href: "/dashboard/team",
    actionable: true,
  },
  hostname_not_verified: {
    title: "측정 연동이 확인되지 않았어요",
    hint: "배포 주소를 등록하고 소유 확인을 마쳐야 지표가 쌓입니다.",
    href: "/dashboard/measurement",
    actionable: true,
  },
  deposit_unpaid: {
    title: "보증금 결제가 남았어요",
    hint: "완주하면 전액 환불됩니다.",
    href: "/dashboard/deposit",
    actionable: true,
  },
  gate_review: {
    title: "심사 결과를 기다리는 중이에요",
    hint: "결과가 나오면 알림으로 알려드립니다.",
    href: "/dashboard/judgments",
    actionable: false,
  },
  entry_eliminated: {
    title: "이번 게이트를 통과하지 못했어요",
    hint: "산정에 오류가 있다고 판단되면 이의를 제기할 수 있습니다.",
    href: "/dashboard/appeal",
    actionable: true,
  },
  entry_disqualified: {
    title: "규칙 위반으로 실격 처리됐어요",
    hint: "사실과 다르다면 소명을 제출해 주세요.",
    href: "/dashboard/appeal",
    actionable: true,
  },
  entry_withdrawn: {
    title: "참가를 포기한 상태예요",
    hint: "다시 참가하려면 다음 시즌 모집을 기다려 주세요.",
    actionable: false,
  },
  season_not_started: {
    title: "시즌이 아직 시작하지 않았어요",
    hint: "시작하면 첫 제출이 열립니다.",
    actionable: false,
  },
  season_archived: {
    title: "종료된 시즌이에요",
    hint: "기록은 그대로 남아 있고, 읽기만 가능합니다.",
    actionable: false,
  },
};

/*
  허브 머리글 — `nextAction.key`에 대응하는 한 문장.

  라벨을 그대로 제목에 쓰면 「팀 구성하기」가 제목과 버튼에 두 번 나온다
  (8/14에 실제로 그렇게 나왔다). 제목은 상황을 말하고, 버튼은 행동을 말한다.

  ⚠️ `dashboard-state.ts`에 `nextAction`을 추가하면 여기도 한 줄 늘린다.
  빠뜨리면 라벨로 되돌아간다(화면이 죽지는 않는다).
*/
export const HEADLINE: Record<string, string> = {
  onboarding_team: "팀 구성부터 시작해요",
  onboarding_measurement: "배포 주소를 연결할 차례예요",
  onboarding_deposit: "보증금 결제가 남았어요",
  submit_s1: "등록 정보를 제출할 차례예요",
  submit_s2: "랜딩을 만들어 수요를 확인할 차례예요",
  submit_s3: "서비스를 배포할 차례예요",
  submit_s4: "이번 주 활동을 기록할 차례예요",
  result: "시즌 결과가 나왔어요",
  refund: "보증금을 환불받을 수 있어요",
  tester: "다른 팀의 서비스를 테스트해 주세요",
  appeal: "결과에 이의를 제기할 수 있어요",
};

/** 시즌 페이즈를 참가자 말로. 운영 용어(`racing`)를 그대로 노출하지 않는다 */
export const PHASE_LABEL: Record<string, string> = {
  draft: "준비 중",
  pre_apply: "사전신청",
  recruiting: "참가 모집 중",
  racing: "시즌 진행 중",
  awarded: "시상 발표",
  archived: "종료",
};

/*
  온보딩 체크리스트 — PLN3 3.1 1행. 순서가 곧 CTA 순서다.
  보증금은 `deposit` 플래그가 켜졌을 때만 붙는다(시즌1 도입 여부 미정).
*/
export const ONBOARDING_STEPS = [
  {
    key: "teamReady" as const,
    label: "팀 구성",
    done: "팀원이 확정됐어요",
    todo: "혼자 참가하거나, 팀원을 초대해 주세요",
    href: "/dashboard/team",
  },
  {
    key: "measurementReady" as const,
    label: "측정 연동",
    done: "배포 주소가 확인됐어요",
    todo: "배포 주소를 등록하고 소유 확인을 받아 주세요",
    href: "/dashboard/measurement",
  },
  {
    key: "depositReady" as const,
    label: "보증금",
    done: "결제가 확인됐어요",
    todo: "완주 시 전액 환불됩니다",
    href: "/dashboard/deposit",
  },
];

/** 허브 아래쪽 바로가기. 숫자를 싣지 않는다 — 각 화면이 자기 값을 그린다 */
export const HUB_LINKS = [
  { href: "/dashboard/team", label: "팀", desc: "팀원·초대·팀장 이양" },
  {
    href: "/dashboard/measurement",
    label: "측정 연동",
    desc: "배포 주소와 소유 확인",
  },
  { href: "/dashboard/metrics", label: "내 지표", desc: "유효 방문·매출 추이" },
  {
    href: "/dashboard/judgments",
    label: "심사 결과",
    desc: "게이트 판정과 피드백",
  },
];
