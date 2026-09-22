"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/Button";
import {
  CreditDelivery,
  CreditKind,
  CreditOfferStatus,
  CreditUnlockEvent,
} from "@/generated/prisma/enums";
import { REASON_MIN } from "@/lib/admin";
import {
  DELIVERY_LABEL,
  OFFER_STATUS_LABEL,
  UNLOCK_EVENT_LABEL,
  CREDIT_CARD_BY_KIND,
} from "@/lib/credits";

import {
  deliverManually,
  saveOffer,
  uploadCodes,
  type SponsorActionState,
} from "./actions";

import styles from "./sponsors.module.css";

/*
  혜택 편집 · 코드 업로드 · 수동 발급.

  셋 다 **사유 칸이 폼 안에 있다.** 모달로 한 번 더 물어보는 대신 처음부터
  같이 받는다 — 모달은 "확인" 버튼을 누르는 절차일 뿐이고, 사유를 진짜로 쓰게
  만드는 것은 저장이 안 되는 것이다(REASON_MIN).

  ⚠️ 이 파일은 prisma를 import하지 않는다. 상수는 lib/admin.ts, 라벨은
  lib/credits.ts에서 온다 — 둘 다 순수 파일이다(admin.ts 머리 주석).
*/

const INITIAL: SponsorActionState = {};

function Feedback({ state }: { state: SponsorActionState }) {
  if (state.message) {
    return (
      <p className={styles.error} role="alert">
        {state.message}
      </p>
    );
  }
  if (state.done) {
    return (
      <p className={styles.ok} role="status">
        {state.done}
      </p>
    );
  }
  return null;
}

export type OfferDefaults = {
  kind: CreditKind;
  status: CreditOfferStatus;
  sponsorId: string | null;
  unlockEvent: CreditUnlockEvent;
  deliveryMethod: CreditDelivery;
  releaseDate: string;
  validUntil: string;
  inviteUrl: string;
  howtoUrl: string;
  redeemNote: string;
  description: string;
  value: string;
  fallbackUrl: string;
};

