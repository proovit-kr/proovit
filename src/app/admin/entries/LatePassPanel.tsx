"use client";

import { useActionState, useState } from "react";

import { Badge, type BadgeTone } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Toast, useToast } from "@/components/Toast";
import { latePassUrl, type LatePassStatus } from "@/lib/late-entry";

import hub from "../../dashboard/hub.module.css";
import c from "../console.module.css";
import { ReasonModal } from "../ReasonModal";
import { manageLatePass, type LatePassActionState } from "./actions";
import styles from "./entries.module.css";

/*
  지각 편입 — **시안에 없는 칸**(page.tsx 머리 주석). 2026-09-26 수연 지시 · PRD OPEN-6.

  「편입 링크 만들기」 → 사유 모달 → 만든 링크를 옮겨 적는 상자(`.keybox`)에 띄우고
  복사 버튼을 단다. 복사 방식은 측정 연동·팀 관리와 같다(클립보드가 막히면 토스트로
  알린다). 메일은 보내지 않는다 — 운영자가 문의가 온 채널로 링크를 보낸다.

  아래 최근 링크 목록에서 대기 중인 것은 다시 복사하거나 취소할 수 있다. 취소도
  사유 모달을 거친다(감사 로그 `entry.late_pass_revoke`).

  링크 주소의 앞부분(`origin`)은 page.tsx가 서버에서 정해 넘긴다(`latePassOrigin`) —
  운영에서는 메일 링크와 같은 정규 주소, 개발·스테이징에서는 그 DB를 쓰는 지금 주소다.

  ⚠️ 버튼을 감추는 것은 안내일 뿐이다. 기간·사유·권한은 액션과 store가 다시 본다.
*/

export type LatePassRowView = {
  id: string;
  code: string;
  label: string;
  /** 「09.26 14:02」 */
  created: string;
  /** 「10.04 23:59」 */
  expires: string;
  status: LatePassStatus;
  teamName: string | null;
  reason: string;
};

/* 상태 배지 — 시안에 없는 칸이라 배지 역할표(Badge.module.css)대로 골랐다(내가 정함, 수연 확인 대기) */
const STATUS: Record<LatePassStatus, { label: string; tone: BadgeTone; dashed?: boolean }> = {
  pending: { label: "대기", tone: "warn" },
  used: { label: "사용됨", tone: "lime" },
  expired: { label: "만료", tone: "gray" },
  revoked: { label: "취소", tone: "gray", dashed: true },
};

/* 시안이 `.keybox .cp` 버튼에 인라인으로 주는 크기(측정 연동과 같다) */
const CP = { padding: "7px 14px", fontSize: "12.5px" } as const;

const INITIAL: LatePassActionState = {};

