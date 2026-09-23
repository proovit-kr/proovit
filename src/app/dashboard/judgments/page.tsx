import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Badge } from "@/components/Badge";
import { LinkButton } from "@/components/Button";
import { ClauseFit } from "@/components/ClauseFit";
import { Clauses } from "@/components/Clauses";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/Surface";
import {
  APPEAL,
  FINAL_NOTE,
  GATE,
  GATE_BADGE,
  GATE_BEFORE,
  GATE_STAMP,
  JUDGMENTS_HEAD,
  PUB_NOTE,
  REASON_SUMMARY,
  SCORE_LABEL,
  SCORE_TEXT,
} from "@/content/judgments";
import { JudgmentResult } from "@/generated/prisma/enums";
import { guardPage } from "@/lib/access";
import { APPEAL_BUSINESS_DAYS, RESPONSE_BUSINESS_DAYS } from "@/lib/appeal";
import { loadJudgmentsView } from "@/lib/dashboard-read";
import { fmtMDHM } from "@/lib/header-state";
import {
  FINAL_FORMULA,
  type FinalScore,
  fmtFactor,
  fmtScore,
  fmtTotal,
  fmtWeights,
  formulaText,
  type GateJudgment,
  type JudgmentsView,
} from "@/lib/judgments-view";

import hub from "../hub.module.css";

import styles from "./judgments.module.css";

/*
  심사 결과 — 시안 ver4 `#scr-judgments` 네 판(`.sb[data-pane]`).

    ① jd-none   카드 둘 다 「심사 전」 + 안내 문장
    ② jd-pass   1차 PASS · 코멘트 · 🔒 비공개 안내, 2차 「예정」
    ③ jd-fail   1차 FAIL · 사유 요지 · 코멘트 · 🔒 · 이의신청 버튼과 기한, 2차 「해당 없음」
    ④ jd-final  1차 PASS · 코멘트, 2차 「확정」 · 산식 점수표 · 재현 안내

  판은 데이터의 결과다 — 게이트 둘의 최신 판정(`judgments-view.ts`). 개발 바의
  「심사 결과」 줄이 네 판을 심는다(`dev-sandbox.ts` `setSandboxJudgments`).

  값은 `node scripts/design-diff/fold-spec.mjs --media '^\.(jd|q|pub-note|sc-|gate-chip)'`의
  최종 승자를 `judgments.module.css`가 그대로 든다. 카드는 `Card`, 사유 요지는
  허브와 같은 `.hb-sum`(`hub.sum`). 대조는 `scripts/design-diff/judgments.mjs`.

  시안과 일부러 다른 것(내가 정함, 2026-09-23, 수연 확인 대기):
    · `revision`(보완 요청) 판정은 시안에 없다 — ②의 자리에 경고색 배지.
    · ③ 사유 요지의 괄호는 허브 h12와 같은 규칙 — 코멘트 첫 문단 뒤에 1차 게이트가
      본 숫자(신청·전환율)를 화면이 붙인다. 시안의 괄호 문구는 목업.
    · ③ 「판정에 이의신청하기」는 소명 화면으로 가는 링크.
    · ④ 축 점수·총점은 항목 점수에서 산식대로 다시 센다(저장값은 항목·원값·순위).
    · 진도가 s2 전이면(접근 정책 `minStage`) 경고줄만 그린다.
  옛 화면의 스테이지별 목록(s1~s5)은 시안에 없어 지웠다.
*/

