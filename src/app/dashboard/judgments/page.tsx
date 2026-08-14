import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { JudgmentResult, SubmissionStatus } from "@/generated/prisma/enums";
import { guardPage } from "@/lib/access";
import { loadJudgments, type StageJudgment } from "@/lib/dashboard-read";

import styles from "./judgments.module.css";

/*
  심사 결과 — PLN3 2장 「내 통과·보류·탈락 결과와 그 근거」.

  읽기 전용이다. 판정은 운영자가 심사 콘솔에서 만들고 여기서는 그것만 보여준다.

  ⚠️ 점수를 계산하지 않는다. 채점식이 확정되지 않았고(PLN6 6장), 화면이 자기 식으로
  계산하면 심사 콘솔이 낸 숫자와 어긋난다. `judgments.score_breakdown`에 담긴 것만
  그대로 보여주고, 없으면 없다고 말한다.

  ⚠️ 1차와 2차의 공개 범위가 다르다 — **2차는 배점까지, 1차는 결과와 근거만**
  (API 명세서 v0.2 §9.1 · 스키마 `judgments.score_breakdown` 주석).
*/

export const metadata: Metadata = {
  title: "심사 결과",
  robots: { index: false, follow: false },
};

const DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
});

const RESULT_LABEL: Record<string, string> = {
  [JudgmentResult.pass]: "통과",
  [JudgmentResult.revision]: "보완 요청",
  [JudgmentResult.fail]: "미통과",
};

export default async function Page() {
  const { viewer, access } = await guardPage(
    "dashboardJudgments",
    "/dashboard/judgments",
  );
  if (!viewer.entry || !viewer.season) notFound();

  /*
    진도가 게이트에 못 미치면 canAccess가 409로 막는다(minStage: s2).
    그때는 조회할 것도 없으므로 화면만 그리고 끝낸다.
  */
  const stages = access.ok
    ? await loadJudgments(viewer.entry.id, viewer.season.id)
    : [];
  const judged = stages.filter((s) => s.judgment !== null);

  return (
    <section className={styles.root}>
      <header className={styles.head}>
        <h1 className={styles.title}>심사 결과</h1>
        <p className={styles.purpose}>
          게이트별 판정과 그 근거입니다. 1차 심사는 결과와 항목별 근거를 공개하고
          배점은 비공개, 2차 심사는 배점까지 공개합니다.
        </p>
        {!access.ok ? <p className={styles.locked}>{access.message}</p> : null}
      </header>

      {access.ok && judged.length === 0 ? (
        <EmptyState
          title="아직 판정이 없습니다"
          detail="첫 게이트는 s2(랜딩·수요조사)입니다. 제출이 마감되면 심사가 시작되고, 결과가 나오면 알림으로 알려드립니다."
          action={
            <Link href="/dashboard" className={styles.link}>
              대시보드로 돌아가기
            </Link>
          }
        />
      ) : null}

      {access.ok ? (
        <ol className={styles.list}>
          {stages.map((stage) => (
            <StageRow key={stage.stageKey} stage={stage} />
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function StageRow({ stage }: { stage: StageJudgment }) {
  const judgment = stage.judgment;

  return (
    <li className={styles.item}>
      <div className={styles.itemHead}>
        <span className={styles.stage}>
          {stage.stageKey.toUpperCase()} · {stage.name}
          {stage.isGate ? <Badge tone="outline">게이트</Badge> : null}
        </span>
        {judgment ? (
          <Badge
            tone={
              judgment.result === JudgmentResult.pass
                ? "lime"
                : judgment.result === JudgmentResult.fail
                  ? "danger"
                  : "warn"
            }
          >
            {RESULT_LABEL[judgment.result] ?? judgment.result}
          </Badge>
        ) : (
          <span className={styles.pending}>{describePending(stage)}</span>
        )}
      </div>

      {judgment ? (
        <div className={styles.body}>
          <p className={styles.when}>{DATE.format(judgment.judgedAt)} 판정</p>
          {judgment.feedback ? (
            <p className={styles.feedback}>{judgment.feedback}</p>
          ) : (
            <p className={styles.muted}>남긴 의견이 없습니다.</p>
          )}
          {/*
            배점 공개는 2차(게이트 중 마지막)만이다. 1차 배점을 여기서 그리면
            그 숫자로 다음 팀이 역산할 수 있어 심사 자체가 흔들린다.
          */}
          {judgment.formulaVersion ? (
            <p className={styles.muted}>
              채점식 {judgment.formulaVersion} 기준으로 판정했습니다.
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** 판정이 없는 이유는 셋이다 — 안 냈다 / 냈고 기다린다 / 게이트가 아니다 */
function describePending(stage: StageJudgment): string {
  if (!stage.isGate) return "심사 없는 단계";
  if (stage.submissionStatus === null) return "제출 전";
  if (stage.submissionStatus === SubmissionStatus.draft) return "임시 저장";
  return "판정 대기";
}
