import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/Badge";
import { Chip } from "@/components/Surface";
import {
  PAYMENT_STATE_LABEL,
  S5_FIELDS,
  SUBMIT_BUTTONS,
  SUBMIT_HEAD,
  SUBMIT_INFO,
  SUBMIT_META,
  SUBMIT_PANE,
  SUBMIT_WHO,
} from "@/content/submission";
import {
  EntryStage,
  JudgmentResult,
  StageKey,
  SubmissionStatus,
} from "@/generated/prisma/enums";
import { canSubmitStage, guardPage, toAccessContext } from "@/lib/access";
import { devNow } from "@/lib/dev-clock";
import { paymentPane } from "@/lib/payment";
import { loadPaymentIntegration } from "@/lib/payment-store";
import { prisma } from "@/lib/prisma";
import {
  conversionRate,
  dDay,
  formatDay,
  formatDeadline,
  formatMoment,
  isStageKey,
  paneBadge,
  tabTail,
  visitRange,
  weekDue,
  weekRange,
} from "@/lib/submission";
import { toForm } from "@/lib/submission-fields";
import {
  loadFinalSnapshot,
  loadStageMetrics,
  loadSubmitOverview,
  loadVerifiedLeads,
  type StageRow,
} from "@/lib/submission-store";

import hub from "../../hub.module.css";
import { StageForm, type StageActions, type StageFormProps } from "./StageForm";

import styles from "./submit.module.css";

/*
  스테이지 제출 — 시안 `#scr-submit`. 탭 다섯(`.st-tab`)이 판이고, 라우트가
  `/dashboard/submit/:stageKey`라 탭은 링크다. 판의 내용은 그 스테이지의 제출
  행·판정·일정이 정한다(submission.ts `tabTail`·`paneBadge`).

  시안의 다섯 판을 한 DB 상태로 보려면 개발 바 「제출」 줄을 누른다 — 「s3 작성 중」이
  s1 제출됨·s2 통과·s3 임시저장·s5 예정을, 「s4 1주차」가 s4 주간 판을 만든다.

  ⚠️ 화면은 팀원에게도 열려 있고 **쓰기만 팀장**이다(canSubmitStage). 팀원이
  자기 팀이 무엇을 냈는지 못 보면 2인 팀에서 확인할 방법이 없다. 팀원에게는
  경고줄만 올리고 버튼을 뺀다(다른 참가자 화면과 같은 자리).
*/

export const metadata: Metadata = {
  title: "스테이지 제출",
  robots: { index: false, follow: false },
};

