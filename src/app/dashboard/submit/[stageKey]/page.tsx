import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/Badge";
import { Scaffold } from "@/components/Scaffold";
import {
  ChargeType,
  EntryStage,
  IntegrationStatus,
  StageKey,
  SubmissionStatus,
} from "@/generated/prisma/enums";
import { canSubmitStage, guardPage, toAccessContext } from "@/lib/access";
import { devNow } from "@/lib/dev-clock";
import { prisma } from "@/lib/prisma";
import { isStageKey, type S1Payload, type S3Payload } from "@/lib/submission";
import {
  loadHostnameStatus,
  loadStageView,
  type StageView,
} from "@/lib/submission-store";

import { S1Form, type S1Defaults } from "./S1Form";
import { S3Form, type S3Defaults } from "./S3Form";
import {
  S2Form,
  S4Form,
  S5Form,
  type S2Defaults,
  type S4Defaults,
  type S5Defaults,
} from "./StageForms";
import { loadStageMetrics } from "./stage-store";

import styles from "./submit.module.css";

/*
  스테이지 제출 — PLN3 2장 「스테이지 제출」 · 라우트는 `/dashboard/submit/:stageKey`.

  라우트 하나가 s1~s5를 받고 **스테이지마다 폼이 다르다**(PLN6 4장). 지금 채운 것은
  s1·s3이고 나머지는 자리표시다 — s2는 지표 칸이 입력인지 확인인지가 미정이고
  (PLN6 6장 5번), s4는 주차 반복이라 시즌 캘린더가 확정돼야 한다.

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

const EMPTY_S3: S3Defaults = {
  serviceUrl: "",
  builder: "replit",
  builderOther: "",
  signupConnected: false,
  paymentReturnRegistered: false,
  launchChecks: [],
  aiFeature: false,
  aiChecks: [],
  memo: "",
};

function toS3Defaults(payload: unknown, serviceUrl: string | null): S3Defaults {
  const p = (payload ?? {}) as Partial<S3Payload>;
  return {
    /* 제출을 안 냈어도 참가 기록에 신고된 주소가 있으면 그것을 채운다 */
    serviceUrl: p.serviceUrl ?? serviceUrl ?? "",
    builder: p.builder ?? "replit",
    builderOther: p.builderOther ?? "",
    signupConnected: p.signupConnected ?? false,
    paymentReturnRegistered: p.paymentReturnRegistered ?? false,
    launchChecks: Array.isArray(p.launchChecks) ? p.launchChecks : [],
    aiFeature: p.aiFeature ?? false,
    aiChecks: Array.isArray(p.aiChecks) ? p.aiChecks : [],
    memo: p.memo ?? "",
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

  if (stageKey === StageKey.s3) {
    const [hostname, entry] = await Promise.all([
      loadHostnameStatus(viewer.entry.id),
      prisma.entry.findUniqueOrThrow({
        where: { id: viewer.entry.id },
        select: { serviceUrl: true, chargeType: true },
      }),
    ]);

    return (
      <section className={styles.root}>
        <header className={styles.head}>
          <div className={styles.headTop}>
            <p className={styles.stage}>STAGE 3 · {view.name}</p>
            <StatusBadge status={view.submission?.status} />
          </div>
          <h1 className={styles.title}>배포한 서비스를 제출합니다</h1>
          <p className={styles.purpose}>
            여기서부터 지표가 쌓입니다. 제출 전에 개인정보·AI 표시 점검을 마쳐
            주세요 — 규칙이 정한 순서는 「점검 후 배포」입니다.
          </p>

          {/*
            측정 연동은 이 폼이 아니라 별도 화면이 정본이다. 안 된 상태로 배포하면
            지표가 0으로 쌓이므로, 사실만 알리고 그 화면으로 보낸다.
          */}
          <p className={hostname.verified ? styles.note : styles.locked}>
            {hostname.verified ? (
              <>측정 연동이 확인됐습니다 — {hostname.hostname}</>
            ) : hostname.registered ? (
              <>
                측정 주소({hostname.hostname})의 소유 확인이 아직 끝나지
                않았습니다. <Link href="/dashboard/measurement">측정 연동</Link>
                에서 마저 진행해 주세요.
              </>
            ) : (
              <>
                측정 주소가 아직 등록되지 않았습니다. 등록 전에는 방문·가입이
                집계되지 않습니다.{" "}
                <Link href="/dashboard/measurement">측정 연동</Link>에서 먼저
                등록해 주세요.
              </>
            )}
          </p>

          {!canWrite ? (
            <p className={styles.locked}>
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

        <S3Form
          defaults={
            view.submission
              ? toS3Defaults(view.submission.payload, entry.serviceUrl)
              : { ...EMPTY_S3, serviceUrl: entry.serviceUrl ?? "" }
          }
          canWrite={canWrite}
          askPaymentReturn={entry.chargeType === ChargeType.payment}
        />
      </section>
    );
  }

  /*
    s2 — 랜딩·수요조사. GATE 1의 심사 대상이다.

    ⚠️ 방문자·사전 신청자·전환율은 **입력이 아니라 집계**다(PLN6 6장 5번이
    미정으로 남겨 둔 자리를, 랜딩을 서브도메인에 올리는 쪽으로 확정해 읽기
    전용이 됐다). 참가자가 숫자를 적지 않는 것이 이 제품의 약속이라, 이 칸은
    폼이 아니라 아래 `ReadOnlyMetrics`가 그린다.
  */
  if (stageKey === StageKey.s2) {
    const metrics = await loadStageMetrics(
      viewer.entry.id,
      view.opensAt,
      view.closesAt,
    );
    const p = (view.submission?.payload ?? {}) as Record<string, unknown>;
    const defaults: S2Defaults = {
      landingUrl: str(p.landingUrl),
      channels: strList(p.channels),
      postUrl: str(p.postUrl),
      guideChecks: boolList(p.guideChecks),
      memo: str(p.memo),
    };

    return (
      <section className={styles.root}>
        <StageHead
          no="STAGE 2"
          view={view}
          title="랜딩과 수요조사를 제출합니다"
          purpose="방문자와 사전 신청자 수는 팀 주소를 거친 접속을 플랫폼이 직접 셉니다. 여기서는 확인만 하고 숫자를 입력하지 않습니다."
          canWrite={canWrite}
          access={access}
          submit={submit}
        />

        <ReadOnlyMetrics
          items={[
            {
              label: "방문자 수",
              value: metrics.hasData ? metrics.validVisitors.toLocaleString() : "집계 전",
              note: "유효 방문, 중복 제거",
            },
            {
              label: "사전 신청자 수",
              value: metrics.hasData ? metrics.signups.toLocaleString() : "집계 전",
              note: "팀원 제외, 중복 제거",
            },
            {
              label: "전환율",
              value:
                metrics.hasData && metrics.validVisitors > 0
                  ? `${((metrics.signups / metrics.validVisitors) * 100).toFixed(1)}%`
                  : "-",
              note: "신청자 ÷ 방문자, 자동 계산",
            },
          ]}
        />

        <S2Form defaults={defaults} canWrite={canWrite} />
      </section>
    );
  }

  /*
    s4 — 마케팅과 유저 유입. **주차마다 한 번씩** 낸다.

    주차는 화면이 고르게 하지 않는다. 스테이지 시작일부터 몇 주가 지났는지로
    시스템이 정한다 — 참가팀이 주차를 고를 수 있으면 지난 주를 나중에 채워
    넣게 되고, 그러면 「그 주에 한 활동」이 주간 기록이 아니게 된다.
  */
  if (stageKey === StageKey.s4) {
    const week = currentWeek(view.opensAt);
    /* 주차가 행을 가르므로 그 주의 제출을 따로 읽는다 */
    const weekView = await loadStageView(
      viewer.entry.id,
      viewer.season.id,
      StageKey.s4,
      week,
    );
    const weekStart = weekRange(view.opensAt, week);
    const metrics = await loadStageMetrics(
      viewer.entry.id,
      weekStart.from,
      weekStart.to,
    );
    const p = (weekView?.submission?.payload ?? {}) as Record<string, unknown>;
    const defaults: S4Defaults = {
      activity: str(p.activity),
      channels: strList(p.channels),
      improved: str(p.improved),
      guideChecks: boolList(p.guideChecks),
      memo: str(p.memo),
    };
    const weekWritable = access.ok && submit.ok && (weekView?.editable ?? view.editable);

    return (
      <section className={styles.root}>
        <StageHead
          no="STAGE 4"
          view={{ ...view, submission: weekView?.submission ?? null }}
          title={`${week}주차 활동을 제출합니다`}
          purpose="주차는 시스템이 지정합니다. 지표는 자동으로 집계되니 활동 내역만 적으면 됩니다."
          canWrite={weekWritable}
          access={access}
          submit={submit}
        />

        <ReadOnlyMetrics
          items={[
            {
              label: "이번 주 방문",
              value: metrics.hasData ? metrics.validVisitors.toLocaleString() : "집계 전",
              note: "엣지에서 자동 집계",
            },
            {
              label: "이번 주 가입",
              value: metrics.hasData ? metrics.signups.toLocaleString() : "집계 전",
              note: "중복 제거",
            },
          ]}
        />

        <S4Form defaults={defaults} canWrite={weekWritable} week={week} />
      </section>
    );
  }

  /*
    s5 — 트래픽과 매출. GATE 2의 심사 대상이고, **제출이 곧 확인**이다.
    최종 지표는 마감 시각에 자동 확정되므로 이 화면이 받는 것은 신고 둘과
    회고, 그리고 아카이브 공개 동의뿐이다.
  */
  if (stageKey === StageKey.s5) {
    const [metrics, payment] = await Promise.all([
      loadStageMetrics(viewer.entry.id, null, null),
      prisma.paymentIntegration.findFirst({
        where: { entryId: viewer.entry.id },
        select: { status: true },
      }),
    ]);
    const p = (view.submission?.payload ?? {}) as Record<string, unknown>;
    const defaults: S5Defaults = {
      monetized: p.monetized === true,
      paymentConnected: p.paymentConnected === true,
      retro: str(p.retro),
      guideChecks: boolList(p.guideChecks),
      archiveConsent: p.archiveConsent === true,
      memo: str(p.memo),
    };

    return (
      <section className={styles.root}>
        <StageHead
          no="STAGE 5"
          view={view}
          title="시즌의 마지막 제출입니다"
          purpose="최종 지표는 자동으로 집계됩니다. 이 화면의 제출은 확인 버튼 역할입니다."
          canWrite={canWrite}
          access={access}
          submit={submit}
        />

        <ReadOnlyMetrics
          items={[
            {
              label: "유효 이용자",
              value: metrics.hasData ? metrics.validVisitors.toLocaleString() : "집계 전",
              note: "시즌 누적",
            },
            {
              label: "가입",
              value: metrics.hasData ? metrics.signups.toLocaleString() : "집계 전",
              note: "시즌 누적",
            },
            {
              label: "매출",
              value: metrics.hasData
                ? `₩${metrics.revenue.toLocaleString()}`
                : "집계 전",
              note: "결제사 정산 기준",
            },
          ]}
        />

        <S5Form
          defaults={defaults}
          canWrite={canWrite}
          paymentVerified={payment?.status === IntegrationStatus.verified}
        />
      </section>
    );
  }

  if (stageKey !== StageKey.s1) {
    return (
      <Scaffold
        title={`${view.name} 제출`}
        purpose="스테이지별 필드는 PLN6 필드 정의서 4장이 정본이다."
        locked={submit.ok ? undefined : submit.message}
        elements={["스테이지별 필드 (PLN6 4장)", "가이드 완료 체크리스트"]}
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

/* ── s2·s4·s5가 함께 쓰는 조각 ───────────────────────────── */

/* payload는 JSON이라 타입이 없다. 화면에 넣기 전에 좁힌다 — s1·s3의 toDefaults와 같은 일 */
function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
function boolList(value: unknown): boolean[] {
  return Array.isArray(value) ? value.map(Boolean) : [];
}

/**
 * 지금이 s4의 몇 주차인가.
 *
 * ⚠️ 참가팀이 고르지 않는다(page.tsx의 s4 분기 주석). 스테이지 시작일로부터
 * 몇 번째 7일 구간인지가 곧 주차다. 시작일이 비어 있으면(시즌1 캘린더가 잠정)
 * 1주차로 둔다 — 주차를 모른다고 제출을 막을 이유는 없다.
 */
function currentWeek(opensAt: Date | null): number {
  if (!opensAt) return 1;
  const days = Math.floor((devNow().getTime() - opensAt.getTime()) / 86_400_000);
  return Math.max(1, Math.floor(days / 7) + 1);
}

/** 그 주차의 날짜 구간. 주간 지표를 그 구간으로만 센다 */
function weekRange(opensAt: Date | null, week: number) {
  if (!opensAt) return { from: null, to: null };
  const from = new Date(opensAt.getTime() + (week - 1) * 7 * 86_400_000);
  const to = new Date(from.getTime() + 6 * 86_400_000);
  return { from, to };
}

/*
  스테이지 머리말.

  s1·s3은 각자 머리말을 인라인으로 그린다. 셋을 한 번에 채우면서 같은 모양이
  세 번 반복되기에 여기서만 묶었다 — s1·s3도 이 조각으로 모으는 것이 맞고,
  화면을 훑을 때 함께 정리한다.
*/
function StageHead({
  no,
  view,
  title,
  purpose,
  canWrite,
  access,
  submit,
}: {
  no: string;
  view: StageView;
  title: string;
  purpose: string;
  canWrite: boolean;
  access: { ok: boolean; message?: string };
  submit: { ok: boolean; message?: string };
}) {
  return (
    <header className={styles.head}>
      <div className={styles.headTop}>
        <p className={styles.stage}>
          {no} · {view.name}
          {view.isGate ? <Badge tone="outline">심사 게이트</Badge> : null}
        </p>
        <StatusBadge status={view.submission?.status} />
      </div>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.purpose}>{purpose}</p>

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
  );
}

/**
 * 읽기 전용 지표.
 *
 * ⚠️ **입력으로 바꾸지 않는다.** 시안이 자물쇠(`🔒 입력 불가`)로 그린 자리이고,
 * 랜딩이 「참가자가 숫자를 입력하지 않는다」고 약속한 자리다. 숫자를 받는 순간
 * 그 약속이 깨지고 심사의 근거도 자기신고가 된다.
 */
function ReadOnlyMetrics({
  items,
}: {
  items: { label: string; value: string; note: string }[];
}) {
  return (
    <section className={styles.metrics} aria-label="자동 집계 지표">
      <p className={styles.metricsNote}>
        아래 숫자는 팀 주소를 거친 접속을 플랫폼이 직접 셉니다. 입력할 수 없습니다.
      </p>
      <div className={styles.metricsGrid}>
        {items.map((item) => (
          <div key={item.label} className={styles.metric}>
            <small>{item.label}</small>
            <strong>{item.value}</strong>
            <span>{item.note}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
