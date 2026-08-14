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

export default async function Page() {
  const { viewer, access } = await guardPage(
    "dashboardMeasurement",
    "/dashboard/measurement",
  );
  if (!viewer.entry || !viewer.team) notFound();

  const view = await loadMeasurement(viewer.entry.id);
  const canWrite = access.ok && viewer.team.isLeader;

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
      */}
      <section className={styles.pending}>
        <h2 className={styles.pendingTitle}>지금 어디까지 됐나</h2>
        <ul className={styles.steps}>
          <li className={view.hostname ? styles.stepDone : styles.step}>
            주소 등록 {view.hostname ? "— 완료" : "— 아직"}
          </li>
          <li className={view.verifiedAt ? styles.stepDone : styles.step}>
            소유 확인 — 측정 경로가 확정되면 자동으로 진행됩니다
          </li>
          <li className={styles.step}>
            집계 시작 — 소유 확인이 끝난 다음 날부터 쌓입니다
          </li>
        </ul>
      </section>
    </section>
  );
}
