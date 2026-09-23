import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Badge } from "@/components/Badge";
import { ClauseFit } from "@/components/ClauseFit";
import { ClauseParts, Clauses } from "@/components/Clauses";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/Surface";
import {
  APPEAL_HEAD,
  APPEAL_REPLY,
  APPEAL_STATUS,
  APPEAL_SUM,
  APPEAL_WBAR,
} from "@/content/appeal";
import { guardPage } from "@/lib/access";
import { RESPONSE_BUSINESS_DAYS } from "@/lib/appeal";
import { loadAppealView } from "@/lib/appeal-store";
import { type AppealRecord, emphasisParts } from "@/lib/appeal-view";
import { fmtMDHM } from "@/lib/header-state";

import hub from "../hub.module.css";
import jd from "../judgments/judgments.module.css";

import { AppealPanel } from "./AppealPanel";

import styles from "./appeal.module.css";

/*
  소명 — 시안 ver4 `#scr-appeal` 두 판(`.sb[data-pane]`).

    ① ap-write  소명 대상 고르개 · 사유 · 증빙 첨부 · 접수 기한 상자 · 「소명 접수하기」
    ② ap-sent   접수 · 회신 기한 · 상태 상자, 운영진 회신 카드

  **실격 팀에게 열려 있어야 하는 유일한 쓰기 화면이다.** 라우트 정책의
  `allowInactive`가 그 뜻이고, 허브 h14·헤더 D8이 이 화면을 다음 행동으로 내준다.

  판은 데이터의 결과다 — 접수 기록이 있으면 ②(`appeal-view.ts`). 개발 바의 「소명」
  줄이 두 판을 심는다(`dev-sandbox.ts` `setSandboxAppeal`).

  값은 시안의 최종 승자를 다른 모듈이 이미 든다 — 경고줄·기한 상자는 허브, 입력
  묶음은 `Field`, 파일 칸은 스테이지 제출의 `Files`, 회신 카드는 심사 결과의
  `.jd`·`.q`. 대조는 `scripts/design-diff/appeal.mjs`.

  시안과 일부러 다른 것(내가 정함, 2026-09-23, 수연 확인 대기):
    · 소명 대상에 게이트 미통과 판정을 더했다(심사 결과 ③의 버튼이 여기로 온다).
    · 접수 기록이 하나라도 있으면 ②만 그린다(둘 이상이면 최신 순으로 전부).
      낸 사유·증빙은 ②에 다시 보이지 않는다(시안에 자리가 없다).
    · ② 상태는 회신 전 「검토 중」(회색), 회신 뒤 「검토 완료」(보라).
    · 회신의 강조는 글 안의 `**…**`(청록 굵은 글씨).
    · 팀원은 경고줄 하나 더(팀장만 접수)와 잠긴 폼을 본다.
    · 대상이 없으면 고르개에 「소명할 대상이 없어요」 한 줄, 버튼 잠금.
    · 경고줄·회신은 절 단위 줄바꿈.
*/

export const metadata: Metadata = {
  title: "소명",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { viewer, access } = await guardPage("dashboardAppeal", "/dashboard/appeal");
  if (!viewer.entry || !viewer.team) notFound();

  const view = await loadAppealView(viewer.entry.id);
  const canWrite = access.ok && viewer.team.isLeader;

  return (
    <div data-probe="appeal" data-state={view.pane}>
      <h2 className={hub.h1}>{APPEAL_HEAD.title}</h2>
      {/* 시안의 경고줄 — 아이콘 없이 글자만. 절은 span 하나에 담는다(flex 줄) */}
      <div className={`${hub.wbar} ${hub.wbarWarn}`} style={{ marginTop: "4px" }}>
        <span>
          <Clauses text={APPEAL_WBAR} />
        </span>
      </div>
      {!access.ok ? (
        <div className={`${hub.wbar} ${hub.wbarWarn}`} role="status">
          <Icon name="warn" fixed />
          <span>
            <Clauses text={access.message} />
          </span>
        </div>
      ) : null}

      {view.pane === "write" ? (
        <AppealPanel
          targets={view.targets.map((t) => ({
            value: t.value,
            label: t.label,
            appealed: t.appealed,
            noticed: fmtMDHM(t.noticeAt).slice(0, 5),
            by: fmtMDHM(t.appealBy),
          }))}
          canWrite={canWrite}
        />
      ) : (
        view.appeals.map((a) => <Sent key={a.id} appeal={a} />)
      )}
      <ClauseFit />
    </div>
  );
}

/* ── ② 접수됨 ─────────────────────────────────────────────────────────── */

function Sent({ appeal }: { appeal: AppealRecord }) {
  const replied = appeal.respondedAt !== null && appeal.responseText !== null;
  return (
    <>
      <Card className={hub.sum} style={{ marginBottom: "14px" }}>
        <div>
          <span>{APPEAL_SUM.received}</span>
          <b>{fmtMDHM(appeal.submittedAt)}</b>
        </div>
        <div>
          <span>{APPEAL_SUM.reply}</span>
          <b>
            {appeal.responseDueAt
              ? APPEAL_SUM.replyText(fmtMDHM(appeal.responseDueAt), RESPONSE_BUSINESS_DAYS)
              : APPEAL_SUM.replyBefore(RESPONSE_BUSINESS_DAYS)}
          </b>
        </div>
        <div>
          <span>{APPEAL_SUM.status}</span>
          <b>
            {replied ? (
              <Badge tone="violet">{APPEAL_STATUS.done}</Badge>
            ) : (
              <Badge tone="gray">{APPEAL_STATUS.reviewing}</Badge>
            )}
          </b>
        </div>
      </Card>
      {replied ? (
        <Card className={jd.jd}>
          <div className={jd.jdHd}>
            <h3>{APPEAL_REPLY.title}</h3>
            <span className={jd.tm}>{fmtMDHM(appeal.respondedAt!)}</span>
          </div>
          <div className={jd.q}>
            <ClauseParts
              parts={emphasisParts(appeal.responseText!, (text, key) => ({
                text,
                node: (
                  <b key={key} className={styles.em}>
                    {text}
                  </b>
                ),
              }))}
            />
          </div>
        </Card>
      ) : null}
    </>
  );
}