const fmt = (n: number) => n.toLocaleString("ko-KR");

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
  const entryId = viewer.entry.id;
  const seasonId = viewer.season.id;

  const now = devNow();
  const overview = await loadSubmitOverview(entryId, seasonId, now);
  const row = overview?.stages.find((s) => s.stageKey === stageKey);
  /* stages 표에 없는 스테이지 = 이 시즌에 없는 단계다 */
  if (!overview || !row) notFound();

  /*
    제출 가능 여부. EntryStage와 StageKey가 s1~s5에서 값이 겹쳐 그대로 넘긴다 —
    canSubmitStage가 진도·게이트 대기·팀장 여부를 한 번에 본다.
  */
  const submit = canSubmitStage(stageKey as unknown as EntryStage, toAccessContext(viewer));
  const leader = submit.ok || submit.code !== "FORBIDDEN";
  const canWrite = access.ok && submit.ok && row.editable;
  /*
    경고줄 — 정책 문구, 아니면 진도·팀장 문구. 아직 안 열린 판은 잠긴 것으로
    이미 보이므로 진도 문구를 겹쳐 올리지 않는다.

    유동 게이트(2026-09-25)부터 달력이 여는 판은 첫·마지막뿐이라, 가운데 판이
    잠겨 있으면 이 줄이 「이전 단계를 마친 팀만」·「심사 결과가 나온 뒤에」로
    이유를 말한다.
  */
  const warning = !access.ok
    ? access.message
    : !submit.ok && row.lockedReason !== "STAGE_NOT_OPEN"
      ? submit.message
      : null;

  const props: StageFormProps = {
    stageKey,
    title: SUBMIT_PANE[stageKey].title,
    chip: SUBMIT_PANE[stageKey].chip,
    gate: row.isGate,
    badge: paneBadge(row),
    meta: metaLines(row, now),
    info: stageKey in SUBMIT_INFO ? SUBMIT_INFO[stageKey as keyof typeof SUBMIT_INFO] : null,
    who: whoLine(row),
    actions: actionsOf(row, { leader, canWrite }),
    canWrite,
    /* 「예정」 판(달력이든 진도든 아직 안 닿았고 마감 전) — 빈 파일 칸에 「없음」을 적지 않는다 */
    notOpen: !row.open,
    defaults: toForm(stageKey, row.submission?.payload, row.submission?.evidenceUrls),
  };

  if (stageKey === StageKey.s1) {
    props.s1 = {
      chargeType: overview.chargeType,
      chargeTypeLocked: overview.chargeTypeLocked,
    };
  } else if (stageKey === StageKey.s2) {
    /*
      방문은 **측정 시작부터** 1차 심사 마감까지 센다(from=null). 유동 게이트에서는
      s1을 일찍 낸 팀이 s2 달력 주차 전에 랜딩을 올리고, 그 방문도 수요 신호다
      (「빨리 배포한 팀이 측정 기간을 길게 가져간다」 — PRD 2장).
    */
    const [metrics, leads] = await Promise.all([
      loadStageMetrics(entryId, null, row.closesAt),
      loadVerifiedLeads(entryId),
    ]);
    /* 리드를 따로 세지 못한 구간에서는 집계된 가입 수가 같은 값을 든다(허브와 같다) */
    const applicants = leads || metrics.signups;
    props.s2 = {
      range: visitRange(metrics.firstDate, row.closesAt, now),
      visitors: metrics.hasData ? fmt(metrics.validVisitors) : "—",
      leads: metrics.hasData || applicants > 0 ? fmt(applicants) : "—",
      conversion: conversionRate(applicants, metrics.validVisitors) ?? "—",
    };
  } else if (stageKey === StageKey.s4) {
    const { from, to } = weekRange(row.opensAt, row.week);
    const metrics = await loadStageMetrics(entryId, from, to);
    props.s4 = {
      weeks: Array.from({ length: row.week }, (_, i) => {
        const week = i + 1;
        const found = row.weeks.find((w) => w.week === week);
        const done = found !== undefined && found.status !== SubmissionStatus.draft;
        return {
          week,
          state: done ? "done" : week === row.week ? "now" : "missed",
        };
      }),
      visitors: metrics.hasData ? fmt(metrics.validVisitors) : "—",
      signups: metrics.hasData ? fmt(metrics.signups) : "—",
    };
  } else if (stageKey === StageKey.s5) {
    const [snapshot, integration, entry] = await Promise.all([
      loadFinalSnapshot(entryId, seasonId),
      loadPaymentIntegration(entryId),
      prisma.entry.findUniqueOrThrow({
        where: { id: entryId },
        select: { chargeType: true },
      }),
    ]);
    const labels = S5_FIELDS.final.cards;
    props.s5 = {
      cards: [
        { label: labels[0], value: snapshot.validUsers === null ? "—" : fmt(snapshot.validUsers) },
        { label: labels[1], value: snapshot.weeklyActive === null ? "—" : fmt(snapshot.weeklyActive) },
        { label: labels[2], value: snapshot.retention === null ? "—" : `${snapshot.retention}%` },
        { label: labels[3], value: snapshot.revenue === null ? "—" : `₩${fmt(snapshot.revenue)}` },
      ],
      paymentLabel:
        PAYMENT_STATE_LABEL[
          paymentPane({ chargeType: entry.chargeType, status: integration.status })
        ],
    };
  }

  return (
    <>
      {warning ? (
        <div className={`${hub.wbar} ${hub.wbarWarn}`} role="status">
          {warning}
        </div>
      ) : null}

      <h2 className={hub.h1}>{SUBMIT_HEAD.title}</h2>
      <p className={hub.sub}>{SUBMIT_HEAD.sub}</p>

      <nav className={styles.tabs} aria-label="스테이지">
        {overview.stages.map((stage) => {
          const tail = tabTail(stage);
          const on = stage.stageKey === stageKey;
          return (
            <Link
              key={stage.stageKey}
              href={`/dashboard/submit/${stage.stageKey}`}
              className={on ? `${styles.tab} ${styles.on}` : styles.tab}
              aria-current={on ? "page" : undefined}
            >
              <span className={styles.k}>{stage.stageKey}</span>
              {stage.name}
              {tail?.kind === "badge" ? <Badge tone={tail.tone}>{tail.label}</Badge> : null}
              {tail?.kind === "chip" ? <Chip>{tail.label}</Chip> : null}
            </Link>
          );
        })}
      </nav>

      <StageForm {...props} />
    </>
  );
}

