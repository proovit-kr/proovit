import {
  EntryStage,
  EntryStatus,
  SeasonPhase,
  StageKey,
} from "@/generated/prisma/enums";
import { getSessionUser } from "@/lib/access";
import {
  checkDevSandbox,
  hasSandboxTeam,
  loadSandboxState,
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

const STAGES: { value: EntryStage; label: string }[] = [
  { value: EntryStage.applied, label: "신청" },
  { value: EntryStage.s1, label: "s1" },
  { value: EntryStage.s2, label: "s2" },
  { value: EntryStage.s3, label: "s3" },
  { value: EntryStage.s4, label: "s4" },
  { value: EntryStage.s5, label: "s5" },
  { value: EntryStage.completed, label: "완주" },
];

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
  const current =
    state.teams.find((team) => team.userId === user?.id) ?? null;

  return (
    <DevBarClient
      me={user ? { nickname: user.nickname, onboarded: !!user.onboardedAt } : null}
      parked={parked}
      today={today ? today.toISOString() : null}
      current={current}
      hasTeam={hasTeam}
      season={state.season}
      stages={STAGES}
      statuses={STATUSES}
      phases={PHASES}
      raceStages={RACE_STAGES}
      metrics={METRICS}
    />
  );
}
