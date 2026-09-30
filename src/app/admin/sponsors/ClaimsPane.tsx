"use client";

import { useActionState, useState } from "react";

import { Badge } from "@/components/Badge";
import { Button, LinkButton } from "@/components/Button";
import { Field, Input, Select } from "@/components/Field";
import { Modal } from "@/components/Modal";
import { Card, Chip } from "@/components/Surface";
import { Toast, useToast } from "@/components/Toast";
import { CreditDelivery, CreditKind, CreditOfferStatus } from "@/generated/prisma/enums";
import { CREDIT_CARD_BY_KIND } from "@/lib/credits";

import hub from "../../dashboard/hub.module.css";
import c from "../console.module.css";
import { ReasonModal } from "../ReasonModal";
import { batchDeliver, deliverManually, resendMail, type SponsorActionState } from "./actions";
import s from "./sponsors.module.css";

/*
  ② 팀별 발급 현황 — 시안 `.pane[data-id="sp-claims"]`.

  필터(카드·상태·팀명)는 이 화면 안에서만 거른다 — 팀이 수십이라 서버에 다시 묻지
  않는다. 「발급 가능 팀에 일괄 발송」은 카드를 골랐으면 그 카드, 안 골랐으면 보낼
  팀이 가장 많은 활성 카드를 보낸다(내가 정함, 수연 확인 대기) → `#mdl-crbatch`.

  줄 끝 칸은 시안 넷 — 발급 가능한 카드가 있으면 「수동 발급」, 이미 받은 게 있으면
  「이력」(감사 로그의 credit.*로 간다), 탈락은 「테스터 전환」, 실격은 「추가 발급 중지」.

  내가 정함(수연 확인 대기) — 시안에 없는 셋(2026-09-30 수연 「네 가지 붙여」).
    · 발급 기록이 있는 칸은 누를 수 있다 → 발급 상세(나간 코드·메일 결과·재발송).
      줄 끝 칸은 한 줄에 버튼 하나라 카드마다 여는 자리를 칸에 둔다.
    · 수동형 카드의 수동 발급은 보낼 코드를 적는다(사유 모달에 칸 하나).
    · 「발급 완료, 메일 실패」(빨강)·「발급 예정, 코드 대기」(노랑) 칸.
*/

type Detail = {
  offerId: string;
  code: string | null;
  link: string | null;
  deliveredAt: string | null;
  mailFailedAt: string | null;
  resendable: boolean;
};
type Cell = {
  kind: CreditKind;
  label: string;
  tone: "lime" | "teal" | "gray" | "red" | "warn";
  dashed: boolean;
  available: boolean;
  awaitingCode: boolean;
  detail: Detail | null;
};
type Row = {
  entryId: string;
  teamName: string;
  stage: string;
  status: string;
  undeployed: boolean;
  cells: Cell[];
  lastDeliveredAt: string | null;
  sponsorConsent: boolean;
};

const INITIAL: SponsorActionState = {};

/* 시안 머리글 「C1 빌더」·「C2 API」·「C3 마케팅」 */
const HEAD: Partial<Record<CreditKind, string>> = {
  [CreditKind.c1]: "C1 빌더",
  [CreditKind.c2]: "C2 API",
  [CreditKind.c3]: "C3 마케팅",
};

const STATUS_FILTER = ["잠금", "발급 가능", "발급 예정", "발급 완료", "발급 확인", "만료"];

/* 시안 `.keybox .cp` 복사 버튼 크기 — 편입 링크 상자와 같다 */
const CP = { padding: "7px 14px", fontSize: "12.5px" } as const;

