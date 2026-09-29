"use client";

import { useActionState, useRef, useState } from "react";

import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Field, Input, Select, Textarea } from "@/components/Field";
import { Card, Chip } from "@/components/Surface";
import {
  CreditDelivery,
  CreditKind,
  CreditOfferStatus,
  CreditUnlockEvent,
} from "@/generated/prisma/enums";
import { CREDIT_CARDS, OFFER_STATUS_LABEL } from "@/lib/credits";

import hub from "../../dashboard/hub.module.css";
import c from "../console.module.css";
import { ReasonModal } from "../ReasonModal";
import {
  changeOfferStatus,
  saveOffer,
  uploadCodes,
  uploadLogo,
  type SponsorActionState,
} from "./actions";
import s from "./sponsors.module.css";

/*
  ① 혜택 설정 — 시안 `.pane[data-id="sp-offers"]`.

  표 아래 편집 카드는 하나다(시안 「C1 편집」). 줄의 「편집」을 누르면 그 카드가
  선다. 「+ 혜택 등록」은 아직 행이 없는 카드를 새로 여는 것이다 — 카드는 넷뿐이라
  넷 다 있으면 잠긴다.

  쓰기는 전부 사유 모달(`#mdl-reason`)을 거친다 — 저장·상태 전환·CSV 업로드.
  로고 교체만 파일을 고르는 순간 올라간다(감사 로그 사유는 파일 이름).

  시안 편집 칸에 없는 셋(초대 링크·적용 방법 링크·적용 안내)을 맨 아래에 남겼다 —
  참가자 혜택 카드가 그 값을 그린다(내가 정함, 수연 확인 대기).
*/

type Offer = {
  id: string;
  kind: CreditKind;
  code: string;
  title: string;
  status: CreditOfferStatus;
  sponsorName: string | null;
  sponsorLogoUrl: string | null;
  unlockEvent: string;
  deliveryMethod: CreditDelivery;
  releaseDate: string | null;
  validUntil: string | null;
  description: string | null;
  value: string | null;
  inviteUrl: string | null;
  howtoUrl: string | null;
  redeemNote: string | null;
  fallbackUrl: string | null;
  pool: { remaining: number; total: number; consumed: number; expired: number };
};

const INITIAL: SponsorActionState = {};

const MD = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" });
const md = (iso: string) => MD.format(new Date(iso)).replace("/", ".");
const ymd = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(iso)) : "";

/* 시안은 enum 값을 대문자로 적는다(「S1_SUBMITTED」·「CODE_POOL」) */
const UPPER = (v: string) => v.toUpperCase();

/* 편집 칸의 셀렉트 이름 — 시안 「C1 빌더 크레딧」·「활성」 */
const KIND_OPTION = CREDIT_CARDS.map((card) => ({ value: card.kind, label: `${card.code} ${card.title}` }));

