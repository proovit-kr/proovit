import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Badge } from "@/components/Badge";
import { DeployStatus } from "@/generated/prisma/enums";
import { guardPage } from "@/lib/access";
import { loadMeasurement } from "@/lib/measurement-store";

import { MeasurementForm } from "./MeasurementForm";

import styles from "./measurement.module.css";

/*
  측정 연동 — PLN3 2장. 온보딩 체크리스트의 둘째 항목이고, 여기가 끝나야 지표가 센다.

  ⚠️ **지금 만드는 것은 등록까지다.** 프록시(Cloudflare 커스텀 호스트명·라우트)와
  소유 확인 자동화는 ADR-006(측정 경로)이 8/17에 정해진 뒤에 붙인다 — 그 전에 만들면
  버린다. 그래서 상태는 「확인 대기」에서 멈추고, 화면이 그 사실을 그대로 말한다.

  ⚠️ 참가자에게 "곧 됩니다"라고 하지 않는다. 지금 할 수 있는 일(주소 등록)과
  기다리는 일(소유 확인)을 갈라서 적는다.
*/

export const metadata: Metadata = {
  title: "측정 연동",
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<string, string> = {
  [DeployStatus.pending]: "확인 대기",
  [DeployStatus.verifying]: "확인 중",
  [DeployStatus.active]: "측정 중",
  [DeployStatus.failed]: "확인 실패",
  [DeployStatus.disabled]: "측정 종료",
};

/*
  절차 세 칸. 문구가 화면 안에 흩어져 있으면 상태를 하나 추가할 때 한 군데를
  빠뜨린다.
*/
const STEPS = [
  {
    label: "주소 등록",
    failedLabel: "주소 등록",
    note: "측정 주소와 실제 배포 주소를 잇습니다",
  },
  {
    label: "소유 확인",
    failedLabel: "연결 실패",
    note: "측정 경로가 확정되면 자동으로 진행됩니다",
  },
  {
    label: "집계 시작",
    failedLabel: "집계 시작",
    note: "소유 확인이 끝난 다음 날부터 쌓입니다",
  },
] as const;

type StepState = "stepDone" | "stepNow" | "stepFailed" | "step";

/** 세 칸 중 어디에 서 있나. 실패는 두 번째 칸에서만 난다 */
function stepState(
  index: number,
  view: { hostname: string | null; verifiedAt: Date | null },
  failed: boolean,
): StepState {
  if (index === 0) return view.hostname ? "stepDone" : "stepNow";
  if (index === 1) {
    if (failed) return "stepFailed";
    if (view.verifiedAt) return "stepDone";
    return view.hostname ? "stepNow" : "step";
  }
  return view.verifiedAt ? "stepNow" : "step";
}

export default async function Page() {
  const { viewer, access } = await guardPage(
    "dashboardMeasurement",
    "/dashboard/measurement",
  );
  if (!viewer.entry || !viewer.team) notFound();

  const view = await loadMeasurement(viewer.entry.id);
  const canWrite = access.ok && viewer.team.isLeader;
  const failed = view.deployStatus === DeployStatus.failed;

  return (
    <section className={styles.root}>
      <header className={styles.head}>
        <div className={styles.headTop}>
          <h1 className={styles.title}>측정 연동</h1>
          {view.deployStatus ? (
            <Badge
              tone={
                view.deployStatus === DeployStatus.active ? "lime" : "neutral"
              }
            >
              {STATUS_LABEL[view.deployStatus] ?? view.deployStatus}
            </Badge>
          ) : null}
        </div>
        <p className={styles.purpose}>
          참가작의 방문·가입을 세는 주소를 등록합니다. 등록한 주소로 들어온
          방문만 지표가 되고, 리더보드 숫자의 근거가 됩니다.
        </p>

        {!access.ok ? (
          <p className={styles.locked}>{access.message}</p>
        ) : !viewer.team.isLeader ? (
          <p className={styles.locked}>
            등록은 팀장만 할 수 있습니다. 내용은 그대로 볼 수 있습니다.
          </p>
        ) : null}
      </header>

      {view.hostname ? (
        <dl className={styles.current}>
          <div>
            <dt>측정 주소</dt>
            <dd className={styles.mono}>{view.hostname}</dd>
          </div>
          <div>
            <dt>실제 배포 주소</dt>
            <dd className={styles.mono}>{view.originUrl ?? "—"}</dd>
          </div>
          <div>
            <dt>소유 확인</dt>
            <dd>{view.verifiedAt ? "완료" : "대기"}</dd>
          </div>
        </dl>
      ) : null}

      <MeasurementForm
        defaults={{
          label: view.label ?? "",
          originUrl: view.originUrl ?? "",
        }}
        locked={view.locked}
        canWrite={canWrite}
      />

      {/*
        지금 안 되는 것을 숨기지 않는다. "등록했는데 왜 0인가"를 여기서 답해두지
        않으면 그 질문이 전부 문의로 온다.

        세 칸을 세로 목록이 아니라 가로 띠로 그린다 — 이건 순서가 있는 절차라
        "어디서 멈춰 있나"가 한눈에 보여야 한다(시안 vsteps).
      */}
      <section className={styles.pending}>
        <h2 className={styles.pendingTitle}>지금 어디까지 됐나</h2>

        <ol className={styles.steps}>
          {STEPS.map((step, i) => {
            const state = stepState(i, view, failed);
            return (
              <li key={step.label} className={styles[state]}>
                <span className={styles.dot} aria-hidden>
                  {state === "stepDone"
                    ? "✓"
                    : state === "stepFailed"
                      ? "✕"
                      : i + 1}
                </span>
                <span className={styles.stepBody}>
                  <span className={styles.stepLabel}>
                    {state === "stepFailed" ? step.failedLabel : step.label}
                  </span>
                  <span className={styles.stepNote}>{step.note}</span>
                </span>
              </li>
            );
          })}
        </ol>

        {failed ? (
          /*
            ⚠️ 실패 원인을 지어내지 않는다. `hostnames`에 사유 칸이 없어서
            "DNS가 전파되지 않았어요" 같은 구체적인 진단을 여기서 만들면
            그게 틀렸을 때 참가자가 엉뚱한 곳을 고친다.
          */
          <p className={styles.failed}>
            연결 확인에 실패했습니다. 배포 주소가 살아 있는지 확인하고 다시
            등록해 주세요. 원인을 알기 어려우면 운영에 알려 주시면 같이
            확인하겠습니다.
          </p>
        ) : null}
      </section>
    </section>
  );
}