export function OfferForm({
  defaults,
  sponsors,
}: {
  defaults: OfferDefaults;
  sponsors: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(saveOffer, INITIAL);
  const [status, setStatus] = useState<string>(defaults.status);
  const [delivery, setDelivery] = useState<string>(defaults.deliveryMethod);
  const [sponsorId, setSponsorId] = useState<string>(defaults.sponsorId ?? "");

  const spec = CREDIT_CARD_BY_KIND[defaults.kind];
  /* 화면에서 미리 알려준다. 진짜 차단은 admin-store가 다시 한다 */
  const missingSponsor = status === CreditOfferStatus.active && !sponsorId;

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="kind" value={defaults.kind} />

      <div className={styles.formHead}>
        <b>
          {spec.code} {spec.title}
        </b>
        <span className={styles.formHint}>
          언락 조건은 설계서가 고정한 값이라 카드마다 하나다
        </span>
      </div>

      <Feedback state={state} />

      <div className={styles.grid}>
        <label className={styles.field}>
          <span>status</span>
          <select
            name="status"
            className={styles.input}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {Object.values(CreditOfferStatus).map((value) => (
              <option key={value} value={value}>
                {OFFER_STATUS_LABEL[value]}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>스폰서</span>
          <select
            name="sponsorId"
            className={styles.input}
            value={sponsorId}
            onChange={(e) => setSponsorId(e.target.value)}
          >
            <option value="">미정 (협의 중)</option>
            {sponsors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>unlockEvent</span>
          <select
            name="unlockEvent"
            className={styles.input}
            defaultValue={defaults.unlockEvent}
          >
            {Object.values(CreditUnlockEvent).map((value) => (
              <option key={value} value={value}>
                {UNLOCK_EVENT_LABEL[value]}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>deliveryMethod</span>
          <select
            name="deliveryMethod"
            className={styles.input}
            value={delivery}
            onChange={(e) => setDelivery(e.target.value)}
          >
            {Object.values(CreditDelivery).map((value) => (
              <option key={value} value={value}>
                {DELIVERY_LABEL[value]}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>
            releaseDate <small>C1은 빌드 스테이지 개시일</small>
          </span>
          <input
            type="date"
            name="releaseDate"
            className={styles.input}
            defaultValue={defaults.releaseDate}
          />
        </label>

        <label className={styles.field}>
          <span>validUntil</span>
          <input
            type="date"
            name="validUntil"
            className={styles.input}
            defaultValue={defaults.validUntil}
          />
        </label>

        <label className={styles.field}>
          <span>
            value <small>카드 표기</small>
          </span>
          <input
            name="value"
            className={styles.input}
            defaultValue={defaults.value}
            placeholder="$75 상당"
            maxLength={60}
          />
        </label>

        <label className={styles.field}>
          <span>
            fallbackUrl <small>0원 스타트 스택 가이드</small>
          </span>
          <input
            name="fallbackUrl"
            className={styles.input}
            defaultValue={defaults.fallbackUrl}
            placeholder="https://…"
          />
        </label>

        <label className={styles.field}>
          <span>
            howtoUrl <small>참가자 화면의 「적용 방법」 링크</small>
          </span>
          <input
            name="howtoUrl"
            className={styles.input}
            defaultValue={defaults.howtoUrl}
            placeholder="https://…"
          />
        </label>

        <label className={styles.field}>
          <span>
            redeemNote <small>발송 줄의 적용 안내 한 토막</small>
          </span>
          <input
            name="redeemNote"
            className={styles.input}
            defaultValue={defaults.redeemNote}
            maxLength={120}
            placeholder="Replit 계정의 Billing에서 Redeem"
          />
        </label>

        {delivery === CreditDelivery.invite_link ? (
          <label className={`${styles.field} ${styles.full}`}>
            <span>inviteUrl</span>
            <input
              name="inviteUrl"
              className={styles.input}
              defaultValue={defaults.inviteUrl}
              placeholder="https://…"
            />
          </label>
        ) : (
          <input type="hidden" name="inviteUrl" value={defaults.inviteUrl} />
        )}

        <label className={`${styles.field} ${styles.full}`}>
          <span>description</span>
          <textarea
            name="description"
            className={styles.input}
            rows={2}
            defaultValue={defaults.description}
          />
        </label>

        <label className={`${styles.field} ${styles.full}`}>
          <span>
            사유 <small>감사 로그에 남습니다. {REASON_MIN}자 이상</small>
          </span>
          <input name="reason" className={styles.input} required />
        </label>
      </div>

      {missingSponsor ? (
        <p className={styles.warn}>
          활성으로 바꾸려면 스폰서를 먼저 지정해 주세요. 스폰서 없이 활성이면
          참가자 화면에 받을 수 없는 버튼이 섭니다.
        </p>
      ) : null}

      <div className={styles.formFoot}>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "저장 중…" : "저장"}
        </Button>
      </div>
    </form>
  );
}

export function CodeUploadForm({
  offerId,
  pool,
}: {
  offerId: string;
  pool: { remaining: number; total: number };
}) {
  const [state, formAction, pending] = useActionState(uploadCodes, INITIAL);

  return (
    <form action={formAction} className={styles.poolForm}>
      <input type="hidden" name="offerId" value={offerId} />

      <div className={styles.pool}>
        <span className={styles.poolCount}>
          {pool.remaining}
          <i>/{pool.total}</i>
        </span>
        <span className={styles.poolBar}>
          <i
            style={{
              width: pool.total
                ? `${Math.round((pool.remaining / pool.total) * 100)}%`
                : "0%",
            }}
          />
        </span>
        <span className={styles.poolNote}>
          소비 {pool.total - pool.remaining}
        </span>
      </div>

      <Feedback state={state} />

      <label className={styles.field}>
        <span>
          코드 붙여넣기 <small>줄바꿈이나 쉼표로 구분. 중복은 건너뜁니다</small>
        </span>
        <textarea name="codes" className={styles.input} rows={3} required />
      </label>
      <label className={styles.field}>
        <span>
          사유 <small>{REASON_MIN}자 이상</small>
        </span>
        <input name="reason" className={styles.input} required />
      </label>

      <Button type="submit" variant="soft" size="sm" disabled={pending}>
        {pending ? "올리는 중…" : "코드 올리기"}
      </Button>
      <p className={styles.hint}>
        코드는 스폰서가 만들어 준 것만 올립니다. 우리가 만들지 않습니다.
      </p>
    </form>
  );
}

export function ManualDeliverForm({
  offerId,
  entryId,
  teamName,
}: {
  offerId: string;
  entryId: string;
  teamName: string;
}) {
  const [state, formAction, pending] = useActionState(deliverManually, INITIAL);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        className={styles.rowAction}
        onClick={() => setOpen(true)}
      >
        수동 발급
      </button>
    );
  }

  return (
    <form action={formAction} className={styles.rowForm}>
      <input type="hidden" name="offerId" value={offerId} />
      <input type="hidden" name="entryId" value={entryId} />
      <input
        name="reason"
        className={styles.input}
        placeholder={`${teamName}에 보낸 사유`}
        required
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "처리 중…" : "발급 완료"}
      </Button>
      <button
        type="button"
        className={styles.rowAction}
        onClick={() => setOpen(false)}
      >
        취소
      </button>
      <Feedback state={state} />
    </form>
  );
}
