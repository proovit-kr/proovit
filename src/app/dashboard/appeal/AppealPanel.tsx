"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/Button";
import { Field, Select, Textarea } from "@/components/Field";
import { Card } from "@/components/Surface";
import { Files } from "@/app/dashboard/submit/[stageKey]/parts";
import { APPEAL_BUTTON, APPEAL_FIELD, APPEAL_SUM } from "@/content/appeal";
import { APPEAL_BUSINESS_DAYS, APPEAL_REASON_MAX, RESPONSE_BUSINESS_DAYS } from "@/lib/appeal";

import hub from "../hub.module.css";

import { type AppealState, fileAppeal } from "./actions";

import styles from "./appeal.module.css";

/*
  소명 ① 작성 — 시안 `.pane[data-id="ap-write"]`.

  고르개가 바뀌면 접수 기한 상자가 그 대상의 기한으로 바뀐다 — 그래서 클라이언트다.
  이미 접수한 대상은 고르개에서 잠근다(두 번 내면 회신 기한이 둘이 된다).

  증빙은 스테이지 제출과 같은 `Files`(`scope="appeal"`) — 고르면 곧바로 올리고
  키를 hidden으로 쌓는다. 접수할 때 그 키들이 소명 행에 붙는다.
*/

export type TargetOption = {
  value: string;
  label: string;
  appealed: boolean;
  /** 통지일 「10.22」 */
  noticed: string;
  /** 접수 기한 「10.29 23:59」 */
  by: string;
};

const INITIAL: AppealState = {};

export function AppealPanel({
  targets,
  canWrite,
}: {
  targets: TargetOption[];
  canWrite: boolean;
}) {
  const [state, formAction, pending] = useActionState(fileAppeal, INITIAL);
  const open = targets.filter((t) => !t.appealed);
  const [chosen, setTarget] = useState(() => state.values?.target ?? "");
  const [reason, setReason] = useState(state.values?.reason ?? "");

  /*
    ⚠️ 고른 값이 지금 목록에 없으면 첫 대상으로 — 상태는 마운트 때 한 번 잡히는데
    대상은 바뀐다(개발 바가 제재를 새로 만들면 id가 바뀐다, 접수 뒤 서버가 다시
    그린다). 옛 id를 쥐고 있으면 기한 상자가 「—」가 된다.
  */
  const target = targets.some((t) => t.value === chosen) ? chosen : (open[0]?.value ?? "");
  const picked = targets.find((t) => t.value === target) ?? null;
  const locked = !canWrite || open.length === 0;

  return (
    <form action={formAction} noValidate>
      <Field label={APPEAL_FIELD.target} htmlFor="target">
        <Select
          id="target"
          name="target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          disabled={locked}
        >
          {open.length === 0 ? <option value="">{APPEAL_FIELD.noTarget}</option> : null}
          {targets.map((t) => (
            <option key={t.value} value={t.value} disabled={t.appealed}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={APPEAL_FIELD.reason} htmlFor="reason">
        <Textarea
          id="reason"
          name="reason"
          style={{ minHeight: "130px" }}
          maxLength={APPEAL_REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={locked}
        />
      </Field>

      <Field label={APPEAL_FIELD.files}>
        <Files
          name="files"
          scope="appeal"
          slot="evidence"
          defaultValue={[]}
          locked={locked}
          notOpen
        />
      </Field>

      <Card className={hub.sum} style={{ marginBottom: "18px" }}>
        <div>
          <span>{APPEAL_SUM.deadline}</span>
          <b>
            {picked
              ? APPEAL_SUM.deadlineText(picked.by, picked.noticed, APPEAL_BUSINESS_DAYS)
              : APPEAL_SUM.deadlineBefore(APPEAL_BUSINESS_DAYS)}
          </b>
        </div>
        <div>
          <span>{APPEAL_SUM.reply}</span>
          <b>{APPEAL_SUM.replyBefore(RESPONSE_BUSINESS_DAYS)}</b>
        </div>
      </Card>

      {/* 길이는 서버가 본다(시안에 글자 수 칸이 없다) — 짧으면 아래 문구로 돌아온다 */}
      <Button type="submit" variant="primary" disabled={locked || pending}>
        {pending ? APPEAL_BUTTON.pending : APPEAL_BUTTON.submit}
      </Button>
      {state.message ? (
        <p className={styles.err} role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
