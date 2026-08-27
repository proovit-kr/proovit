import {
  EntryStage,
  EntryStatus,
  SeasonPhase,
} from "@/generated/prisma/enums";
import { getSessionUser } from "@/lib/access";
import { checkDevSandbox, loadSandboxState } from "@/lib/dev-sandbox";
import { featureFlagsSchema } from "@/lib/feature-flags";

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

const PHASES: { value: SeasonPhase; label: string }[] = [
  { value: SeasonPhase.pre_apply, label: "사전신청" },
  { value: SeasonPhase.recruiting, label: "모집" },
  { value: SeasonPhase.racing, label: "레이스" },
  { value: SeasonPhase.awarded, label: "시상" },
  { value: SeasonPhase.archived, label: "종료" },
];

const FLAG_LABEL: Record<string, string> = {
  leaderboard: "리더보드",
  notifications: "알림",
  deposit: "보증금",
  testerAssignments: "테스터",
  credits: "혜택",
  sponsors: "스폰서",
  archive: "아카이브",
};

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
  const state = await loadSandboxState();
  const current =
    state.teams.find((team) => team.userId === user?.id) ?? null;

  return (
    <DevBarClient
      me={user ? { nickname: user.nickname, onboarded: !!user.onboardedAt } : null}
      teams={state.teams}
      current={current}
      season={state.season}
      stages={STAGES}
      statuses={STATUSES}
      phases={PHASES}
      flags={Object.keys(featureFlagsSchema.shape).map((key) => ({
        key,
        label: FLAG_LABEL[key] ?? key,
        on: state.season?.flags[key] === true,
      }))}
    />
  );
}
