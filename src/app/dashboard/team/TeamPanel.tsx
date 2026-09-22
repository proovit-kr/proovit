"use client";

import { useActionState, useState } from "react";

import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Modal } from "@/components/Modal";
import { Card } from "@/components/Surface";
import { Toast, useToast } from "@/components/Toast";

import hub from "../hub.module.css";
import { manageTeam, type TeamState } from "./actions";

import styles from "./team.module.css";

/*
  팀 관리의 쓰기 절반 — 시안 `#scr-team`.

  클라이언트 컴포넌트인 이유는 셋이다 — ① 초대 코드를 그 자리에서 복사해야 하고
  ② 강퇴·이양·나가기는 되돌릴 수 없어 모달로 한 번 더 묻어야 하고(시안
  `mdl-kick`·`mdl-transfer`) ③ 실패 문구를 폼 옆에 붙여야 한다.

  ⚠️ 여기서 폼을 감추는 것은 **안내일 뿐 방어가 아니다.** 실제 차단은 서버 액션이
  `canManageTeam()`을 다시 부르는 것으로 한다(actions.ts 머리 주석).

  ⚠️ 모달은 `<form>` 안에 둔다. 실행 버튼이 `name=op value=remove:<id>`를 실은
  제출 버튼이라 폼 밖으로 나가면 대상이 안 실린다. 모달을 닫는 것은 클릭이 아니라
  **액션이 돌아온 뒤**다 — 클릭에서 닫으면 제출 버튼이 제출 전에 떨어져 나가
  `op`가 빈 채로 간다. 그래서 「물을 때의 액션 상태」를 함께 기억해 두고, 상태가
  바뀌면(성공이든 실패든) 열림이 저절로 풀리게 파생한다 — effect로 닫지 않는다.

  시안의 「초대 메일 보내기」는 코드 발급으로 옮겼다. 메일 발송(Resend)이 아직
  안 붙어 있어 어느 쪽이든 코드를 직접 전하는데(lib/team.ts `InviteEmailSchema`
  주석), 시안 ①의 힌트가 그 길을 이미 적고 있다 — 「코드로 합류하면 초대 메일
  없이 바로 팀이 완성돼요」.
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
  expiresAt: string;
};

const INITIAL: TeamState = {};

/* 시안이 `.keybox .cp` 버튼에 인라인으로 주는 크기 */
const CP = { padding: "7px 14px", fontSize: "12.5px" } as const;
const CP_SM = { padding: "6px 10px", fontSize: "12px" } as const;
/* 시안 `.btn-ghost` 위의 `style="color:var(--danger)"` — 강퇴·취소·나가기 */
const DANGER = { color: "var(--danger)" } as const;

type Ask = (
  | { kind: "remove"; member: MemberView }
  | { kind: "transfer"; member: MemberView }
  | { kind: "leave" }
) & {
  /** 물을 때의 액션 상태. 액션이 돌아와 상태가 바뀌면 모달이 닫힌다 */
  at: TeamState;
};