export function OffersPane({
  offers,
  flagOn,
  seasonTitle,
}: {
  offers: Offer[];
  flagOn: boolean;
  seasonTitle: string;
}) {
  const byKind = new Map(offers.map((o) => [o.kind, o]));
  const missing = CREDIT_CARDS.filter((card) => !byKind.has(card.kind));
  const [editing, setEditing] = useState<CreditKind>(offers[0]?.kind ?? CREDIT_CARDS[0].kind);
  const offer = byKind.get(editing) ?? null;
  const card = CREDIT_CARDS.find((x) => x.kind === editing)!;

  const [saveState, saveAction, saving] = useActionState(saveOffer, INITIAL);
  const [statusState, statusAction, switching] = useActionState(changeOfferStatus, INITIAL);
  const [codeState, codeAction, uploading] = useActionState(uploadCodes, INITIAL);
  const [logoState, logoAction, logoPending] = useActionState(uploadLogo, INITIAL);

  const [modal, setModal] = useState<null | "save" | "status" | "codes">(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [statusNext, setStatusNext] = useState<CreditOfferStatus>(CreditOfferStatus.active);
  const formRef = useRef<HTMLFormElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const logoForm = useRef<HTMLFormElement>(null);

  /* 저장되면 모달을 닫는다 — 렌더 중에 견준다 */
  const [seen, setSeen] = useState([saveState.done, statusState.done, codeState.done]);
  const now = [saveState.done, statusState.done, codeState.done];
  if (now.some((v, i) => v !== seen[i])) {
    setSeen(now);
    setModal(null);
  }

  const openSave = () => {
    const fd = new FormData(formRef.current!);
    setFields(Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)])));
    setModal("save");
  };

  const message =
    modal === "save" ? saveState.message : modal === "status" ? statusState.message : codeState.message;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }} data-probe="sp-offers-bar">
        <Chip>feature_flag credit_center {flagOn ? "ON" : "OFF"}</Chip>
        <Chip>{seasonTitle}</Chip>
        <Button
          type="button"
          variant="primary"
          style={{ marginLeft: "auto", padding: "9px 16px", fontSize: "13px" }}
          /* 카드는 넷뿐이다 — 넷 다 있으면 편집 카드(C1)로 보낸다 */
          title={missing.length === 0 ? "카드 넷이 모두 등록됨, 편집으로 고침" : undefined}
          onClick={() => setEditing(missing[0]?.kind ?? CREDIT_CARDS[0].kind)}
        >
          + 혜택 등록
        </Button>
      </div>

      <table className={c.atbl} data-probe="sp-offers-table">
        <thead>
          <tr>
            <th>KIND</th>
            <th>스폰서</th>
            <th>STATUS</th>
            <th>언락 이벤트, 지급 방식</th>
            <th>지급 시점, 유효기간</th>
            <th>코드 잔여</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {CREDIT_CARDS.map((spec) => {
            const o = byKind.get(spec.kind);
            const award = spec.kind === CreditKind.c4;
            return (
              <tr key={spec.kind} className={!o || o.status === CreditOfferStatus.negotiating ? s.pend : undefined}>
                <td className={`${c.num} ${s.num}`}>{spec.code}</td>
                <td>
                  {o?.sponsorName ? <b>{o.sponsorName}</b> : <b style={{ color: "var(--faint)" }}>미정</b>}
                  <br />
                  <span className={s.sub}>{spec.title}</span>
                </td>
                <td>
                  {o ? (
                    <Badge
                      tone={o.status === CreditOfferStatus.active ? "lime" : "gray"}
                      dashed={o.status === CreditOfferStatus.negotiating}
                    >
                      {OFFER_STATUS_LABEL[o.status]}
                    </Badge>
                  ) : (
                    <Badge tone="gray" dashed>
                      미등록
                    </Badge>
                  )}
                </td>
                <td>
                  <span className={s.ev}>{UPPER(o?.unlockEvent ?? spec.unlockEvent)}</span>
                  <br />
                  <span className={s.dm}>{UPPER(o?.deliveryMethod ?? CreditDelivery.manual)}</span>
                </td>
                <td className={`${c.num} ${s.num}`}>
                  {!o || o.status === CreditOfferStatus.negotiating ? (
                    "-"
                  ) : (
                    <>
                      {/* C1은 팀마다 게이트 1 때다(편집 칸 주석) — 날짜 하나로 적지 않는다 */}
                      {o.kind === CreditKind.c1 ? (
                        <span className={s.sub}>게이트 1 통과 때</span>
                      ) : o.releaseDate ? (
                        md(o.releaseDate)
                      ) : (
                        <span className={s.sub}>조건 즉시</span>
                      )}
                      <br />
                      <span className={s.sub}>~ {o.validUntil ? md(o.validUntil) : "미정"}</span>
                    </>
                  )}
                </td>
                <td className={`${c.num} ${s.num}`}>
                  {!o || o.status === CreditOfferStatus.negotiating ? (
                    <span className={s.sub}>폴백 표시 중</span>
                  ) : o.deliveryMethod === CreditDelivery.code_pool ? (
                    `${o.pool.remaining} / ${o.pool.total}`
                  ) : o.deliveryMethod === CreditDelivery.invite_link ? (
                    <span style={{ color: "var(--faint)" }}>링크형</span>
                  ) : (
                    "-"
                  )}
                </td>
                <td>
                  <Button type="button" variant="ghost" className={c.tblBtn} onClick={() => setEditing(spec.kind)}>
                    편집
                  </Button>
                  {award ? (
                    <Chip>시상 절차</Chip>
                  ) : o ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className={c.tblBtn}
                      onClick={() => {
                        setEditing(spec.kind);
                        setStatusNext(o.status === CreditOfferStatus.active ? CreditOfferStatus.ended : CreditOfferStatus.active);
                        setModal("status");
                      }}
                    >
                      상태 전환
                    </Button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* 편집 카드 — 시안 「C1 편집」 */}
      <Card style={{ padding: "22px 24px", marginTop: "18px" }} data-probe="sp-edit">
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          <b style={{ fontSize: "15px" }}>
            {card.code} {offer ? "편집" : "등록"}
          </b>
          {offer ? (
            <Badge tone={offer.status === CreditOfferStatus.active ? "lime" : "gray"} dashed={offer.status === CreditOfferStatus.negotiating}>
              {OFFER_STATUS_LABEL[offer.status]}
            </Badge>
          ) : null}
          <Chip style={{ marginLeft: "auto" }}>offer_{String(CREDIT_CARDS.indexOf(card) + 1).padStart(2, "0")}</Chip>
        </div>

        <form ref={formRef} key={editing} className={s.form} onSubmit={(e) => e.preventDefault()}>
          <Field label="kind">
            {/*
              등록에서는 아직 없는 카드만 고른다. 고르면 그 카드의 등록 폼으로 바꿔 선다 —
              폼의 기본값(언락 이벤트 등)이 고른 카드의 것이어야 해서다.
            */}
            <Select
              name="kind"
              className={s.inp}
              value={editing}
              disabled={!!offer}
              onChange={(e) => setEditing(e.target.value as CreditKind)}
            >
              {KIND_OPTION.filter((k) => offer || !byKind.has(k.value)).map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
            {/* 잠근 셀렉트는 폼에 안 실린다 — 값은 숨은 칸이 싣는다 */}
            {offer ? <input type="hidden" name="kind" value={editing} /> : null}
            {/*
              등록인지 편집인지 — 서버가 있는 카드를 등록 폼으로 덮지 않게(admin-store
              `saveCreditOffer`). 칸 안에 둔다 — 폼의 자식 순서는 대조가 nth-child로 잰다.
            */}
            <input type="hidden" name="mode" value={offer ? "edit" : "create"} />
          </Field>
          <Field label="status">
            <Select name="status" className={s.inp} defaultValue={offer?.status ?? CreditOfferStatus.negotiating}>
              {Object.values(CreditOfferStatus).map((v) => (
                <option key={v} value={v}>
                  {OFFER_STATUS_LABEL[v]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="sponsorName">
            <Input name="sponsorName" className={s.inp} defaultValue={offer?.sponsorName ?? ""} />
          </Field>
          <Field label="sponsorLogo" note="svg, png">
            <div className={hub.keybox} style={{ padding: "9px 13px", fontSize: "12.5px", flexWrap: "nowrap" }}>
              {offer?.sponsorLogoUrl ? offer.sponsorLogoUrl.split("/").pop() : "없음"}
              <Button
                type="button"
                variant="outline"
                style={{ padding: "5px 11px", fontSize: "12px", marginLeft: "auto" }}
                disabled={!offer || logoPending}
                onClick={() => logoForm.current?.querySelector("input")?.click()}
              >
                교체
              </Button>
            </div>
          </Field>
          <Field label="unlockEvent">
            <Select name="unlockEvent" className={s.inp} defaultValue={offer?.unlockEvent ?? card.unlockEvent}>
              {Object.values(CreditUnlockEvent).map((v) => (
                <option key={v} value={v}>
                  {UPPER(v)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="deliveryMethod">
            <Select name="deliveryMethod" className={s.inp} defaultValue={offer?.deliveryMethod ?? CreditDelivery.manual}>
              {Object.values(CreditDelivery).map((v) => (
                <option key={v} value={v}>
                  {UPPER(v)}
                </option>
              ))}
            </Select>
          </Field>
          {/*
            C1은 팀마다 게이트 1이 가려질 때 보낸다(lib/credits.ts `releaseDue`, 2026-09-30
            수연 결정) — 이 칸을 쓰지 않는다. 적어 둬도 무시되므로 잠근다.
          */}
          <Field
            label="releaseDate"
            note={editing === CreditKind.c1 ? "C1은 팀별 게이트 1 때" : "빌드 스테이지 개시일"}
          >
            <Input
              name="releaseDate"
              mono
              className={s.inp}
              placeholder={editing === CreditKind.c1 ? "게이트 1 통과 때" : "YYYY-MM-DD"}
              defaultValue={editing === CreditKind.c1 ? "" : ymd(offer?.releaseDate ?? null)}
              disabled={editing === CreditKind.c1}
            />
          </Field>
          <Field label="validUntil">
            <Input name="validUntil" mono className={s.inp} placeholder="YYYY-MM-DD" defaultValue={ymd(offer?.validUntil ?? null)} />
          </Field>
          <Field label="value" note="카드 표기">
            <Input name="value" className={s.inp} defaultValue={offer?.value ?? ""} />
          </Field>
          <Field label="fallbackContent" note="노션 링크">
            <Input name="fallbackUrl" className={s.inp} defaultValue={offer?.fallbackUrl ?? ""} />
          </Field>
          <Field label="description" className={s.full}>
            <Textarea name="description" className={s.inp} rows={2} defaultValue={offer?.description ?? ""} />
          </Field>
          {/* 코드 풀은 코드 풀 방식 카드에만 — 초대 링크·수동 카드에 코드를 올릴 자리는 없다 */}
          {offer && offer.deliveryMethod === CreditDelivery.code_pool ? (
            <Field label="codePool" note="스폰서 생성, CSV" className={s.full} hint="코드는 스폰서가 생성해요. 잔여 10개 이하가 되면 운영자에게 알림이 가요.">
              <div className={s.pool}>
                <span className="score">
                  {offer.pool.remaining}
                  <i>/{offer.pool.total}</i>
                </span>
                <span className={s.bar}>
                  <i style={{ width: `${offer.pool.total ? Math.round((offer.pool.remaining / offer.pool.total) * 100) : 0}%` }} />
                </span>
                <span className={s.dm} style={{ fontSize: "12px" }}>
                  소비 {offer.pool.consumed}, 만료 {offer.pool.expired}
                </span>
                <Button type="button" variant="outline" className={s.poolBtn} onClick={() => csvRef.current?.click()}>
                  CSV 업로드
                </Button>
              </div>
              {/* 올린 결과 — 모달이 닫힌 뒤라 여기에 적는다 */}
              {codeState.notice ? (
                <p role="status" className={s.dm} style={{ marginTop: "8px", fontSize: "12.5px" }}>
                  {codeState.notice}
                </p>
              ) : null}
            </Field>
          ) : null}
          {/* 시안 편집 칸에 없는 셋 — 머리 주석 */}
          <Field label="inviteUrl" note="초대 링크형">
            <Input name="inviteUrl" className={s.inp} defaultValue={offer?.inviteUrl ?? ""} />
          </Field>
          <Field label="howtoUrl" note="적용 방법 링크">
            <Input name="howtoUrl" className={s.inp} defaultValue={offer?.howtoUrl ?? ""} />
          </Field>
          <Field label="redeemNote" note="발송 줄의 적용 안내" className={s.full}>
            <Input name="redeemNote" className={s.inp} defaultValue={offer?.redeemNote ?? ""} />
          </Field>
        </form>

        <div className={s.ft}>
          <Button type="button" variant="ghost" onClick={() => formRef.current?.reset()}>
            취소
          </Button>
          <Button type="button" variant="primary" onClick={openSave}>
            저장
          </Button>
        </div>
        {logoState.message ? (
          <p role="alert" style={{ marginTop: "10px", fontSize: "13px", color: "var(--danger)" }}>
            {logoState.message}
          </p>
        ) : null}
      </Card>

      {/* 로고 — 고르면 곧바로 올린다 */}
      <form ref={logoForm} action={logoAction} hidden>
        <input
          type="file"
          name="logo"
          accept="image/svg+xml,image/png,image/jpeg,image/webp"
          onChange={() => logoForm.current?.requestSubmit()}
        />
        <input type="hidden" name="offerId" value={offer?.id ?? ""} />
      </form>
      {/* CSV — 고르면 글을 읽어 사유 모달로 넘긴다 */}
      <input
        ref={csvRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file || !offer) return;
          setFields({ offerId: offer.id, codes: await file.text(), filename: file.name });
          setModal("codes");
          e.target.value = "";
        }}
      />

      <ReasonModal
        open={modal !== null}
        onClose={() => setModal(null)}
        action={modal === "save" ? saveAction : modal === "status" ? statusAction : codeAction}
        pending={saving || switching || uploading}
        message={message}
        fields={
          modal === "status"
            ? { offerId: offer?.id ?? "", status: statusNext }
            : modal === "codes"
              ? { offerId: fields.offerId ?? "", codes: fields.codes ?? "" }
              : fields
        }
        extra={
          modal === "status" ? (
            <Select
              aria-label="바꿀 상태"
              style={{ marginTop: "12px" }}
              value={statusNext}
              onChange={(e) => setStatusNext(e.target.value as CreditOfferStatus)}
            >
              {Object.values(CreditOfferStatus)
                .filter((v) => v !== offer?.status)
                .map((v) => (
                  <option key={v} value={v}>
                    {OFFER_STATUS_LABEL[offer?.status ?? v]} → {OFFER_STATUS_LABEL[v]}
                  </option>
                ))}
            </Select>
          ) : modal === "codes" ? (
            <p style={{ marginTop: "8px" }}>
              {card.code} 코드 풀에 올릴 파일: <b className="mono">{fields.filename}</b>
            </p>
          ) : null
        }
      />
    </>
  );
}
