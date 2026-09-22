"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  canLeaveTeam,
  canManageTeam,
  getSessionUser,
  loadViewerState,
  toAccessContext,
  type ViewerState,
} from "@/lib/access";
import { validateInviteEmail } from "@/lib/apply";
import { sendTeamInvite } from "@/lib/mail";
import { TEAM_FAILURE_MESSAGE, type TeamFailureCode } from "@/lib/team";
import {
  createInvite,
  findPendingInvite,
  loadIdeaTitle,
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

  ## 초대는 메일이다(시안 ②)

  「초대 메일 보내기」는 초대 행을 만들고 그 주소로 메일 한 통을 보낸다.
  참가 신청의 초대 칸과 **같은 규칙·같은 메일**이다(apply-store) — 주소 검증은
  `validateInviteEmail`, 발송은 `sendTeamInvite`.

  ⚠️ 메일이 실패해도 초대 행은 남긴다. 참가 신청과 같은 이유다 — 초대가
  살아 있으면 「재발송」이 있고, 없으면 처음부터 다시다. 실패는 문구로 알린다.
*/

export type TeamState = {
  /** 성공 안내. 화면이 토스트로 알린다 */
  done?: "invited" | "resent" | "revoked" | "transferred" | "removed" | "left";
  /** 실패 문구. 필드에 붙지 않는 오류다 */
  message?: string;
  /** 초대 이메일 칸에 붙는 오류. 모달이 열린 채로 보여 준다 */
  emailError?: string;
  /** 오류가 난 그 입력값. 칸에 되돌려 놓는다 */
  email?: string;
};

function fail(code: TeamFailureCode): TeamState {
  return { message: TEAM_FAILURE_MESSAGE[code] };
}

const MAIL_FAILED_AFTER_INVITE =
  "초대는 만들어졌지만 메일을 보내지 못했어요. 「재발송」을 눌러 주세요.";
const MAIL_FAILED = "메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.";
const INVITE_WITHOUT_EMAIL =
  "이메일 없이 만든 초대예요. 코드를 직접 전해 주세요.";

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

  const result = await run(op, { viewer, teamId, actorId, target, formData });

  /*
    팀 구성은 온보딩 체크리스트의 첫 항목이라 허브의 결론(`nextAction`)이 바뀐다.
    팀 화면만 새로 그리면 허브가 옛 CTA를 들고 있다.

    `done`으로 본다 — 초대는 됐는데 메일만 실패한 경우는 문구와 `done`이 함께
    실리고, 그때도 새 초대 상자가 떠야 「재발송」을 누를 수 있다.
  */
  if (result.done) {
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
    viewer: ViewerState;
    teamId: string;
    actorId: string;
    target: string;
    formData: FormData;
  },
): Promise<TeamState> {
  const { viewer, teamId, actorId, target, formData } = args;

  switch (op) {
    case "invite": {
      /*
        본인 주소인지 보려면 세션의 이메일이 필요하다. `loadViewerState`는
        이메일을 내리지 않으므로(화면에 실을 일이 없다) 여기서만 따로 읽는다.
      */
      const me = await getSessionUser();
      if (!me) return { message: "로그인이 풀렸습니다. 다시 로그인해 주세요." };

      const inviteEmail = String(formData.get("email") ?? "");
      /*
        빈 칸만 여기서 먼저 본다 — `validateInviteEmail`의 빈 칸 문구는 참가
        신청 것이라 「혼자 참가」를 고르라고 하는데, 이 화면에는 그 선택이 없다.
      */
      const emailError =
        inviteEmail.trim().length === 0
          ? "팀원의 이메일을 입력해 주세요."
          : validateInviteEmail({
              isSolo: false,
              inviteEmail,
              selfEmail: me.email,
            });
      /* 적던 주소를 돌려준다 — 액션이 끝나면 폼이 초기화되어 칸이 비기 때문이다 */
      if (emailError) return { emailError, email: inviteEmail };

      const email = inviteEmail.trim();
      const created = await createInvite(teamId, email);
      if (!created.ok) return fail(created.code);

      const sent = await mail(viewer, {
        email,
        code: created.code,
        expiresAt: created.expiresAt,
      });
      return sent
        ? { done: "invited" }
        : { done: "invited", message: MAIL_FAILED_AFTER_INVITE };
    }

    case "resend": {
      if (!target) return fail("INVITE_NOT_FOUND");
      const invite = await findPendingInvite(teamId, target);
      if (!invite) return fail("INVITE_NOT_FOUND");
      if (!invite.email) return { message: INVITE_WITHOUT_EMAIL };

      const sent = await mail(viewer, {
        email: invite.email,
        code: invite.code,
        expiresAt: invite.expiresAt,
      });
      return sent ? { done: "resent" } : { message: MAIL_FAILED };
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

/**
 * 초대 메일 한 통. 참가 신청이 보내는 것과 같은 메일이다(apply-store).
 *
 * 성공이면 true. 메일 모듈은 던지지 않기로 돼 있지만 그 약속에 초대를 걸지
 * 않는다 — 예외도 실패로 접는다. 원인은 mail.ts가 로그로 남긴다.
 */
async function mail(
  viewer: ViewerState,
  invite: { email: string; code: string; expiresAt: Date },
): Promise<boolean> {
  if (!viewer.user || !viewer.team || !viewer.entry || !viewer.season) {
    return false;
  }
  try {
    const ideaTitle = await loadIdeaTitle(viewer.entry.id);
    const sent = await sendTeamInvite({
      email: invite.email,
      inviterNickname: viewer.user.nickname,
      teamName: viewer.team.name,
      ideaTitle: ideaTitle ?? viewer.team.name,
      seasonTitle: viewer.season.title,
      code: invite.code,
      expiresAt: invite.expiresAt,
    });
    if (!sent.ok) {
      console.error(
        `[team] 초대 메일 실패(${sent.reason}). 초대는 살아 있습니다. team=${viewer.team.id}`,
      );
    }
    return sent.ok;
  } catch (error) {
    console.error("[team] 초대 메일에서 예외가 났습니다.", error);
    return false;
  }
}