export function TeamPanel({
  teamName,
  members,
  invite,
  joinedWith,
  full,
  canManage,
  viewerId,
  viewerIsLeader,
}: {
  teamName: string;
  members: MemberView[];
  invite: InviteView | null;
  /** 팀을 완성한 코드. 시안 ①의 초대코드 상자 */
  joinedWith: string | null;
  full: boolean;
  canManage: boolean;
  viewerId: string;
  viewerIsLeader: boolean;
}) {
  const [state, formAction, pending] = useActionState(manageTeam, INITIAL);
  /* 되돌릴 수 없는 버튼은 모달로 한 번 더 묻는다. 무엇을 묻는 중인지만 기억한다 */
  const [asked, setAsk] = useState<Ask | null>(null);
  /* 액션이 돌아오면(성공이든 실패든) 상태가 바뀌어 저절로 닫힌다. 실패 문구는 폼 위에 선다 */
  const ask = asked && asked.at === state ? asked : null;
  const { message: toast, show } = useToast();

  const leader = members.find((m) => m.isLeader);
  const others = members.filter((m) => !m.isLeader);
  const solo = members.length < 2;

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      show("초대 코드를 복사했어요");
    } catch {
      /* 클립보드를 막아둔 브라우저도 있다. 코드는 화면에 그대로 있다 */
      show("복사하지 못했어요. 코드를 직접 옮겨 적어 주세요");
    }
  };

  return (
    <form action={formAction} noValidate>
      {state.message ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : null}

      {/* ── 요약(`.card.hb-sum`) ─────────────────────────── */}
      <Card className={`${hub.sum} ${styles.sum}`}>
        <div>
          <span>팀명</span>
          <b>{teamName}</b>
        </div>
        {solo ? (
          <div>
            <span>구성</span>
            <b>개인 참가 ({members.length}인)</b>
          </div>
        ) : (
          <>
            <div>
              <span>팀장</span>
              <b>
                {leader?.nickname ?? "-"}
                {leader ? (
                  <Badge tone="lime" className={styles.leaderBadge}>
                    팀장
                  </Badge>
                ) : null}
              </b>
            </div>
            <div>
              <span>팀원</span>
              <b>{others.map((m) => m.nickname).join(", ")}</b>
            </div>
          </>
        )}
      </Card>

      {/* ── 초대(② 개인 참가) ─────────────────────────────── */}
      {canManage && !full && !invite ? (
        <div className={`${hub.act} ${hub.hero} ${styles.actGap}`}>
          <div>
            <h3>한 명 더 초대할 수 있어요</h3>
            <p>혼자여도 완주할 수 있게 설계했지만, 둘이면 더 빨라요.</p>
          </div>
          <Button
            type="submit"
            name="op"
            value="invite"
            variant="primary"
            className={hub.actBtn}
            disabled={pending}
          >
            초대 코드 만들기
          </Button>
        </div>
      ) : null}

      {invite ? (
        <Field
          label="초대 대기"
          hint={`코드로 합류하면 초대 메일 없이 바로 팀이 완성돼요. ${invite.expiresAt}까지 유효해요.`}
        >
          <div className={styles.keybox}>
            {invite.code}
            <Badge tone="warn">수락 대기</Badge>
            <span className={styles.cp}>
              <Button
                type="button"
                variant="outline"
                style={CP}
                onClick={() => void copy(invite.code)}
              >
                복사
              </Button>
              {canManage ? (
                <Button
                  type="submit"
                  name="op"
                  value={`revoke:${invite.id}`}
                  variant="ghost"
                  style={{ ...CP_SM, color: "var(--danger)" }}
                  disabled={pending}
                  formNoValidate
                >
                  취소
                </Button>
              ) : null}
            </span>
          </div>
        </Field>
      ) : !solo && joinedWith ? (
        /* 시안 ①의 초대코드 상자 — 이 팀을 완성한 코드다 */
        <Field
          label="초대코드"
          hint="코드로 합류하면 초대 메일 없이 바로 팀이 완성돼요."
        >
          <div className={styles.keybox}>
            {joinedWith}
            <span className={styles.cp}>
              <Button
                type="button"
                variant="outline"
                style={CP}
                onClick={() => void copy(joinedWith)}
              >
                복사
              </Button>
            </span>
          </div>
        </Field>
      ) : null}

      {/* ── 강퇴·이양(① 2인 팀, 팀장만) ─────────────────── */}
      {canManage
        ? others.map((member) => (
            <div key={member.userId} className={styles.rows}>
              <div className={hub.act}>
                <div>
                  <h3>팀원 내보내기</h3>
                  <p>{member.nickname} 님을 팀에서 내보내요.</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className={hub.actBtn}
                  style={DANGER}
                  onClick={() => setAsk({ kind: "remove", member, at: state })}
                >
                  강퇴
                </Button>
              </div>
              <div className={hub.act}>
                <div>
                  <h3>팀장 이양</h3>
                  <p>이양하면 초대와 강퇴 권한이 넘어가요.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className={hub.actBtn}
                  onClick={() => setAsk({ kind: "transfer", member, at: state })}
                >
                  팀장 이양
                </Button>
              </div>
            </div>
          ))
        : null}

      {/* ── 나가기(팀원만. 시안에 없는 상자라 같은 `.act`로 낮게 둔다) ── */}
      {!viewerIsLeader && members.some((m) => m.userId === viewerId) ? (
        <div className={hub.act}>
          <div>
            <h3>팀에서 나가기</h3>
            <p>나가면 이 팀의 대시보드를 볼 수 없어요. 팀의 제출과 지표는 그대로 남아요.</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            className={hub.actBtn}
                  style={DANGER}
            onClick={() => setAsk({ kind: "leave", at: state })}
          >
            나가기
          </Button>
        </div>
      ) : null}

      {/* ── 확인 모달(시안 mdl-kick · mdl-transfer) ─────────── */}
      <Modal
        open={ask?.kind === "remove"}
        onClose={() => setAsk(null)}
        title={`${ask?.kind === "remove" ? ask.member.nickname : ""} 님을 내보낼까요?`}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setAsk(null)}>
              취소
            </Button>
            <Button
              type="submit"
              name="op"
              value={ask?.kind === "remove" ? `remove:${ask.member.userId}` : ""}
              variant="danger"
              disabled={pending}
              formNoValidate
            >
              {pending ? "내보내는 중…" : "내보내기"}
            </Button>
          </>
        }
      >
        <p>내보내면 해당 계정은 이 팀의 제출과 지표에 더 이상 접근할 수 없어요.</p>
      </Modal>

      <Modal
        open={ask?.kind === "transfer"}
        onClose={() => setAsk(null)}
        title="팀장을 이양할까요?"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setAsk(null)}>
              취소
            </Button>
            <Button
              type="submit"
              name="op"
              value={ask?.kind === "transfer" ? `transfer:${ask.member.userId}` : ""}
              variant="primary"
              disabled={pending}
              formNoValidate
            >
              {pending ? "이양하는 중…" : "이양하기"}
            </Button>
          </>
        }
      >
        <p>
          {ask?.kind === "transfer" ? ask.member.nickname : ""} 님이 새 팀장이 되고,
          초대, 강퇴, 이양 권한이 넘어가요.{" "}
          <b className={styles.dangerText}>이 작업은 되돌릴 수 없어요.</b>
        </p>
      </Modal>

      <Modal
        open={ask?.kind === "leave"}
        onClose={() => setAsk(null)}
        title="팀에서 나갈까요?"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setAsk(null)}>
              취소
            </Button>
            <Button
              type="submit"
              name="op"
              value="leave"
              variant="danger"
              disabled={pending}
              formNoValidate
            >
              {pending ? "나가는 중…" : "나가기"}
            </Button>
          </>
        }
      >
        <p>
          나가면 이 팀의 대시보드를 볼 수 없어요. 팀의 제출과 지표는 그대로 남아요.
          다시 들어오려면 팀장이 새로 초대해야 해요.
        </p>
      </Modal>

      <Toast message={toast} />
    </form>
  );
}
