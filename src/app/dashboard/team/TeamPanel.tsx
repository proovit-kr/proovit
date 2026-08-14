"use client";

import { useActionState, useState } from "react";

import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";

import { manageTeam, type TeamState } from "./actions";

import styles from "./team.module.css";

/*
  팀 관리의 쓰기 절반.

  클라이언트 컴포넌트인 이유는 셋이다 — ① 발급된 코드를 그 자리에서 복사해야 하고
  ② 강퇴·탈퇴는 되돌릴 수 없어 한 번 더 묻어야 하고 ③ 실패 문구를 폼 옆에 붙여야 한다.

  ⚠️ 여기서 폼을 감추는 것은 **안내일 뿐 방어가 아니다.** 실제 차단은 서버 액션이
  `canManageTeam()`을 다시 부르는 것으로 한다(actions.ts 머리 주석).

  ⚠️ 확인 절차에 `confirm()`을 쓰지 않는다. 브라우저 기본 대화상자는 화면 밖에
  떠서 되돌릴 수 없는 동작의 대상(누구를 내보내는지)을 보여주지 못한다.
  버튼 자리에서 한 번 더 묻는다.
*/

type MemberView = {
  userId: string;
  nickname: string;
  isLeader: boolean;
  joinedAt: string;
};

type InviteView = {
  id: string;
  code: string;
  email: string | null;
  expiresAt: string;
  url: string;
};

const INITIAL: TeamState = {};

export function TeamPanel({
  members,
  invite,
  full,
  canManage,
  viewerId,
  viewerIsLeader,
}: {
  members: MemberView[];
  invite: InviteView | null;
  full: boolean;
  canManage: boolean;
  viewerId: string;
  viewerIsLeader: boolean;
}) {
  const [state, formAction, pending] = useActionState(manageTeam, INITIAL);
  /* 되돌릴 수 없는 버튼은 한 번 더 묻는다. 어느 줄을 묻는 중인지만 기억한다 */
  const [asking, setAsking] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const issued = state.done === "invited" ? state.code : undefined;
  const code = issued ?? invite?.code;
  const url = invite?.url ?? (issued ? `/apply?invite=${issued}` : undefined);

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 클립보드를 막아둔 브라우저도 있다. 코드는 화면에 그대로 있다 */
    }
  };

  return (
    <form action={formAction} className={styles.panel} noValidate>
      {state.message ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : null}
      {state.done === "left" ? (
        <p className={styles.notice} role="status">
          팀에서 나왔습니다.
        </p>
      ) : null}

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>팀원</h2>
        <ul className={styles.members}>
          {members.map((member) => {
            const isSelf = member.userId === viewerId;
            const askKey = `remove:${member.userId}`;
            return (
              <li key={member.userId} className={styles.member}>
                <span className={styles.who}>
                  <span className={styles.nickname}>
                    {member.nickname}
                    {isSelf ? <span className={styles.self}>나</span> : null}
                  </span>
                  <span className={styles.joined}>{member.joinedAt} 합류</span>
                </span>

                {member.isLeader ? <Badge tone="outline">팀장</Badge> : null}

                {canManage && !member.isLeader ? (
                  <span className={styles.rowActions}>
                    {/* 대상은 버튼 값에 실린다 — 줄마다 숨은 입력을 두지 않는다 */}
                    <Button
                      type="submit"
                      name="op"
                      value={`transfer:${member.userId}`}
                      variant="quiet"
                      size="sm"
                      disabled={pending}
                      formNoValidate
                    >
                      팀장 넘기기
                    </Button>
                    {asking === askKey ? (
                      <Button
                        type="submit"
                        name="op"
                        value={`remove:${member.userId}`}
                        variant="soft"
                        size="sm"
                        disabled={pending}
                        formNoValidate
                      >
                        정말 내보낼까요?
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="quiet"
                        size="sm"
                        onClick={() => setAsking(askKey)}
                      >
                        내보내기
                      </Button>
                    )}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {canManage ? (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>초대</h2>

          {code ? (
            <div className={styles.invite}>
              <p className={styles.code}>{code}</p>
              <p className={styles.inviteHint}>
                이 코드를 팀원에게 전해 주세요. 받은 사람이{" "}
                <span className={styles.url}>{url}</span>에서 코드를 넣으면
                합류합니다.
                {invite ? ` ${invite.expiresAt}까지 유효합니다.` : null}
                {invite?.email ? ` (${invite.email}에게 보냈습니다)` : null}
              </p>
              <div className={styles.inviteActions}>
                <Button
                  type="button"
                  variant="soft"
                  size="sm"
                  onClick={() => void copy()}
                >
                  {copied ? "복사했습니다" : "코드 복사"}
                </Button>
                {invite ? (
                  <Button
                    type="submit"
                    name="op"
                    value={`revoke:${invite.id}`}
                    variant="quiet"
                    size="sm"
                    disabled={pending}
                    formNoValidate
                  >
                    초대 취소
                  </Button>
                ) : null}
              </div>
            </div>
          ) : full ? (
            <p className={styles.hint}>
              팀원이 다 찼습니다. 더 초대할 자리가 없습니다.
            </p>
          ) : (
            <div className={styles.inviteForm}>
              <label className={styles.label} htmlFor="email">
                팀원 이메일 <span className={styles.optional}>선택</span>
              </label>
              <input
                className={styles.input}
                id="email"
                name="email"
                type="email"
                autoComplete="off"
                placeholder="비워두면 코드만 발급합니다"
              />
              <Button
                type="submit"
                name="op"
                value="invite"
                variant="primary"
                disabled={pending}
              >
                초대 코드 만들기
              </Button>
            </div>
          )}
        </section>
      ) : null}

      {!viewerIsLeader ? (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>팀에서 나가기</h2>
          <p className={styles.hint}>
            나가면 이 팀의 대시보드를 볼 수 없습니다. 팀의 제출과 지표는 그대로
            남습니다.
          </p>
          {asking === "leave" ? (
            <Button
              type="submit"
              name="op"
              value="leave"
              variant="soft"
              size="sm"
              disabled={pending}
            >
              정말 나갈까요?
            </Button>
          ) : (
            <Button
              type="button"
              variant="quiet"
              size="sm"
              onClick={() => setAsking("leave")}
            >
              팀에서 나가기
            </Button>
          )}
        </section>
      ) : null}
    </form>
  );
}