export function LatePassPanel({
  seasonId,
  origin,
  blocked,
  deadline,
  rows,
}: {
  seasonId: string;
  /** 링크의 앞부분 `https://proovit.kr` — page.tsx `latePassOrigin` */
  origin: string;
  /** 지금 링크를 못 만드는 사유 한 줄. null이면 버튼을 그린다 */
  blocked: string | null;
  /**
   * s1 달력 마감(s1 구간의 끝) 「10.04 23:59」. 비었으면 7일만. 허브 경고줄의
   * 「s1 마감」(제출 기한, 유동 게이트)과 다른 날짜다(stage-read.ts 머리 주석)
   */
  deadline: string | null;
  rows: LatePassRowView[];
}) {
  const [state, action, pending] = useActionState(manageLatePass, INITIAL);
  const [modal, setModal] = useState<{ op: "create" } | { op: "revoke"; passId: string; label: string } | null>(null);
  const { message: toast, show } = useToast();

  /*
    **새로 성공했을 때만** 닫는다 — 렌더 중에 앞 값과 견준다. 실패(`done` 없음)까지
    「바뀌었다」로 읽으면 만들기가 한 번 된 뒤의 첫 실패에 모달이 말없이 닫혀 오류
    문구가 안 보인다 — 만들기와 취소가 이 상태 하나를 같이 쓴다(2026-09-26 리뷰 지적).

    방금 만든 링크도 성공 때만 바꾼다. 뒤이은 실패에 상자가 사라지지 않고, 다른
    성공(취소)에는 비운다 — 취소한 링크가 상자에 남지 않게.
  */
  const [seen, setSeen] = useState(state.done);
  const [created, setCreated] = useState(state.created ?? null);
  if (state.done && seen !== state.done) {
    setSeen(state.done);
    setCreated(state.created ?? null);
    setModal(null);
  }

  const copy = async (code: string) => {
    const url = latePassUrl(code, origin);
    try {
      await navigator.clipboard.writeText(url);
      show("편입 링크 복사됨");
    } catch {
      /* 클립보드를 막아둔 브라우저도 있다. 링크는 화면에 그대로 있다 */
      show(`복사 실패, 주소를 직접 옮겨 적어야 함: ${url}`);
    }
  };

  return (
    <>
      <Field
        className={styles.late}
        label="지각 편입"
        note="문의 온 사람에게 1회용 신청 링크, 메일 발송 없음"
      >
        {blocked ? (
          <p className={styles.lateBlocked} data-probe="late-blocked">
            {blocked}
          </p>
        ) : (
          <div className={styles.lateRow}>
            <Button type="button" variant="outline" onClick={() => setModal({ op: "create" })}>
              편입 링크 만들기
            </Button>
            <span className={styles.lateNote}>
              유효 7일{deadline ? `, 늦어도 s1 구간 끝 ${deadline}까지` : ""}
            </span>
          </div>
        )}

        {created ? (
          <>
            <div className={`${hub.keybox} ${styles.lateKey}`} data-probe="late-created">
              <span className={styles.lateUrl}>{latePassUrl(created.code, origin)}</span>
              <Button
                type="button"
                variant="outline"
                className={styles.cp}
                style={CP}
                onClick={() => void copy(created.code)}
              >
                복사
              </Button>
            </div>
            <p className={styles.lateNote}>
              {`만료 ${created.expires}, 한 번 신청하면 닫힘. 문의 온 채널로 전달`}
            </p>
          </>
        ) : null}

        {rows.length > 0 ? (
          <table className={`${c.atbl} ${styles.lateTbl}`} data-probe="late-passes">
            <thead>
              <tr>
                <th>LINK</th>
                <th>만든 때</th>
                <th>만료</th>
                <th>상태</th>
                <th>사유</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const st = STATUS[row.status];
                return (
                  <tr key={row.id}>
                    <td className={c.num}>{row.label}</td>
                    <td className={c.num}>{row.created}</td>
                    <td className={c.num}>{row.expires}</td>
                    <td>
                      <Badge tone={st.tone} dashed={st.dashed}>
                        {st.label}
                      </Badge>
                      {row.teamName ? (
                        <>
                          {" "}
                          <b>{row.teamName}</b>
                        </>
                      ) : null}
                    </td>
                    <td className={styles.lateReason}>{row.reason}</td>
                    <td>
                      {row.status === "pending" ? (
                        <span className={styles.lateActs}>
                          <Button
                            type="button"
                            variant="ghost"
                            className={c.tblBtn}
                            onClick={() => void copy(row.code)}
                          >
                            복사
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className={c.tblBtn}
                            onClick={() => setModal({ op: "revoke", passId: row.id, label: row.label })}
                          >
                            취소
                          </Button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </Field>

      <ReasonModal
        open={modal !== null}
        onClose={() => setModal(null)}
        action={action}
        pending={pending}
        message={state.message}
        submitLabel={modal?.op === "revoke" ? "링크 취소" : "링크 만들기"}
        fields={
          modal?.op === "revoke"
            ? { seasonId, op: "revoke", passId: modal.passId }
            : { seasonId, op: "create" }
        }
        extra={
          <p className={styles.lateModalNote}>
            {modal?.op === "revoke"
              ? `${modal.label} 취소, 이 링크로는 더 신청할 수 없음`
              : /*
                  이름·이메일·연락처는 받지 않는다 — 사유는 지우지 않는 기록(감사 로그)에
                  남고 탈퇴 익명화가 닿지 않는다(schema.prisma LateEntryPass.reason 주석)
                */
                "문의 채널·접수 일시만 적기(이름·이메일·연락처 금지), 링크 목록과 감사 로그에 남음"}
          </p>
        }
      />
      <Toast message={toast} />
    </>
  );
}
