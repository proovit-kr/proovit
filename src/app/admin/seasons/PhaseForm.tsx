"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/Button";
import { REASON_MIN } from "@/lib/admin";

import { changeSeasonPhase, type SeasonActionState } from "./actions";

import styles from "./seasons.module.css";

/*
  페이즈 전환 폼.

  고른 값이 지금 페이즈와 같으면 버튼을 잠근다. 그리고 **바뀌면 무엇이 열리는지**를
  한 줄로 미리 보여준다 — 운영자가 `racing`이라는 값만 보고 누르면 리더보드가
  공개된다는 사실을 모른 채 누르게 된다.
*/

const INITIAL: SeasonActionState = {};

/** 이 페이즈가 되면 참가자·관전자에게 무엇이 달라지는가 */
const EFFECT: Record<string, string> = {
  draft: "공개 화면에서 시즌이 사라집니다.",
  pre_apply: "사전신청만 받고 참가 신청은 닫힙니다.",
  recruiting: "참가 신청(/apply)이 열립니다.",
  racing: "리더보드와 참가작 페이지가 공개되고 제출이 열립니다.",
  awarded: "결과·수상 내역이 열리고 제출이 닫힙니다.",
  archived: "모든 쓰기가 잠기고 조회만 됩니다.",
};

export function PhaseForm({
  seasonId,
  current,
  phases,
}: {
  seasonId: string;
  current: string;
  phases: string[];
}) {
  const [state, formAction, pending] = useActionState(
    changeSeasonPhase,
    INITIAL,
  );
  const [next, setNext] = useState(current);

  const same = next === current;

  return (
    <form action={formAction} className={styles.phaseForm}>
      <input type="hidden" name="seasonId" value={seasonId} />

      {state.message ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : null}

      <div className={styles.phaseRow}>
        <label className={styles.label} htmlFor={`phase-${seasonId}`}>
          페이즈 바꾸기
        </label>
        <select
          id={`phase-${seasonId}`}
          name="phase"
          className={styles.select}
          value={next}
          onChange={(event) => setNext(event.target.value)}
        >
          {phases.map((phase) => (
            <option key={phase} value={phase}>
              {phase}
              {phase === current ? " (지금)" : ""}
            </option>
          ))}
        </select>
      </div>

      {!same ? (
        <p className={styles.effect}>{EFFECT[next] ?? ""}</p>
      ) : (
        <p className={styles.effect}>지금과 같은 값입니다.</p>
      )}

      <label className={styles.label} htmlFor={`reason-${seasonId}`}>
        사유
      </label>
      <textarea
        id={`reason-${seasonId}`}
        name="reason"
        className={styles.reason}
        rows={2}
        minLength={REASON_MIN}
        placeholder="왜 지금 전환하는지 적어 주세요. 감사 로그와 일정표에 그대로 남습니다."
      />

      <Button type="submit" variant="soft" size="sm" disabled={pending || same}>
        {pending ? "전환 중…" : "전환"}
      </Button>
    </form>
  );
}
