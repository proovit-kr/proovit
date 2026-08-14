import type { Metadata } from "next";

import { EmptyState } from "@/components/EmptyState";
import { guardPage } from "@/lib/access";
import { RESULT_LABEL } from "@/lib/judging";
import { loadJudgingQueue } from "@/lib/judging-store";

import { JudgeForm } from "./JudgeForm";

import styles from "./judging.module.css";

/*
  심사 콘솔 — PLN3 2장 「게이트 제출을 보고 통과·보완·미통과를 정한다」.

  ⚠️ **점수를 받지 않는다.** 채점식·가중치가 확정되지 않았고(PLN6 6장 1·2번),
  통과 컷은 규칙 제9조 ②가 비공개로 정한 값이다. 지금 배점 칸을 만들면 심사위원이
  임의 기준으로 숫자를 넣게 되고 그 숫자가 나중에 근거로 남는다.
  받는 것은 규칙이 요구하는 것뿐이다 — **결과와 사유 요지**(제9조 ③).

  ⚠️ 제출 내용(payload)을 그대로 펼쳐 보여준다. 심사 화면에서 제출물을 못 보면
  다른 탭을 열어 맞춰보게 되고, 그러면 어느 팀 것을 보고 판정했는지가 흐려진다.
*/

export const metadata: Metadata = {
  title: "심사",
  robots: { index: false, follow: false },
};

const WHEN = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** payload는 JSON이라 모양이 스테이지마다 다르다. 키-값 줄로 펼친다 */
function entries(payload: unknown): [string, string][] {
  if (!payload || typeof payload !== "object") return [];
  return Object.entries(payload as Record<string, unknown>).map(
    ([key, value]) => [
      key,
      Array.isArray(value)
        ? value.map((item) => String(item)).join(" · ")
        : String(value ?? ""),
    ],
  );
}

export default async function Page() {
  const { viewer } = await guardPage("adminJudging", "/admin/judging");
  const queue = viewer.season ? await loadJudgingQueue(viewer.season.id) : [];
  const pending = queue.filter((item) => item.judgment === null).length;

  return (
    <section className={styles.root}>
      <header className={styles.head}>
        <h1 className={styles.title}>심사</h1>
        <p className={styles.sub}>
          게이트 스테이지 제출 {queue.length}건 · 판정 대기 {pending}건.
          결과와 사유 요지를 남기면 참가팀에게 그대로 통지됩니다(제9조 ③).
          배점은 채점식이 확정된 뒤에 붙입니다.
        </p>
      </header>

      {queue.length === 0 ? (
        <EmptyState
          title="심사할 제출이 없습니다"
          detail="게이트 스테이지(s2·s5) 제출이 접수되면 여기에 쌓입니다."
        />
      ) : (
        <ul className={styles.list}>
          {queue.map((item) => (
            <li key={item.submissionId} className={styles.item}>
              <div className={styles.main}>
                <p className={styles.team}>
                  {item.teamName}
                  <span className={styles.stage}>
                    {item.stageKey.toUpperCase()}
                  </span>
                  {item.judgment ? (
                    <span className={styles.judged}>
                      {RESULT_LABEL[item.judgment.result] ??
                        item.judgment.result}
                      {" · "}
                      {WHEN.format(item.judgment.judgedAt)}
                    </span>
                  ) : null}
                </p>
                <p className={styles.idea}>{item.ideaTitle}</p>
                <p className={styles.when}>
                  {item.submittedAt
                    ? `${WHEN.format(item.submittedAt)} 제출`
                    : "제출 시각 없음"}
                </p>

                <dl className={styles.payload}>
                  {entries(item.payload).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>

                {item.evidenceUrls.length > 0 ? (
                  <p className={styles.evidence}>
                    증빙 {item.evidenceUrls.length}건
                  </p>
                ) : null}

                {item.judgment?.feedback ? (
                  <p className={styles.feedbackDone}>
                    사유 — {item.judgment.feedback}
                  </p>
                ) : null}
              </div>

              {/* 판정이 끝난 건은 폼을 주지 않는다. 정정은 이의신청 절차다(제11조 ③) */}
              {item.judgment ? null : (
                <JudgeForm submissionId={item.submissionId} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
