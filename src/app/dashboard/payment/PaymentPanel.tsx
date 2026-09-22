"use client";

import { useActionState, useState } from "react";

import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Field, Input, Select } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/Surface";
import {
  INQUIRY_LEVELS,
  INQUIRY_URL_MAX,
  PROVIDERS,
  READONLY_KEY_MAX,
  formatSeoulShort,
  type PaymentPane,
} from "@/lib/payment";

import hub from "../hub.module.css";
import { managePayment, type PaymentActionState } from "./actions";

import styles from "./payment.module.css";

/*
  결제 연동의 본문 — 시안 `#scr-payment`의 `.pane` 셋. 머리 아래 전부.

  ⚠️ 여기서 버튼을 감추는 것은 **안내일 뿐 방어가 아니다.** 실제 차단은 서버
  액션이 `canAccess`를 다시 부르는 것으로 한다(actions.ts 머리 주석).

  시안과 일부러 다른 것(내가 정함, 2026-09-22, 수연 확인 대기):
    · ②의 「연동 테스트」는 키가 읽히는지 보고 누른 시각을 남긴다(payment-store.ts).
      「삭제」는 시안대로 두었지만 확인이 끝난 뒤에는 서버가 거부한다 — 비활성으로
      바꿀지는 수연 판단.
    · ②에서 키를 못 풀면(키 회전) 가린 키 대신 「다시 등록해 주세요」 — 시안에 없는 상태.
    · `pending` 판 — ②의 모양에 회색 「확인 대기」 배지.
    · ③에 「주소 저장하기」 버튼 — 시안 ③은 입력 칸만 있고 저장할 자리가 없다.
  대조 스크립트(`payment.mjs`)는 그 자리를 재지 않는다.

  `data-probe`·`data-state`는 대조 스크립트가 지금 어느 판인지 읽는 표식이다.
*/

const INITIAL: PaymentActionState = {};

/* 시안 ②가 `.keybox .cp` 버튼에 인라인으로 주는 크기 */
const TEST_BTN = { padding: "7px 14px", fontSize: "12.5px" } as const;
const DEL_BTN = {
  padding: "7px 10px",
  fontSize: "12.5px",
  color: "var(--danger)",
} as const;

/* 시안이 요약 값에 직접 주는 색 */
const ACCENT = { color: "var(--accent)" } as const;
const VIOLET = { color: "var(--violet)" } as const;