export const metadata: Metadata = {
  title: "심사 결과",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { viewer, access } = await guardPage(
    "dashboardJudgments",
    "/dashboard/judgments",
  );
  if (!viewer.entry) notFound();

  const view = access.ok ? await loadJudgmentsView(viewer.entry.id) : null;

  return (
    <div data-probe="judgments" data-state={view?.pane ?? "locked"}>
      {!access.ok ? (
        <div className={`${hub.wbar} ${hub.wbarWarn}`} role="status">
          <Icon name="warn" fixed />
          <span>
            <Clauses text={access.message} />
          </span>
        </div>
      ) : null}

      <h2 className={hub.h1}>{JUDGMENTS_HEAD.title}</h2>
      <p className={hub.sub}>
        <Clauses text={JUDGMENTS_HEAD.sub} />
      </p>

      {view?.pane === "none" ? <NonePane /> : null}
      {view?.pane === "pass" ? <PassPane view={view} /> : null}
      {view?.pane === "fail" ? <FailPane view={view} /> : null}
      {view?.pane === "final" ? <FinalPane view={view} /> : null}
      <ClauseFit />
    </div>
  );
}

/* ── 부품 ─────────────────────────────────────────────────────────────── */

type Tone = "lime" | "red" | "gray" | "warn";

/** 카드 머리 — 제목 · 게이트 칩 · 배지 · (판정 시각) */
function Head({
  gate,
  badge,
  tone,
  stamp,
}: {
  gate: (typeof GATE)[keyof typeof GATE];
  badge: string;
  tone: Tone;
  stamp?: string;
}) {
  return (
    <div className={styles.jdHd}>
      <h3>{gate.title}</h3>
      <span className={styles.gateChip}>{gate.chip}</span>
      <Badge tone={tone}>{badge}</Badge>
      {stamp ? <span className={styles.tm}>{stamp}</span> : null}
    </div>
  );
}

/** 1차 판정의 배지 — pass·fail은 시안, revision은 내가 정함 */
function gateOneBadge(j: GateJudgment): { badge: string; tone: Tone } {
  if (j.result === JudgmentResult.fail) return { badge: GATE_BADGE.fail, tone: "red" };
  if (j.result === JudgmentResult.revision) {
    return { badge: GATE_BADGE.revision, tone: "warn" };
  }
  return { badge: GATE_BADGE.pass, tone: "lime" };
}

const judgedStamp = (j: GateJudgment) => `${GATE_STAMP.judged} ${fmtMDHM(j.judgedAt)}`;

/** 🔒 줄 — 시안 `.pub-note` */
function PubNote({ text }: { text: string }) {
  return (
    <span className={styles.pubNote}>
      <Icon name="lock" />
      {text}
    </span>
  );
}

/* ── ① 심사 전 ────────────────────────────────────────────────────────── */

function NonePane() {
  return (
    <>
      <Card className={styles.jd}>
        <Head gate={GATE.first} badge={GATE_BADGE.before} tone="gray" />
        <p className={styles.before}>
          <Clauses text={GATE_BEFORE.first} />
        </p>
      </Card>
      <Card className={styles.jd}>
        <Head gate={GATE.second} badge={GATE_BADGE.before} tone="gray" />
        <p className={styles.before}>
          <Clauses text={GATE_BEFORE.second} />
        </p>
      </Card>
    </>
  );
}

/* ── ② 1차 pass ───────────────────────────────────────────────────────── */

function PassPane({ view }: { view: JudgmentsView }) {
  const j = view.gate1!;
  return (
    <>
      <Card className={styles.jd}>
        <Head gate={GATE.first} {...gateOneBadge(j)} stamp={judgedStamp(j)} />
        {j.feedback ? <div className={styles.q}>{j.feedback}</div> : null}
        <PubNote text={PUB_NOTE.pass} />
      </Card>
      <Card className={styles.jd}>
        <Head gate={GATE.second} badge={GATE_BADGE.scheduled} tone="gray" />
      </Card>
    </>
  );
}

/* ── ③ 1차 fail ───────────────────────────────────────────────────────── */

