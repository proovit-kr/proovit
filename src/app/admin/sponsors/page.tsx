import type { Metadata } from "next";

import { Badge, type BadgeTone } from "@/components/Badge";
import { Card } from "@/components/Surface";
import { guardPage } from "@/lib/access";
import { CREDIT_CARD_BY_KIND, OFFER_STATUS_LABEL } from "@/lib/credits";
import { loadAdminCreditConsole } from "@/lib/credits-store";
import { fmtStamp } from "@/lib/header-state";
import { prisma } from "@/lib/prisma";

import hub from "../../dashboard/hub.module.css";
import c from "../console.module.css";
import { ClaimsPane } from "./ClaimsPane";
import { OffersPane } from "./OffersPane";
import s from "./sponsors.module.css";

/*
  스폰서 크레딧 — 시안 `#scr-adm-sponsors`(3226행). 13 크레딧 센터 설계서 7장 「관리 콘솔 P0」.

  세 판(① 혜택 설정 ② 팀별 발급 현황 ③ 발송 이력)을 위아래로 쌓는다(sponsors.module.css
  `.pane` 주석). 발송 이력의 정본은 감사 로그다 — 같은 사실을 두 곳에 적으면 갈라진다.
  참가자가 「적용했어요」를 누른 때(`confirmed_at`)만 클레임 표에서 읽어 「확인」 줄로 섞는다.

  ⚠️ 카드 4장은 항상 4장으로 그린다. 아직 안 만든 카드도 자리를 비우지 않는다 —
  「C3를 안 만들었다」와 「C3가 없다」는 운영자에게 다른 말이다.
*/

export const metadata: Metadata = {
  title: "스폰서 크레딧",
  robots: { index: false, follow: false },
};

type LogLine = { at: Date; who: string; text: string; tag: { label: string; tone: BadgeTone } };

