"use client";

import { useActionState, useState } from "react";

import { Badge } from "@/components/Badge";
import { Button, LinkButton } from "@/components/Button";
import { Input, Select } from "@/components/Field";
import { Modal } from "@/components/Modal";
import { Chip } from "@/components/Surface";
import { CreditKind, CreditOfferStatus } from "@/generated/prisma/enums";
import { CREDIT_CARD_BY_KIND } from "@/lib/credits";

import c from "../console.module.css";
import { ReasonModal } from "../ReasonModal";
import { batchDeliver, deliverManually, type SponsorActionState } from "./actions";
import s from "./sponsors.module.css";

/*
  ② 팀별 발급 현황 — 시안 `.pane[data-id="sp-claims"]`.

  필터(카드·상태·팀명)는 이 화면 안에서만 거른다 — 팀이 수십이라 서버에 다시 묻지
  않는다. 「발급 가능 팀에 일괄 발송」은 카드를 골랐으면 그 카드, 안 골랐으면 보낼
  팀이 가장 많은 활성 카드를 보낸다(내가 정함, 수연 확인 대기) → `#mdl-crbatch`.

  줄 끝 칸은 시안 넷 — 발급 가능한 카드가 있으면 「수동 발급」, 이미 받은 게 있으면
  「이력」(감사 로그의 credit.*로 간다), 탈락은 「테스터 전환」, 실격은 「추가 발급 중지」.
*/

type Cell = { kind: CreditKind; label: string; tone: "lime" | "teal" | "gray"; dashed: boolean; available: boolean };
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

export function ClaimsPane({
  offers,
  rows,
}: {
  offers: { id: string; kind: CreditKind; status: CreditOfferStatus }[];
  rows: Row[];
}) {
  const [card, setCard] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [manual, setManual] = useState<Row | null>(null);
  const [manualKind, setManualKind] = useState<CreditKind | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);

  const [mState, mAction, mPending] = useActionState(deliverManually, INITIAL);
  const [bState, bAction, bPending] = useActionState(batchDeliver, INITIAL);
  const [seen, setSeen] = useState([mState.done, bState.done]);
  if (seen[0] !== mState.done || seen[1] !== bState.done) {
    setSeen([mState.done, bState.done]);
    setManual(null);
    setBatchOpen(false);
  }

  const kinds = rows[0]?.cells.map((x) => x.kind) ?? [CreditKind.c1, CreditKind.c2, CreditKind.c3];
  const shown = rows.filter(
    (r) =>
      (!q || r.teamName.includes(q.trim())) &&
      (!status || r.cells.some((x) => (!card || x.kind === card) && x.label.startsWith(status))),
  );

  /* 일괄 발송할 카드 — 골랐으면 그것, 아니면 보낼 팀이 가장 많은 활성 카드 */
  const active = offers.filter((o) => o.status === CreditOfferStatus.active && o.kind !== CreditKind.c4);
  const targetsOf = (kind: CreditKind) => rows.filter((r) => r.cells.some((x) => x.kind === kind && x.available));
  const batchOffer =
    active.find((o) => o.kind === card) ??
    [...active].sort((a, b) => targetsOf(b.kind).length - targetsOf(a.kind).length)[0] ??
    null;
  const batchTargets = batchOffer ? targetsOf(batchOffer.kind) : [];

  const offerOf = (kind: CreditKind | null) => offers.find((o) => o.kind === kind);

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
      {bState.notice ? (
        <div role="status" style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--muted)" }}>
          {bState.notice}
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
            const availableKinds = r.cells.filter((x) => x.available).map((x) => x.kind);
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
                {r.cells.map((x) => (
                  <td key={x.kind}>
                    <Badge tone={x.tone} dashed={x.dashed} className={c.bdMini}>
                      {x.label}
                    </Badge>
                  </td>
                ))}
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
                        setManualKind(availableKinds[0]);
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
            <Select
              aria-label={`${manual.teamName} 발급할 카드`}
              style={{ marginTop: "12px" }}
              value={manualKind ?? ""}
              onChange={(e) => setManualKind(e.target.value as CreditKind)}
            >
              {manual.cells
                .filter((x) => x.available)
                .map((x) => (
                  <option key={x.kind} value={x.kind}>
                    {manual.teamName}, {CREDIT_CARD_BY_KIND[x.kind].code} {CREDIT_CARD_BY_KIND[x.kind].title}
                  </option>
                ))}
            </Select>
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
    </>
  );
}
