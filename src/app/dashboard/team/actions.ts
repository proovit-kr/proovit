"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  canLeaveTeam,
  canManageTeam,
  loadViewerState,
  toAccessContext,
} from "@/lib/access";
import {
  InviteEmailSchema,
  TEAM_FAILURE_MESSAGE,
  type TeamFailureCode,
} from "@/lib/team";
import {
  createInvite,
  removeMember,
  revokeInvite,
  transferLeader,
} from "@/lib/team-store";

/*
  팀 관리 서버 액션.

  ⚠️ **화면이 폼을 그렸는지와 무관하게 여기서 다시 판정한다.** 서버 액션은 그
  자체로 호출 가능한 엔드포인트다 — 팀원이 팀장 폼을 안 봤다는 것이
  "팀원이 그 액션을 못 부른다"는 뜻이 아니다.

  판정은 `canManageTeam()`·`canLeaveTeam()` 하나로 한다. 화면이 폼을 그릴 때
  부르는 것과 **같은 함수**다(CLAUDE.md §3).

  대상도 폼에서 받은 값을 그대로 믿지 않는다. 팀은 세션에서 온 `viewer.team.id`만
  쓰고, 폼에서 오는 것은 「누구를」뿐이며 그 사람이 이 팀의 팀원인지는 store가
  다시 확인한다. teamId를 폼에서 받으면 남의 팀을 건드릴 수 있다.

  ⚠️ 무엇을·누구에게를 **누른 버튼 하나**로 받는다(`op=transfer:<userId>`).
  줄마다 숨은 입력을 두면 한 폼 안에 같은 이름이 여럿 생겨 `formData.get`이
  첫 줄 값을 집는다 — 두 번째 팀원을 눌러도 첫 번째가 대상이 된다.
  제출 버튼의 name/value는 **누른 버튼 것만** 실려서 그 사고가 성립하지 않는다.
*/

export type TeamState = {
  /** 성공 안내. 발급된 코드처럼 화면이 보여줄 값이 있으면 함께 */
  done?: "invited" | "revoked" | "transferred" | "removed" | "left";
  code?: string;
  /** 실패 문구. 필드에 붙지 않는 오류다 */
  message?: string;
};

function fail(code: TeamFailureCode): TeamState {
  return { message: TEAM_FAILURE_MESSAGE[code] };
}

export async function manageTeam(
  _prev: TeamState,
  formData: FormData,
): Promise<TeamState> {
  const [op, target = ""] = String(formData.get("op") ?? "").split(":");

  const viewer = await loadViewerState();
  if (!viewer.user) {
    return { message: "로그인이 풀렸습니다. 다시 로그인해 주세요." };
  }
  if (!viewer.team || !viewer.entry) {
    return { message: "참가 기록이 없습니다." };
  }

  const ctx = toAccessContext(viewer);
  const teamId = viewer.team.id;
  const actorId = viewer.user.id;

  /* 나가기만 팀원의 일이고 나머지는 전부 팀장의 일이다 */
  const permission = op === "leave" ? canLeaveTeam(ctx) : canManageTeam(ctx);
  if (!permission.ok) return { message: permission.message };

  const result = await run(op, { teamId, actorId, target, formData });

  /*
    팀 구성은 온보딩 체크리스트의 첫 항목이라 허브의 결론(`nextAction`)이 바뀐다.
    팀 화면만 새로 그리면 허브가 옛 CTA를 들고 있다.
  */
  if (!result.message) {
    revalidatePath("/dashboard/team");
    revalidatePath("/dashboard");
  }
  /*
    나간 사람에게 이 화면은 더 없다 — 참가 기록이 사라져 다시 그리면 404다.
    허브로 보내면 「참가 기록 없음」 판(h1)이 다음 할 일을 말해 준다.
  */
  if (result.done === "left") redirect("/dashboard");
  return result;
}

async function run(
  op: string,
  args: {
    teamId: string;
    actorId: string;
    target: string;
    formData: FormData;
  },
): Promise<TeamState> {
  const { teamId, actorId, target, formData } = args;

  switch (op) {
    case "invite": {
      const parsed = InviteEmailSchema.safeParse(formData.get("email") ?? "");
      if (!parsed.success) {
        return { message: parsed.error.issues[0]?.message ?? "" };
      }
      const created = await createInvite(teamId, parsed.data);
      if (!created.ok) return fail(created.code);
      return { done: "invited", code: created.code };
    }

    case "revoke": {
      if (!target) return fail("INVITE_NOT_FOUND");
      const revoked = await revokeInvite(teamId, target);
      if (!revoked.ok) return fail(revoked.code);
      return { done: "revoked" };
    }

    case "transfer": {
      if (!target) return fail("NOT_MEMBER");
      const moved = await transferLeader(teamId, actorId, target);
      if (!moved.ok) return fail(moved.code);
      return { done: "transferred" };
    }

    case "remove": {
      if (!target) return fail("NOT_MEMBER");
      /* 팀장이 자기를 지우는 길을 만들지 않는다 — 이양이 먼저다 */
      if (target === actorId) return fail("LAST_MEMBER");
      const removed = await removeMember(teamId, target);
      if (!removed.ok) return fail(removed.code);
      return { done: "removed" };
    }

    case "leave": {
      const left = await removeMember(teamId, actorId);
      if (!left.ok) return fail(left.code);
      return { done: "left" };
    }

    default:
      return { message: "알 수 없는 요청입니다." };
  }
}
