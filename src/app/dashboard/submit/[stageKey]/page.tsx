import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Badge } from "@/components/Badge";
import { Scaffold } from "@/components/Scaffold";
import { EntryStage, StageKey, SubmissionStatus } from "@/generated/prisma/enums";
import { canSubmitStage, guardPage, toAccessContext } from "@/lib/access";
import { isStageKey, type S1Payload } from "@/lib/submission";
import { loadStageView } from "@/lib/submission-store";

import { S1Form, type S1Defaults } from "./S1Form";

import styles from "./submit.module.css";

/*
  스테이지 제출 — PLN3 2장 「스테이지 제출」 · 라우트는 `/dashboard/submit/:stageKey`.

  라우트 하나가 s1~s5를 받고 **스테이지마다 폼이 다르다**(PLN6 4장). 지금 채운 것은
  s1이고 나머지는 자리표시다 — s2는 지표 칸이 입력인지 확인인지가 미정(PLN6 6장 5번),
  s3~s5는 다음 순서다.

  ⚠️ 화면은 팀원에게도 열려 있고 **제출 버튼만 팀장**이다(canSubmitStage).
  팀원이 자기 팀이 무엇을 냈는지 못 보면 2인 팀에서 확인할 방법이 없다.
*/

export const metadata: Metadata = {
  title: "스테이지 제출",
  robots: { index: false, follow: false },
};

const EMPTY: S1Defaults = {
  concept: "",
  problemDoc: "",
  coreFeature: "",
  notBuilding: [],
  riskiest: "",
  memo: "",
  guideChecks: [],
  chargeType: "payment",
};

/* 저장된 payload는 JSON이라 타입이 없다. 화면에 넣기 전에 문자열로 좁힌다 */
function toDefaults(payload: unknown, chargeType: string): S1Defaults {
  const p = (payload ?? {}) as Partial<S1Payload>;
  return {
    concept: p.concept ?? "",
    problemDoc: p.problemDoc ?? "",
    coreFeature: p.coreFeature ?? "",
    notBuilding: Array.isArray(p.notBuilding) ? p.notBuilding : [],
    riskiest: p.riskiest ?? "",
    memo: p.memo ?? "",
    guideChecks: Array.isArray(p.guideChecks) ? p.guideChecks : [],
    chargeType,
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ stageKey: string }>;
}) {
  const { stageKey } = await params;
  if (!isStageKey(stageKey)) notFound();

  const next = `/dashboard/submit/${stageKey}`;
  const { viewer, access } = await guardPage("dashboardSubmit", next);
  if (!viewer.season || !viewer.entry) notFound();

  const view = await loadStageView(viewer.entry.id, viewer.season.id, stageKey);
  /* stages 표에 없는 스테이지 = 이 시즌에 없는 단계다 */
  if (!view) notFound();

  /*
    제출 가능 여부. EntryStage와 StageKey가 s1~s5에서 값이 겹쳐 그대로 넘긴다 —
    canSubmitStage가 진도·게이트 대기·팀장 여부를 한 번에 본다.
  */
  const submit = canSubmitStage(stageKey as unknown as EntryStage, toAccessContext(viewer));
  const canWrite = access.ok && submit.ok && view.editable;

  if (stageKey !== StageKey.s1) {
    return (
      <Scaffold
        title={`${view.name} 제출`}
        purpose="스테이지별 필드는 PLN6 필드 정의서 4장이 정본이다."
        locked={submit.ok ? undefined : submit.message}
        elements={[
          "스테이지별 필드 (PLN6 4장)",
          "가이드 완료 체크리스트",
          "증빙 파일 첨부 — R2 연결 대기",
          "재제출 — 마감 전까지 몇 번이든",
        ]}
        blockedBy={
          stageKey === StageKey.s2
            ? "s2의 지표 칸(방문자 수·사전 신청자 수)이 입력 폼인지 확인 화면인지 정해지지 않았습니다. 랜딩도 서브도메인에 올리게 하면 자동 집계가 되어 읽기 전용이 됩니다(PLN6 6장 5번)."
            : undefined
        }
      />
    );
  }

  const status = view.submission?.status;

  return (
    <section className={styles.root}>
      <header className={styles.head}>
        <div className={styles.headTop}>
          <p className={styles.stage}>
            STAGE 1 · {view.name}
            {view.isGate ? <Badge tone="outline">심사 게이트</Badge> : null}
          </p>
          <StatusBadge status={status} />
        </div>
        <h1 className={styles.title}>문제 정의 1페이지를 제출합니다</h1>
        <p className={styles.purpose}>
          가이드 CH.1에서 AI로 만든 결과를 옮겨 적는 자리입니다. 다음 스테이지
          랜딩의 준비물이 그대로 여기 들어갑니다.
        </p>

        {!canWrite ? (
          <p className={styles.locked}>
            {/* 못 쓰는 이유가 셋이다 — 권한(팀장 아님) · 진도 · 마감/잠금 */}
            {!access.ok
              ? access.message
              : !submit.ok
                ? submit.message
                : view.lockedReason === "STAGE_CLOSED"
                  ? "제출 마감이 지나 더 낼 수 없습니다. 내용은 그대로 볼 수 있습니다."
                  : "심사가 시작돼 더 고칠 수 없습니다."}
          </p>
        ) : null}
      </header>

      <S1Form
        defaults={
          view.submission
            ? toDefaults(view.submission.payload, view.chargeType)
            : { ...EMPTY, chargeType: view.chargeType }
        }
        chargeTypeLocked={view.chargeTypeLocked}
        canWrite={canWrite}
      />
    </section>
  );
}

function StatusBadge({ status }: { status: SubmissionStatus | undefined }) {
  if (!status) return null;
  if (status === SubmissionStatus.draft) {
    return <Badge tone="neutral">임시 저장</Badge>;
  }
  if (status === SubmissionStatus.submitted) {
    return <Badge tone="lime">제출 완료</Badge>;
  }
  return <Badge tone="outline">심사 중 · 잠김</Badge>;
}