/*
  시안 `.frm-meta` — 마감(남은 날)·제출/임시저장·게이트 판정 회신.
    s1  마감 10.04 23:59 · 제출 이윤서, 10.02 21:14
    s2  마감 10.11 23:59 · 제출 이윤서, 10.10 18:40 · 판정 10.12, 48시간 내 회신
    s3  마감 10.18 23:59, D-4 · 임시저장 진수연, 10.15 02:11
    s4  이번 주 마감 10.25 23:59, D-2 · 주차는 시스템이 지정해요
    s5  집계 확정 11.01 24:00

  마감은 **실제 마감**이다(유동 게이트 — submission.ts `stageWindows`). 시안의
  날짜는 달력 주차 그대로라, s1은 시안 10.04가 아니라 1차 심사 마감(10.11)을,
  s3은 2차 심사 마감을 적는다. s4는 그 주차의 끝이다(`weekDue`).
*/
function metaLines(row: StageRow, now: Date): string[] {
  const lines: string[] = [];
  const closes =
    row.stageKey === StageKey.s4 ? weekDue(row.opensAt, row.week, row.closesAt) : row.closesAt;
  if (closes) {
    const due = formatDeadline(closes);
    const left = dDay(closes, now);
    if (row.stageKey === StageKey.s5) lines.push(`집계 확정 ${due}`);
    else if (row.stageKey === StageKey.s4) {
      lines.push(`이번 주 마감 ${due}${left ? `, ${left}` : ""}`);
    } else lines.push(`마감 ${due}${left ? `, ${left}` : ""}`);
  }
  const s = row.submission;
  if (row.stageKey === StageKey.s4) {
    /* s4는 주차 줄이 둘째이고, 제출·임시저장은 발자국(`.who`)이 주차별로 적는다 */
    lines.push(SUBMIT_META.s4Week);
    return lines;
  }
  if (s && s.status !== SubmissionStatus.draft && s.submittedAt) {
    lines.push(`제출 ${s.submitter ?? ""}, ${formatMoment(s.submittedAt)}`.replace(" ,", ","));
  } else if (s) {
    /* 임시저장한 사람은 남지 않는다(StageForm.tsx 머리 주석) */
    lines.push(`임시저장 ${formatMoment(s.updatedAt)}`);
  }
  if (row.isGate && row.closesAt && s && s.status !== SubmissionStatus.draft) {
    /* 판정일은 마감 다음 날 — 시안 「마감 10.11 → 판정 10.12」 */
    lines.push(`판정 ${formatDay(new Date(row.closesAt.getTime() + 86_400_000))}, 48시간 내 회신`);
  }
  return lines;
}

/*
  시안 `.frm-ft .who` — 제출을 누른 사람의 기록.
    submitted_by 이윤서, 10.02 21:14 / …, locked / 미제출, draft 임시저장 … /
    1주차 submitted_by 이윤서, 10.20 22:03 / 2주차 draft
*/
function whoLine(row: StageRow): string {
  if (row.stageKey === StageKey.s4) {
    if (row.weeks.length === 0) return SUBMIT_WHO.none;
    return row.weeks
      .map((w) =>
        w.status === SubmissionStatus.draft || !w.submittedAt
          ? `${w.week}주차 draft`
          : `${w.week}주차 submitted_by ${w.submitter ?? ""}, ${formatMoment(w.submittedAt)}`,
      )
      .join(" / ");
  }
  const s = row.submission;
  /* s5는 최종 제출을 누르기 전까지 「확인 버튼을 누른 팀원으로 기록」 — 초안도 아직 그 전이다 */
  const unsubmitted = !s || s.status === SubmissionStatus.draft || !s.submittedAt;
  if (unsubmitted && row.stageKey === StageKey.s5 && row.closesAt) {
    return SUBMIT_WHO.s5.replace("{closesAt}", formatDeadline(row.closesAt));
  }
  if (!s) return SUBMIT_WHO.none;
  if (s.status === SubmissionStatus.draft || !s.submittedAt) {
    return `${SUBMIT_WHO.none}, draft 임시저장 ${formatMoment(s.updatedAt)}`;
  }
  const base = `submitted_by ${s.submitter ?? ""}, ${formatMoment(s.submittedAt)}`;
  return s.status === SubmissionStatus.locked ? `${base}, locked` : base;
}

/*
  버튼 묶음 — 시안 `.frm-ft .sp`.
    s1 제출됨   임시저장(ghost) + 재제출하기(outline)
    s3 작성 중  임시저장 + 제출하기(primary)
    s4          임시저장 + 이번 주 제출하기
    s5          최종 제출 확인
    s2 통과     「통과 후 잠김」 disabled
  팀원에게는 없다. 잠긴 판(마감·미개시)은 같은 버튼을 잠근 채 둔다.
*/
function actionsOf(
  row: StageRow,
  ctx: { leader: boolean; canWrite: boolean },
): StageActions {
  if (!ctx.leader) return { kind: "none" };
  if (row.lockedReason === "STAGE_LOCKED") {
    /*
      게이트가 아닌 판이 잠기는 것은 그 판을 덮는 게이트의 판정이 끝났을 때뿐이다
      (submission.ts `stageRowState`). 미통과 팀은 이 화면을 못 보므로 통과 뒤다.
    */
    return {
      kind: "locked",
      label:
        row.judgment === JudgmentResult.pass || !row.isGate
          ? SUBMIT_BUTTONS.lockedPass
          : SUBMIT_BUTTONS.lockedJudging,
    };
  }
  if (row.lockedReason === "STAGE_CLOSED") {
    return { kind: "locked", label: SUBMIT_BUTTONS.closed };
  }
  const disabled = !ctx.canWrite;
  if (row.stageKey === StageKey.s5) return { kind: "final", disabled };
  const submitted =
    row.submission !== null && row.submission.status !== SubmissionStatus.draft;
  return {
    kind: "pair",
    submitLabel:
      row.stageKey === StageKey.s4
        ? SUBMIT_BUTTONS.weekly
        : submitted
          ? SUBMIT_BUTTONS.resubmit
          : SUBMIT_BUTTONS.submit,
    resubmit: submitted && row.stageKey !== StageKey.s4,
    disabled,
  };
}