export default async function Page() {
  const { viewer } = await guardPage("adminSponsors", "/admin/sponsors");
  if (!viewer.season) {
    return (
      <>
        <h2 className={hub.h1}>스폰서 크레딧</h2>
        <p className={hub.sub}>현재 시즌 없음. 시즌을 먼저 만들어야 혜택 카드를 등록할 수 있음.</p>
      </>
    );
  }

  const view = await loadAdminCreditConsole(viewer.season.id);
  /*
    이 시즌의 것만 — 대상이 이 시즌의 카드이거나 팀인 줄. 시즌을 안 거르면 시즌 2에
    시즌 1 발송 줄이 섞인다.
  */
  const logs = await prisma.auditLog.findMany({
    where: {
      action: { startsWith: "credit." },
      targetId: { in: [...view.offers.map((o) => o.id), ...view.claims.map((r) => r.entryId)] },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      createdAt: true,
      action: true,
      reason: true,
      meta: true,
      targetId: true,
      actor: { select: { email: true } },
    },
  });

  const teamName = new Map(view.claims.map((r) => [r.entryId, r.teamName]));
  /* 묶음 줄의 팀 — 「리틀포션 외 2팀」(시안 「새벽창고 외 8팀」) */
  const teamsOf = (ids: unknown) => {
    const names = (Array.isArray(ids) ? ids : []).map((id) => teamName.get(String(id)) ?? "팀");
    return names.length > 1 ? `${names[0]} 외 ${names.length - 1}팀` : (names[0] ?? "팀");
  };
  const statusLabel = (v: unknown) =>
    typeof v === "string" && v in OFFER_STATUS_LABEL
      ? OFFER_STATUS_LABEL[v as keyof typeof OFFER_STATUS_LABEL]
      : String(v ?? "");

  /* 일괄 발송 줄 — 발급 예정으로만 적은 팀은 「이메일」에 세지 않는다 */
  const batchLine = (code: string | undefined, teams: number, scheduled: number) =>
    scheduled > 0
      ? `${code} 일괄 발송, ${teams - scheduled}팀 이메일, ${scheduled}팀 발급 예정`
      : `${code} 일괄 발송, ${teams}팀, 이메일`;

  /* 감사 로그 한 줄을 시안 이력 문장으로 — 「C1 코드 풀 CSV 80건 업로드, 사유: 스폰서 1차 전달분」 */
  const lines: LogLine[] = [
    ...logs.map((row): LogLine => {
      const m = (row.meta ?? {}) as Record<string, unknown>;
      const code = typeof m.kind === "string" ? CREDIT_CARD_BY_KIND[m.kind as keyof typeof CREDIT_CARD_BY_KIND]?.code : "";
      const team = teamName.get(String(m.entryId ?? row.targetId ?? "")) ?? "팀";
      /* 참가자가 스스로 받은 줄 — 누구는 팀이다(적용 확인 줄과 같게) */
      if (row.action === "credit.claim") {
        return {
          at: row.createdAt,
          who: team,
          text: `${code} 받기${m.scheduled ? ", 발급 예정" : ", 이메일"}`,
          tag: { label: "확인", tone: "teal" },
        };
      }
      /*
        메일 실패 — 시스템 줄이지만 운영자가 할 일이 있어 빨간 「실패」로 단다.
        내가 정함(수연 확인 대기): 시안의 꼬리표는 자동·수기·확인 셋뿐이다.
      */
      if (row.action === "credit.mail_failed") {
        return {
          at: row.createdAt,
          who: "시스템",
          text: `${code} 발급 메일 실패, ${teamsOf(m.entryIds)}, 칸을 눌러 재발송`,
          tag: { label: "실패", tone: "red" },
        };
      }
      const text =
        row.action === "credit.codes_upload"
          ? `${code} 코드 풀 CSV ${m.added ?? m.submitted ?? 0}건 업로드, 사유: ${row.reason}`
          : row.action === "credit.status"
            ? `${code} 상태 전환 ${statusLabel(m.from)} → ${statusLabel(m.to)}, 사유: ${row.reason}`
            : row.action === "credit.offer_create" || row.action === "credit.offer_update"
              ? `${code} 혜택 ${row.action === "credit.offer_create" ? "등록" : "수정"}, 사유: ${row.reason}`
              : row.action === "credit.deliver_manual"
                ? `${code} 수동 발급${m.manualCode ? ", 코드 입력" : ""}${m.scheduled ? "(발급 예정)" : ""}, ${team}, 사유: ${row.reason}`
                : row.action === "credit.resend"
                  ? `${code} 메일 재발송${m.failed ? "(실패)" : ""}, ${team}, 사유: ${row.reason}`
                : row.action === "credit.batch"
                  ? batchLine(code, Number(m.teams ?? 0), Number(m.scheduled ?? 0))
                  : row.action === "credit.release"
                    ? `${code} 발급 예정 발송, ${m.teams ?? 0}팀, 이메일 (${row.reason})`
                    : row.action === "credit.logo"
                      ? `${code} ${row.reason}`
                      : `${row.action}, ${row.reason}`;
      return {
        at: row.createdAt,
        who: row.actor?.email ? row.actor.email.split("@")[0] : "시스템",
        text,
        tag: row.actor ? { label: "수기", tone: "violet" } : { label: "자동", tone: "lime" },
      };
    }),
    ...view.confirms.map((cf): LogLine => ({
      at: cf.at,
      who: cf.teamName,
      text: `${CREDIT_CARD_BY_KIND[cf.kind].code} 적용 확인 체크`,
      tag: { label: "확인", tone: "teal" },
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 30);

  const sum = view.summary;

  return (
    <>
      <h2 className={hub.h1}>스폰서 크레딧</h2>
      <p className={hub.sub}>
        혜택 카드 등록, 코드 풀 관리, 팀별 발급 처리. 쓰기 작업은 사유 필수, 감사 로그 기록
      </p>

      <div className={c.kpi} data-probe="sp-kpi">
        <Card>
          <small>활성 혜택</small>
          <span className="score">
            {sum.activeOffers}
            <i style={{ fontStyle: "normal", fontSize: "13px", color: "var(--faint)", marginLeft: "4px" }}>
              /{sum.totalOffers}
            </i>
          </span>
        </Card>
        <Card>
          <small>C1 코드 잔여</small>
          <span className="score">{sum.c1Remaining}</span>
        </Card>
        <Card>
          <small>발급 완료 팀</small>
          <span className="score">{sum.deliveredTeams}</span>
        </Card>
        <Card>
          <small>발급 확인 팀</small>
          <span className="score">{sum.confirmedTeams}</span>
        </Card>
      </div>

      <section className={`${s.pane} ${s.root}`} data-probe="sp-offers">
        <h3 className={s.paneHead}>혜택 설정</h3>
        <OffersPane
          offers={view.offers.map((o) => ({
            ...o,
            releaseDate: o.releaseDate?.toISOString() ?? null,
            validUntil: o.validUntil?.toISOString() ?? null,
          }))}
          flagOn={viewer.season.flags.credits}
          seasonTitle={viewer.season.title}
        />
      </section>

      <section className={`${s.pane} ${s.root}`} data-probe="sp-claims">
        <h3 className={s.paneHead}>팀별 발급 현황</h3>
        <ClaimsPane
          offers={view.offers.map((o) => ({
            id: o.id,
            kind: o.kind,
            status: o.status,
            deliveryMethod: o.deliveryMethod,
          }))}
          rows={view.claims.map((r) => ({
            ...r,
            lastDeliveredAt: r.lastDeliveredAt ? fmtStamp(r.lastDeliveredAt) : null,
            cells: r.cells.map((x) => ({
              ...x,
              detail: x.detail
                ? {
                    ...x.detail,
                    deliveredAt: x.detail.deliveredAt ? fmtStamp(x.detail.deliveredAt) : null,
                    mailFailedAt: x.detail.mailFailedAt ? fmtStamp(x.detail.mailFailedAt) : null,
                  }
                : null,
            })),
          }))}
        />
      </section>

      <section className={`${s.pane} ${s.root}`} data-probe="sp-log">
        <h3 className={s.paneHead}>발송 이력</h3>
        <Card style={{ padding: "8px 22px" }}>
          <div className={c.minlog}>
            {lines.length === 0 ? (
              <div>
                <span>기록 없음.</span>
              </div>
            ) : (
              lines.map((l, i) => (
                <div key={i}>
                  <span className={c.t}>{fmtStamp(l.at)}</span>
                  <span>
                    <span className={c.who}>{l.who}</span>
                    {l.text}
                  </span>
                  <Badge tone={l.tag.tone} className={c.tg}>
                    {l.tag.label}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </Card>
      </section>
    </>
  );
}
