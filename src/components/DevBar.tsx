import {
  EntryStatus,
  SeasonPhase,
  StageKey,
} from "@/generated/prisma/enums";
import { getSessionUser, loadViewerState } from "@/lib/access";
import {
  checkDevSandbox,
  findParkedEntry,
  hasSandboxTeam,
  HUB_PLANS,
  loadSandboxState,
  matchHubKey,
  type HubKey,
} from "@/lib/dev-sandbox";
import { devToday } from "@/lib/dev-clock";
import { devHubKey } from "@/lib/dev-hub";

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

  /*
    ⚠️ **서로 기대지 않는 조회는 한꺼번에 띄운다.** dev DB(Neon 싱가포르)는
    왕복이 ~80ms라 `await`를 한 줄씩 늘어놓으면 그 수만큼 곱해진다 — 이 바가
    칩 하나에 여섯 단을 순서대로 기다려 0.5초를 먹고 있었다(2026-09-21).
    아래는 두 단이다: ① 세션·샌드박스 상태·화면 상태, ② 그 셋이 있어야 하는 둘.

    `loadViewerState`는 React cache라 레이아웃과 겹쳐도 왕복이 늘지 않는다.
    화면이 보는 그 참가 기록을 고르는 데 쓴다 — 한 사람이 여러 팀의 팀장일 수
    있어서(dev DB가 실제로 그렇다) 바가 제 순서로 고르면 화면과 다른 팀을
    집는다(2026-09-21에 s1 주차를 눌러도 화면이 s4였던 원인).
  */
  const [user, state, viewer] = await Promise.all([
    getSessionUser(),
    loadSandboxState(),
    loadViewerState(),
  ]);
  /* 가정한 오늘. 스테이지 줄이 정하고, 안 정했으면 진짜 오늘이다 */
  const today = devToday();
  const scope =
    user && state.season ? { userId: user.id, seasonId: state.season.id } : null;
  const [hasTeam, parkedEntryId] = await Promise.all([
    /* 팀원으로 들어간 팀도 친다 — 아래 `current`는 팀장인 팀만 찾는다 */
    scope ? hasSandboxTeam(scope) : null,
    /*
      화면에는 참가 기록이 없어도 **자리만 비워 둔 것**이면 그 팀을 잡는다 —
      지각 참가(h10)와 「참가팀 없음」이 그 상태다. 안 잡으면 진도 줄이 통째로
      「참가 기록이 없어요」가 되어 다음 판으로 못 넘어간다(2026-09-21 수연 지시
      — 「예외에 지각 참가 칩은 보여야지」).
    */
    scope && !viewer.entry ? findParkedEntry(scope) : null,
  ]);
  /*
    판을 앉힐 기록은 **그 팀의 가장 앞 시즌 기록**이다 — 목 데이터는 시즌 1이
    정본이고 시즌 2는 h17이 깨우는 「다음 시즌」이다. 화면이 보는 기록(지금
    시즌 것)을 그대로 잡으면, 시즌 2가 열린 뒤 「참가팀 있음」 등으로 거기
    기록이 생겼을 때 그 기록에 판을 앉혀 시즌 3·4가 생겼다(2026-09-21).
    팀은 화면이 보는 팀이고(한 사람이 여러 팀 팀장일 수 있다), 없으면 자리가
    비어 있는 팀, 그것도 없으면 그 사람이 팀장인 아무 팀이다.
  */
  const seen =
    state.teams.find(
      (team) => team.entryId === (viewer.entry?.id ?? parkedEntryId),
    ) ?? null;
  const mine = user
    ? [...state.teams]
        .filter((team) =>
          seen ? team.teamId === seen.teamId : team.userId === user.id,
        )
        .sort((a, b) => a.seasonCreatedAt.getTime() - b.seasonCreatedAt.getTime())
    : [];
  const current = mine[0] ?? null;
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
          parked: parkedEntryId !== null,
          pressed: devHubKey(),
          nextPhase: state.season.nextPhase,
        })
      : null;

  return (
    <DevBarClient
      me={user ? { nickname: user.nickname, onboarded: !!user.onboardedAt } : null}

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
