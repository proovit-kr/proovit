"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/Button";
import { JudgmentResult } from "@/generated/prisma/enums";
import { FEEDBACK_MIN, RESULT_EFFECT, RESULT_LABEL } from "@/lib/judging";

import { submitJudgment, type JudgingState } from "./actions";

import styles from "./judging.module.css";

/*
  판정 폼.

  ⚠️ **고른 결과가 무엇을 바꾸는지 먼저 보여준다.** 「미통과」가 탈락이라는 걸
  모르고 누르면 참가팀의 시즌이 끝난다. 규칙상 미통과는 제재가 아니라 전환인데
  (제9조 ④) 그 구분도 여기서 알려준다.

  통과에도 사유를 받는다. 통과 근거가 없으면 다음 시즌에 같은 기준을 못 맞춘다.
*/

const INITIAL: JudgingState = {};

const ORDER = [
  JudgmentResult.pass,
  JudgmentResult.revision,
  JudgmentResult.fail,
];

export function JudgeForm({ submissionId }: { submissionId: string }) {
  const [state, formAction, pending] = useActionState(
    submitJudgment,
    INITIAL,
  );
  const [result, setResult] = useState<string>(JudgmentResult.pass);
  const [feedback, setFeedback] = useState("");

  const short = feedback.trim().length < FEEDBACK_MIN;

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="submissionId" value={submissionId} />

      {state.message ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : null}

      <div className={styles.results}>
        {ORDER.map((value) => (
          <label key={value} className={styles.result}>
            <input
              type="radio"
              name="result"
              value={value}
              checked={result === value}
              onChange={() => setResult(value)}
            />
            <span>{RESULT_LABEL[value]}</span>
          </label>
        ))}
      </div>

      <p className={styles.effect}>{RESULT_EFFECT[result]}</p>

      <label className={styles.label} htmlFor={`feedback-${submissionId}`}>
        사유 요지
      </label>
      <textarea
        id={`feedback-${submissionId}`}
        name="feedback"
        className={styles.feedback}
        rows={3}
        minLength={FEEDBACK_MIN}
        value={feedback}
        onChange={(event) => setFeedback(event.target.value)}
        placeholder="어느 지표·어느 항목을 근거로 판단했는지 적어 주세요. 참가팀에게 그대로 통지됩니다."
      />

      <Button
        type="submit"
        variant="soft"
        size="sm"
        disabled={pending || short}
      >
        {pending ? "판정 중…" : "판정하기"}
      </Button>
    </form>
  );
}
