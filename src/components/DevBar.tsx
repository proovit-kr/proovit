import {
  EntryStatus,
  SeasonPhase,
  StageKey,
} from "@/generated/prisma/enums";
import { getSessionUser, loadViewerState } from "@/lib/access";
import {
  checkDevSandbox,
  hasSandboxTeam,
  HUB_PLANS,
  loadSandboxState,
  matchHubKey,
  type HubKey,
} from "@/lib/dev-sandbox";
import { devToday } from "@/lib/dev-clock";
import { hasParkedSession } from "@/lib/dev-session";

import { DevBarClient } from "./DevBarClient";

/*
  개발용 상태 토글 바.

  시안은 화면마다 상단에 STATE 줄이 있어서 「집계 전 / 레이스 / 종료」를 눌러
  가며 훑을 수 있다. 실제 앱에서 그 상태를 만들려면 DB를 고쳐야 하므로,
  같은 일을 하는 줄을 화면 아래에 붙인다.

  ⚠️ **열리는 조건은 dev-sandbox.ts가 정한다.** 여기서 NODE_ENV만 보고 그리면
  `.env`(운영)를 실은 채 로컬을 띄웠을 때 운영 DB를 고치는 바가 뜬다.
  실제로 2026-08-27에 그 사고가 있었다.

  ⚠️ 서버 컴포넌트다. 토글 상태를 클라이언트가 들고 있지 않고 매번 DB에서
  읽는다 — 바에 찍힌 값과 화면이 어긋나면 그 바는 도구가 아니라 함정이 된다.
*/

/*
  진도 줄은 **시안 `#hubSel`의 17종 그대로**다(2026-09-21 수연 지시 —
  「개발 바에 진도 줄 사진과 동일하게」). 라벨도 시안이 적은 그대로 쓴다.

  한 줄이 진도만 옮기던 때보다 하는 일이 많다 — 페이즈·생존 상태·온보딩·집계·
  「오늘」을 그 판이 성립하도록 한꺼번에 맞춘다(`HUB_PLANS`). 그래서 이 줄을
  누르면 아래 다른 줄들의 값도 같이 바뀐다.
*/
/*
  ⚠️ `inBar: false`인 판은 버튼을 두지 않는다 — 지금은 h1 하나다. 「참가팀 없음」
  줄이 같은 화면(온보딩)을 만들기 때문이다(2026-09-21 수연 결정). 표에는 남아
  있어서 대조 스크립트는 그대로 쓴다.
*/
const HUBS = (Object.keys(HUB_PLANS) as HubKey[])
  .filter((value) => HUB_PLANS[value].inBar !== false)
  .map((value) => ({
    value,
    label: HUB_PLANS[value].label,
    group: HUB_PLANS[value].group,
  }));

const STATUSES: { value: EntryStatus; label: string }[] = [
  { value: EntryStatus.active, label: "정상" },
  { value: EntryStatus.eliminated, label: "탈락" },
  { value: EntryStatus.disqualified, label: "실격" },
  { value: EntryStatus.withdrawn, label: "포기" },
];

/*
  랜딩 시안의 네 상태(모집 전·모집 중·진행 중·시즌 종료)와 하나씩 맞춘다.
  「종료」는 `awarded`다. `archived`는 시안에 랜딩 상태가 없어 뺐다
  (2026-09-19 수연 결정 — 「종료」가 archived라 랜딩 ④ 대신 ①이 떠 헷갈렸다).
*/
const PHASES: { value: SeasonPhase; label: string }[] = [
  { value: SeasonPhase.pre_apply, label: "사전신청" },
  { value: SeasonPhase.recruiting, label: "모집" },
  { value: SeasonPhase.racing, label: "레이스" },
  { value: SeasonPhase.awarded, label: "종료" },
];

/* 레이스 중 지금 스테이지. 페이즈가 레이스일 때만 줄이 뜬다 */
const RACE_STAGES: { value: StageKey; label: string }[] = [
  StageKey.s1, StageKey.s2, StageKey.s3, StageKey.s4, StageKey.s5,
].map((value) => ({ value, label: value }));

/*
  시안 리더보드의 STATE와 같은 이름을 쓴다 — 대조할 때 헷갈리지 않게.

  ⚠️ **둘뿐이다.** 「시즌 종료」는 집계가 아니라 **페이즈**가 정한다(페이즈 줄의
  「종료」). 스테이지가 s4 진행 중인데 집계만 종료로 두는 조합은 실제로 생기지
  않는데, 줄에 남겨 두면 그 조합을 만들 수 있었다. 2026-09-20 수연 지시.
*/
const METRICS: { value: string; label: string }[] = [
  { value: "none", label: "집계 전" },
  { value: "race", label: "레이스 운영중" },
];

export async function DevBar() {
  const check = checkDevSandbox();
  /*
    막혔을 때도 **이유는 보여준다.** 아무것도 안 뜨면 "왜 안 나오지"로 시간이
    간다. 운영 DB에 붙었을 때 특히 그렇다 — 그 사실 자체가 알아야 할 정보다.
  */
  if (!check.ok) {
    return process.env.NODE_ENV === "production" ? null : (
      <DevBarClient blocked={check.reason} />
    );
  }

  const user = await getSessionUser();
  /* 비로그인으로 둔 세션이 있는가 — 있으면 「로그인」 줄로 돌아올 수 있다 */
  const parked = await hasParkedSession();
  const state = await loadSandboxState();
  /* 가정한 오늘. 스테이지 줄이 정하고, 안 정했으면 진짜 오늘이다 */
  const today = devToday();
  /* 팀원으로 들어간 팀도 친다 — 아래 `current`는 팀장인 팀만 찾는다 */
  const hasTeam =
    user && state.season
      ? await hasSandboxTeam({ userId: user.id, seasonId: state.season.id })
      : null;
  /*
    ⚠️ **화면이 보는 그 참가 기록을 고른다.** 한 사람이 여러 팀의 팀장일 수
    있는데(dev DB에서 실제로 그렇다), 바가 제 순서로 고르면 화면과 다른 팀을
    집는다 — 2026-09-21에 s1 주차를 눌러도 화면이 s4였던 원인이다.
    `loadViewerState`는 React cache라 여기서 불러도 왕복이 늘지 않는다.
  */
  const viewer = await loadViewerState();
  const current =
    state.teams.find((team) => team.entryId === viewer.entry?.id) ?? null;
  /* 지금 눌린 버튼 — DB 상태를 시안 목록의 한 줄로 되짚는다 */
  const hubKey =
    current && state.season
      ? matchHubKey({
          phase: state.season.phase,
          stage: current.stage,
          status: current.status,
          solo: current.solo,
          verified: current.verified,
          raceStage: state.season.stage,
        })
      : null;

  return (
    <DevBarClient
      me={user ? { nickname: user.nickname, onboarded: !!user.onboardedAt } : null}
      parked={parked}
      today={today ? today.toISOString() : null}
      current={current}
      hasTeam={hasTeam}
      season={state.season}
      hubs={HUBS}
      hubKey={hubKey}
      statuses={STATUSES}
      phases={PHASES}
      raceStages={RACE_STAGES}
      metrics={METRICS}
    />
  );
}