function FailPane({ view }: { view: JudgmentsView }) {
  const j = view.gate1!;
  return (
    <>
      <Card className={styles.jd}>
        <Head gate={GATE.first} {...gateOneBadge(j)} stamp={judgedStamp(j)} />
        <Card className={hub.sum} style={{ marginTop: "14px", marginBottom: 0 }}>
          <div>
            <span>{REASON_SUMMARY}</span>
            <b>{view.reason ?? "—"}</b>
          </div>
        </Card>
        {view.reasonBody ? <div className={styles.q}>{view.reasonBody}</div> : null}
        <PubNote text={PUB_NOTE.fail} />
        <div
          style={{
            marginTop: "16px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <LinkButton variant="outline" href="/dashboard/appeal">
            {APPEAL.button}
          </LinkButton>
          {view.appealBy ? (
            <span style={{ fontSize: "12.5px", color: "var(--faint)" }}>
              {APPEAL.note({
                appealDays: APPEAL_BUSINESS_DAYS,
                by: fmtMDHM(view.appealBy),
                responseDays: RESPONSE_BUSINESS_DAYS,
              })}
            </span>
          ) : null}
        </div>
      </Card>
      <Card className={styles.jd}>
        <Head gate={GATE.second} badge={GATE_BADGE.notApplicable} tone="gray" />
      </Card>
    </>
  );
}

/* ── ④ 2차 확정 ───────────────────────────────────────────────────────── */

function FinalPane({ view }: { view: JudgmentsView }) {
  const g1 = view.gate1;
  const g2 = view.gate2!;
  return (
    <>
      <Card className={styles.jd}>
        {g1 ? (
          <>
            <Head gate={GATE.first} {...gateOneBadge(g1)} stamp={judgedStamp(g1)} />
            {g1.feedback ? <div className={styles.q}>{g1.feedback}</div> : null}
          </>
        ) : (
          <Head gate={GATE.first} badge={GATE_BADGE.before} tone="gray" />
        )}
      </Card>
      <Card className={styles.jd}>
        <Head
          gate={GATE.second}
          badge={GATE_BADGE.final}
          tone="lime"
          stamp={`${GATE_STAMP.final} ${fmtMDHM(g2.judgedAt)}`}
        />
        {view.finalScore ? <ScoreTable score={view.finalScore} /> : null}
        <div className={styles.q}>{FINAL_NOTE}</div>
      </Card>
    </>
  );
}

/** 시안 `.jd-final` — 축 둘은 나란히, 계수·총점·순위는 한 줄로 */
function ScoreTable({ score }: { score: FinalScore }) {
  return (
    <div className={styles.jdFinal}>
      {score.axes.map((ax) => {
        const weights = fmtWeights(ax.items.map((it) => it.weight));
        return (
          <div key={ax.key}>
            <div className={styles.scAx}>
              <span>{SCORE_TEXT.axis(SCORE_LABEL[ax.key], ax.weight)}</span>
              <b>{fmtScore(ax.score)}</b>
            </div>
            {ax.items.map((it, i) => (
              <div key={it.key} className={styles.scRow}>
                <span>
                  {SCORE_LABEL[it.key]}
                  <span className={styles.raw}>{it.raw}</span>
                  <span className={styles.w}>×{weights[i]}</span>
                </span>
                <b>{fmtScore(it.score)}</b>
              </div>
            ))}
          </div>
        );
      })}
      <div>
        <div className={styles.scRow}>
          <span>
            {SCORE_LABEL.compliance}
            <span className={styles.raw}>{score.compliance.raw}</span>
          </span>
          <b>{fmtFactor(score.compliance.factor)}</b>
        </div>
        <div className={`${styles.scRow} ${styles.tot}`}>
          <span>{SCORE_TEXT.total(formulaText(score), fmtFactor(score.compliance.factor))}</span>
          <b>{SCORE_TEXT.outOf(fmtTotal(score.total))}</b>
        </div>
        <div className={styles.scRow}>
          <span>
            {SCORE_LABEL.rank}
            <span className={styles.raw}>
              {SCORE_TEXT.floors(
                score.rank.floorsMet,
                FINAL_FORMULA.axes.map((ax) => ({ key: ax.key, floor: ax.floor })),
              )}
            </span>
          </span>
          <b>{SCORE_TEXT.rank(score.rank.position, score.rank.teams)}</b>
        </div>
      </div>
    </div>
  );
}