export function ClaimsPane({
  offers,
  rows,
}: {
  offers: { id: string; kind: CreditKind; status: CreditOfferStatus; deliveryMethod: CreditDelivery }[];
  rows: Row[];
}) {
  const [card, setCard] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [manual, setManual] = useState<Row | null>(null);
  const [manualKind, setManualKind] = useState<CreditKind | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  /* 발급 상세와 재발송 — 어느 팀의 어느 카드인가 */
  const [detail, setDetail] = useState<{ row: Row; cell: Cell } | null>(null);
  const [resend, setResend] = useState<{ row: Row; cell: Cell } | null>(null);
  const { message: toast, show } = useToast();

  const [mState, mAction, mPending] = useActionState(deliverManually, INITIAL);
  const [bState, bAction, bPending] = useActionState(batchDeliver, INITIAL);
  const [rState, rAction, rPending] = useActionState(resendMail, INITIAL);
  const [seen, setSeen] = useState([mState.done, bState.done, rState.done]);
  if (seen[0] !== mState.done || seen[1] !== bState.done || seen[2] !== rState.done) {
    setSeen([mState.done, bState.done, rState.done]);
    setManual(null);
    setBatchOpen(false);
    setResend(null);
  }
  /* 표 위의 결과 줄 — 셋 중 마지막으로 끝난 것 하나만 */
  const notice = [mState, bState, rState]
    .filter((x) => x.notice && x.done)
    .sort((a, b) => (b.done ?? 0) - (a.done ?? 0))[0]?.notice;

  const kinds = rows[0]?.cells.map((x) => x.kind) ?? [CreditKind.c1, CreditKind.c2, CreditKind.c3];
  const shown = rows.filter(
    (r) =>
      (!q || r.teamName.includes(q.trim())) &&
      (!status || r.cells.some((x) => (!card || x.kind === card) && x.label.startsWith(status))),
  );

  /*
    일괄 발송할 카드 — 골랐으면 그것, 아니면 보낼 팀이 가장 많은 활성 카드. 수동형은
    팀마다 코드를 적어야 해서 빠진다(서버도 거절한다).
  */
  const active = offers.filter(
    (o) =>
      o.status === CreditOfferStatus.active &&
      o.kind !== CreditKind.c4 &&
      o.deliveryMethod !== CreditDelivery.manual,
  );
  const targetsOf = (kind: CreditKind) => rows.filter((r) => r.cells.some((x) => x.kind === kind && x.available));
  const batchOffer =
    active.find((o) => o.kind === card) ??
    [...active].sort((a, b) => targetsOf(b.kind).length - targetsOf(a.kind).length)[0] ??
    null;
  const batchTargets = batchOffer ? targetsOf(batchOffer.kind) : [];

  const offerOf = (kind: CreditKind | null) => offers.find((o) => o.kind === kind);
  /* 수동 발급을 걸 수 있는 칸 — 발급 가능이거나 수동형이 코드를 기다린다 */
  const fillable = (x: Cell) => x.available || x.awaitingCode;
  const manualCell = manual?.cells.find((x) => x.kind === manualKind) ?? null;
  const manualNeedsCode = offerOf(manualKind)?.deliveryMethod === CreditDelivery.manual;

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      show("코드 복사됨");
    } catch {
      /* 클립보드를 막아둔 브라우저도 있다. 코드는 상자에 그대로 있다 */
      show("복사 실패, 상자에서 직접 옮겨 적어야 함");
    }
  };

  return (
    <>
      <div className={c.fbar} data-probe="fbar">
        <Select className={c.fbarSel} aria-label="카드" value={card} onChange={(e) => setCard(e.target.value)}>
          <option value="">카드 전체</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {CREDIT_CARD_BY_KIND[k].code}
            </option>
          ))}
        </Select>
        <Select className={c.fbarSel} aria-label="상태" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">상태 전체</option>
          {STATUS_FILTER.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Select>
        <Input
          className={c.fbarInp}
          placeholder="팀명 검색"
          aria-label="팀명 검색"
          style={{ flex: 1, minWidth: "160px" }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button
          type="button"
          variant="primary"
          style={{ padding: "8px 14px", fontSize: "13px" }}
          onClick={() => setBatchOpen(true)}
        >
          발급 가능 팀에 일괄 발송
        </Button>
      </div>

      {/* 보낸 결과 — 모달이 닫힌 뒤라 표 위에 적는다(일부만 됐거나 메일이 실패한 것까지) */}
      {notice ? (
        <div role="status" style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--muted)" }}>
          {notice}
        </div>
      ) : null}

      <table className={c.atbl} data-probe="sp-claims-table">
        <thead>
          <tr>
            <th>TEAM</th>
            <th>STAGE</th>
            {kinds.map((k) => (
              <th key={k}>{HEAD[k] ?? CREDIT_CARD_BY_KIND[k].code}</th>
            ))}
            <th>최근 발송</th>
            <th>정보 동의</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const availableKinds = r.cells.filter(fillable).map((x) => x.kind);
            const delivered = r.cells.some((x) => x.label === "발급 완료" || x.label === "발급 확인");
            return (
              <tr key={r.entryId}>
                <td>
                  <b>{r.teamName}</b>
                  {r.status === "eliminated" ? (
                    <>
                      {" "}
                      <Badge tone="gray" className={c.bdMini}>
                        eliminated
                      </Badge>
                    </>
                  ) : r.status === "disqualified" ? (
                    <>
                      {" "}
                      <Badge tone="red" className={c.bdMini}>
                        disqualified
                      </Badge>
                    </>
                  ) : r.undeployed ? (
                    <>
                      {" "}
                      <Badge tone="gray" className={c.bdMini}>
                        미배포
                      </Badge>
                    </>
                  ) : null}
                </td>
                <td className={`${c.num} ${s.num}`}>{r.stage}</td>
                {r.cells.map((x) => {
                  const badge = (
                    <Badge tone={x.tone} dashed={x.dashed} className={c.bdMini}>
                      {x.label}
                    </Badge>
                  );
                  return (
                    <td key={x.kind}>
                      {x.detail ? (
                        <button
                          type="button"
                          className={s.cellBtn}
                          aria-label={`${r.teamName} ${CREDIT_CARD_BY_KIND[x.kind].code} 발급 상세`}
                          onClick={() => setDetail({ row: r, cell: x })}
                        >
                          {badge}
                        </button>
                      ) : (
                        badge
                      )}
                    </td>
                  );
                })}
                <td className={`${c.num} ${s.num}`}>{r.lastDeliveredAt ?? "-"}</td>
                <td className={`${c.num} ${s.num}`} style={{ color: r.sponsorConsent ? "var(--teal)" : "var(--faint)" }}>
                  {r.sponsorConsent ? "✓" : "-"}
                </td>
                <td>
                  {r.status === "eliminated" ? (
                    <Chip>테스터 전환</Chip>
                  ) : r.status === "disqualified" ? (
                    <Chip style={{ color: "var(--danger)", borderColor: "rgba(255,93,93,.4)" }}>추가 발급 중지</Chip>
                  ) : availableKinds.length ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className={c.tblBtn}
                      onClick={() => {
                        setManual(r);
                        /* 운영자를 기다리는 칸(코드 대기)이 먼저다 — 팀이 이미 받기를 눌렀다 */
                        setManualKind(r.cells.find((x) => x.awaitingCode)?.kind ?? availableKinds[0]);
                      }}
                    >
                      수동 발급
                    </Button>
                  ) : delivered ? (
                    <LinkButton href="/admin/audit-logs?action=credit&period=season" variant="ghost" className={c.tblBtn}>
                      이력
                    </LinkButton>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ fontSize: "12.5px", color: "var(--faint)", marginTop: "12px", lineHeight: 1.7 }}>
        팀당 1회. 코드는 발급 완료 시점에 1개 소비되고 되돌리지 않음. 협의 중 카드는 언락이 발생해도
        폴백 가이드만 노출됨. 수동 발급은 사유와 함께 감사 로그에 기록됨.
      </p>

      <ReasonModal
        open={manual !== null}
        onClose={() => setManual(null)}
        action={mAction}
        pending={mPending}
        message={mState.message}
        fields={{ offerId: offerOf(manualKind)?.id ?? "", entryId: manual?.entryId ?? "" }}
        extra={
          manual ? (
            <>
              <Select
                aria-label={`${manual.teamName} 발급할 카드`}
                style={{ marginTop: "12px" }}
                value={manualKind ?? ""}
                onChange={(e) => setManualKind(e.target.value as CreditKind)}
              >
                {manual.cells.filter(fillable).map((x) => (
                  <option key={x.kind} value={x.kind}>
                    {manual.teamName}, {CREDIT_CARD_BY_KIND[x.kind].code} {CREDIT_CARD_BY_KIND[x.kind].title}
                    {x.awaitingCode ? ", 코드 대기" : ""}
                  </option>
                ))}
              </Select>
              {/* 수동형은 운영자가 코드를 적는다 — 적은 코드로 팀에 메일이 나간다 */}
              {manualNeedsCode ? (
                <Field
                  label="보낼 코드"
                  note={manualCell?.awaitingCode ? "팀이 받기를 눌러 둠" : "스폰서에게 받은 코드"}
                  htmlFor="sp-manual-code"
                  className={s.codeFld}
                >
                  <Input id="sp-manual-code" name="code" mono autoComplete="off" spellCheck={false} />
                </Field>
              ) : null}
            </>
          ) : null
        }
      />

      {/* 발급 상세 — 나간 코드와 메일 결과. 보기만 하므로 사유를 묻지 않는다 */}
      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={
          detail
            ? `${detail.row.teamName}, ${CREDIT_CARD_BY_KIND[detail.cell.kind].code} ${CREDIT_CARD_BY_KIND[detail.cell.kind].title}`
            : ""
        }
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setDetail(null)}>
              닫기
            </Button>
            {detail?.cell.detail?.resendable ? (
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  setResend(detail);
                  setDetail(null);
                }}
              >
                재발송
              </Button>
            ) : null}
          </>
        }
      >
        {detail?.cell.detail ? (
          <div data-probe="sp-claim-detail">
            <Card className={hub.sum} style={{ marginBottom: "14px" }}>
              <div>
                <span>상태</span>
                <Badge tone={detail.cell.tone} dashed={detail.cell.dashed} className={c.bdMini}>
                  {detail.cell.label}
                </Badge>
              </div>
              <div>
                <span>발송</span>
                <b>{detail.cell.detail.deliveredAt ?? "보내기 전"}</b>
              </div>
              <div>
                <span>메일</span>
                <b style={detail.cell.detail.mailFailedAt ? { color: "var(--danger)" } : undefined}>
                  {detail.cell.detail.mailFailedAt
                    ? `실패, ${detail.cell.detail.mailFailedAt}`
                    : detail.cell.detail.deliveredAt
                      ? "보냄"
                      : "-"}
                </b>
              </div>
            </Card>
            {detail.cell.detail.code || detail.cell.detail.link ? (
              <div className={hub.keybox}>
                <span className={s.codeText}>{detail.cell.detail.code ?? detail.cell.detail.link}</span>
                <Button
                  type="button"
                  variant="outline"
                  className={s.cp}
                  style={CP}
                  onClick={() => void copy(detail.cell.detail?.code ?? detail.cell.detail?.link ?? "")}
                >
                  복사
                </Button>
              </div>
            ) : (
              <p style={{ fontSize: "13px", color: "var(--faint)" }}>
                {detail.cell.awaitingCode
                  ? "코드 대기. 줄 끝 수동 발급에서 보낼 코드를 적으면 나감."
                  : detail.cell.detail.deliveredAt
                    ? "나간 코드 없음. 이메일 명단 방식은 스폰서가 팀에 직접 보냄."
                    : "발급 예정. 보낼 때가 되면 자동으로 나감."}
              </p>
            )}
          </div>
        ) : null}
      </Modal>

      {/* 재발송 — 운영자 쓰기라 사유와 함께 감사 로그에 남는다 */}
      <ReasonModal
        open={resend !== null}
        onClose={() => setResend(null)}
        action={rAction}
        pending={rPending}
        message={rState.message}
        submitLabel="재발송"
        fields={{ offerId: resend?.cell.detail?.offerId ?? "", entryId: resend?.row.entryId ?? "" }}
        extra={
          resend ? (
            <p style={{ marginTop: "8px", fontSize: "13px", color: "var(--muted)" }}>
              {`${resend.row.teamName}, ${CREDIT_CARD_BY_KIND[resend.cell.kind].code}. 같은 코드로 팀원 모두에게 메일을 다시 보냄.`}
            </p>
          ) : null
        }
      />

      <Modal
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        title="발급 가능 팀에 코드를 보낼까요?"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setBatchOpen(false)}>
              취소
            </Button>
            <form action={bAction}>
              <input type="hidden" name="offerId" value={batchOffer?.id ?? ""} />
              <input type="hidden" name="entryIds" value={batchTargets.map((r) => r.entryId).join(",")} />
              <Button type="submit" variant="primary" disabled={bPending || batchTargets.length === 0}>
                발송
              </Button>
            </form>
          </>
        }
      >
        <p>
          대상{" "}
          <b className="mono" style={{ color: "var(--text)" }}>
            {batchOffer ? `${CREDIT_CARD_BY_KIND[batchOffer.kind].code}, ${batchTargets.length}팀` : "없음"}
          </b>
          , 채널 이메일. 보낸 코드는 회수할 수 없고 팀당 1개가 소비돼요.
        </p>
        {bState.message ? (
          <p role="alert" style={{ marginTop: "10px", fontSize: "13px", color: "var(--danger)" }}>
            {bState.message}
          </p>
        ) : null}
      </Modal>
      <Toast message={toast} />
    </>
  );
}