export function PaymentPanel({
  pane,
  provider,
  keyMasked,
  lastTestedAt,
  revenue,
  inquiryUrl,
  hostname,
  canWrite,
}: {
  pane: PaymentPane;
  provider: string;
  /** 가린 조회키. 등록됐는데 null이면 못 푼 것 — 다시 등록 */
  keyMasked: string | null;
  /** ISO. 아직 안 눌렀으면 null */
  lastTestedAt: string | null;
  revenue: { amount: number; count: number };
  inquiryUrl: string;
  /** 팀 주소. 없으면 ③에서 주소를 받을 수 없다 */
  hostname: string | null;
  canWrite: boolean;
}) {
  const [state, formAction, pending] = useActionState(managePayment, INITIAL);
  const [picked, setPicked] = useState(state.values?.provider || provider);

  const providerLabel =
    PROVIDERS.find((item) => item.value === provider)?.label ?? provider;

  const typeChip = (label: string) => (
    <span className={styles.pyType}>
      과금 유형 <b>{label}</b>
      <span className={styles.lk}>
        <Icon name="lock" /> s1 제출값
      </span>
    </span>
  );

  return (
    <form
      action={formAction}
      noValidate
      data-probe="payment"
      data-state={pane}
    >
      {state.message ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : state.notice ? (
        <p className={styles.notice} role="status">
          {state.notice}
        </p>
      ) : null}

      {pane === "inq" ? (
        /* ── ③ 문의형 ──────────────────────────────────── */
        <>
          {typeChip("문의형")}
          <div className={hub.infoStrip}>
            <Icon name="info" fixed /> 문의형은 결제 키를 등록하지 않아요. 매출
            대신 유효 문의, 상담, 서면 구매의향, 계약으로 수익화 단계를
            판정받아요.
          </div>
          <Card className={styles.levels}>
            {INQUIRY_LEVELS.map((level) => (
              <div key={level.k} className={styles.lv}>
                <span className={styles.k}>{level.k}</span>
                <span>{level.text}</span>
                <span className={styles.pt}>{level.pt}</span>
              </div>
            ))}
          </Card>
          <Field
            label="문의 수단 주소"
            note="팀명.proovit.kr 경로만 인정"
            htmlFor="inquiryUrl"
            hint="문의 도달 이벤트는 팀 주소 경유 접속으로 자동 기록돼요."
          >
            <Input
              mono
              id="inquiryUrl"
              name="inquiryUrl"
              type="url"
              inputMode="url"
              maxLength={INQUIRY_URL_MAX}
              placeholder={hostname ? `https://${hostname}/contact` : "https://"}
              defaultValue={state.values?.inquiryUrl || inquiryUrl}
              disabled={!canWrite || pending}
              autoComplete="off"
              spellCheck={false}
            />
            {state.errors?.inquiryUrl ? (
              <p className={styles.fieldError}>{state.errors.inquiryUrl}</p>
            ) : null}
          </Field>
          {canWrite ? (
            /* 시안에 없다 — 입력 칸만 있고 저장할 자리가 없어 하나 둔다 */
            <div className={styles.inqSave}>
              <Button
                type="submit"
                name="op"
                value="inquiry"
                variant="primary"
                disabled={pending}
              >
                {pending ? "저장하는 중…" : "주소 저장하기"}
              </Button>
            </div>
          ) : null}
          <Card className={hub.sum}>
            <div>
              <span>현재 단계</span>
              <b style={VIOLET}>
                {inquiryUrl ? "판정 전, s5 제출 뒤" : "문의 수단 등록 전"}
              </b>
            </div>
            <div>
              <span>증빙</span>
              <b>문의 수신 기록 원본 (폼 응답, 이메일), s5 제출 시</b>
            </div>
          </Card>
          <p className={styles.note}>
            유효 문의는 유효 결제자와 같은 원칙이에요. 팀 구성원과 직계 관련인의
            문의는 제외돼요. 유효 매출과 유료 전환율 축은 문의형도 대체되지
            않아요.
          </p>
        </>
      ) : pane === "none" ? (
        /* ── ① 결제형, 미등록 ─────────────────────────── */
        <>
          {typeChip("결제형")}
          <div className={hub.infoStrip}>
            <Icon name="info" fixed /> 조회 전용 키만 받아요, 결제를 대신 일으킬 수
            없는 키예요.
          </div>
          <Field label="결제사" htmlFor="provider">
            <Select
              id="provider"
              name="provider"
              value={picked}
              onChange={(event) => setPicked(event.target.value)}
              disabled={!canWrite || pending}
            >
              {PROVIDERS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="조회키"
            htmlFor="readonlyKey"
            hint="대시보드 → 개발자 센터에서 조회 전용 키를 발급받을 수 있어요."
          >
            {/* 비밀값이라 password — 실패해도 되돌려 채우지 않는다 */}
            <Input
              mono
              id="readonlyKey"
              name="readonlyKey"
              type="password"
              maxLength={READONLY_KEY_MAX}
              placeholder="sk_live_…"
              disabled={!canWrite || pending}
              autoComplete="off"
              spellCheck={false}
            />
            {state.errors?.readonlyKey ? (
              <p className={styles.fieldError}>{state.errors.readonlyKey}</p>
            ) : null}
          </Field>
          {canWrite ? (
            <Button
              type="submit"
              name="op"
              value="register"
              variant="primary"
              disabled={pending}
            >
              {pending ? "등록하는 중…" : "키 등록하기"}
            </Button>
          ) : null}
        </>
      ) : (
        /* ── ② 결제형, 등록됨(확인됨 · 확인 대기) ───────── */
        <>
          {typeChip("결제형")}
          <div className={hub.infoStrip}>
            <Icon name="info" fixed /> 조회 전용 키만 받아요, 결제를 대신 일으킬 수
            없는 키예요.
          </div>
          <Field
            label="등록된 키"
            note={providerLabel}
            hint={
              lastTestedAt
                ? `마지막 테스트 ${formatSeoulShort(new Date(lastTestedAt))}, ${pane === "ok" ? "성공" : "확인 전"}`
                : "아직 테스트하지 않았어요."
            }
          >
            <div className={hub.keybox}>
              {keyMasked ?? "읽을 수 없는 키예요. 삭제하고 다시 등록해 주세요."}
              {pane === "ok" ? (
                <Badge tone="teal">연동 확인됨 ✓</Badge>
              ) : (
                <Badge tone="gray">확인 대기</Badge>
              )}
              {canWrite ? (
                <span className={styles.cp}>
                  <Button
                    type="submit"
                    name="op"
                    value="test"
                    variant="outline"
                    style={TEST_BTN}
                    disabled={pending}
                  >
                    연동 테스트
                  </Button>
                  <Button
                    type="submit"
                    name="op"
                    value="delete"
                    variant="ghost"
                    style={DEL_BTN}
                    disabled={pending}
                  >
                    삭제
                  </Button>
                </span>
              ) : null}
            </div>
          </Field>
          <Card className={hub.sum}>
            <div>
              <span>집계된 매출</span>
              <b style={ACCENT}>₩{revenue.amount.toLocaleString("ko-KR")}</b>
            </div>
            <div>
              <span>결제 건수</span>
              <b>{revenue.count}건</b>
            </div>
          </Card>
        </>
      )}
    </form>
  );
}
