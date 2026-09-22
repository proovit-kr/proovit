"use client";

import { useActionState, useState } from "react";

import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Field, Input } from "@/components/Field";
import { Card } from "@/components/Surface";
import { Toast, useToast } from "@/components/Toast";
import {
  LABEL_MAX,
  ROOT_DOMAIN,
  blockedOrigin,
  type MeasurementState,
} from "@/lib/measurement";

import hub from "../hub.module.css";
import { manageMeasurement, type MeasurementActionState } from "./actions";

import styles from "./measurement.module.css";

/*
  측정 연동의 본문 — 시안 `#scr-measurement`의 `.db-body` 안, 머리 아래 전부.

  클라이언트 컴포넌트인 이유는 둘이다 — ① 팀 주소를 그 자리에서 복사해야 하고
  ② 등록·검증의 실패 문구를 폼 옆에 붙여야 한다.

  ⚠️ 여기서 버튼을 감추는 것은 **안내일 뿐 방어가 아니다.** 실제 차단은 서버
  액션이 `canAccess`를 다시 부르는 것으로 한다(actions.ts 머리 주석).

  시안과 일부러 다른 것 둘(내가 정함, 2026-09-22, 수연 확인 대기):
    · 행이 없으면 「등록 전」 판 — 팀 주소 라벨과 배포 주소를 받는다. 시안은
      발급 뒤부터 그리고 받는 자리가 없다.
    · ③ 실패에 「배포 주소」 칸 하나 — 시안 ③의 원인 문구가 「최종 배포 주소인지
      확인한 뒤 다시 검증해 보세요」라 고칠 자리가 있어야 한다. ①·②는 시안 그대로.
  대조 스크립트(`measurement.mjs`)는 두 자리를 재지 않는다.

  `data-probe`·`data-state`는 대조 스크립트가 지금 어느 판인지 읽는 표식이다.
*/

const INITIAL: MeasurementActionState = {};

/* 시안이 `.keybox .cp` 버튼에 인라인으로 주는 크기 */
const CP = { padding: "7px 14px", fontSize: "12.5px" } as const;

/* 시안 ②의 셋째 칸 — `.vstep.now`에 인라인으로 teal을 덮는다 */
const OK_STEP = { color: "var(--teal)" } as const;
const OK_DOT = {
  background: "var(--teal-dim)",
  borderColor: "rgba(69,214,190,.6)",
  color: "var(--teal)",
} as const;

const BADGE: Record<MeasurementState, { tone: "teal" | "gray" | "red"; text: string }> = {
  ok: { tone: "teal", text: "연동 확인됨, 집계가 시작됐어요" },
  wait: { tone: "gray", text: "확인 중, 최대 10분 걸려요" },
  fail: { tone: "red", text: "연결 실패" },
};

export function MeasurementPanel({
  hostname,
  originUrl,
  state: panel,
  canWrite,
}: {
  hostname: string | null;
  originUrl: string;
  /** 시안 ①②③. null이면 아직 등록 전 */
  state: MeasurementState | null;
  canWrite: boolean;
}) {
  const [state, formAction, pending] = useActionState(manageMeasurement, INITIAL);
  const [origin, setOrigin] = useState(originUrl);
  const { message: toast, show } = useToast();

  const blocked = blockedOrigin(origin);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      show("팀 주소를 복사했어요");
    } catch {
      /* 클립보드를 막아둔 브라우저도 있다. 주소는 화면에 그대로 있다 */
      show("복사하지 못했어요. 주소를 직접 옮겨 적어 주세요");
    }
  };

  const howto = (
    <Card className={styles.howto}>
      <b>연결 방법</b>
      <p>
        서비스를 배포한 뒤, 최종 배포 주소를 여기에 등록해 주세요. 프록시는
        프루빗이 세우고 참가자는 주소만 등록해요.
        <br />
        방문자는 팀 주소를 거쳐 서비스로 이동하고, 그 길목에서 지표가 자동으로
        세져요. DNS를 만질 일도, 따로 코드를 심을 일도 없어요.
        <br />
        Vercel과 GitHub Pages 주소는 약관상 상업 사용이 막혀 있어 등록이
        자동으로 거부돼요.
      </p>
    </Card>
  );

  const originField = (
    <Field
      label="배포 주소"
      htmlFor="originUrl"
      hint="빌더에서 발행한 최종 주소예요. 수정할 때마다 바뀌는 임시 주소가 아니어야 해요."
    >
      <Input
        mono
        id="originUrl"
        name="originUrl"
        type="url"
        inputMode="url"
        placeholder="https://"
        value={origin}
        onChange={(event) => setOrigin(event.target.value)}
        disabled={!canWrite || pending}
        autoComplete="off"
      />
      {blocked ? (
        <p className={styles.fieldError}>
          {blocked}는 약관에서 상업적 사용을 금지해요. 결제를 붙이는 순간 위반이
          되고, 계정이 막히면 그동안의 지표가 사라져요. 다른 배포처를 써 주세요.
        </p>
      ) : state.errors?.originUrl ? (
        <p className={styles.fieldError}>{state.errors.originUrl}</p>
      ) : null}
    </Field>
  );

  return (
    <form
      action={formAction}
      noValidate
      data-probe="measurement"
      data-state={panel ?? "none"}
    >
      {state.message ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : null}

      {panel === null || !hostname ? (
        /* ── 등록 전(시안에 없음) ───────────────────────── */
        <>
          <Field
            label="팀 주소"
            note={`뒤에 .${ROOT_DOMAIN}이 붙어요`}
            htmlFor="label"
            hint="영문 소문자·숫자·하이픈, 3~30자. 참가작은 이 주소로 공개되고, 검증이 끝나면 바꿀 수 없어요."
          >
            <Input
              mono
              id="label"
              name="label"
              maxLength={LABEL_MAX}
              placeholder="little-potion"
              defaultValue={state.values?.label ?? ""}
              disabled={!canWrite || pending}
              autoComplete="off"
              spellCheck={false}
            />
            {state.errors?.label ? (
              <p className={styles.fieldError}>{state.errors.label}</p>
            ) : null}
          </Field>
          {originField}
          {howto}
          {canWrite ? (
            <Button
              type="submit"
              name="op"
              value="register"
              variant="primary"
              disabled={pending || blocked !== null}
            >
              {pending ? "검증하는 중…" : "등록하고 검증하기"}
            </Button>
          ) : null}
        </>
      ) : (
        /* ── 시안 ①②③ ─────────────────────────────────── */
        <>
          <Field label="발급된 팀 주소">
            <div className={hub.keybox}>
              {hostname}
              <Button
                type="button"
                variant="outline"
                className={styles.cp}
                style={CP}
                onClick={() => void copy(hostname)}
              >
                복사
              </Button>
            </div>
          </Field>

          <div className={styles.vsteps}>
            <span className={`${styles.vstep} ${styles.done}`}>
              <span className={styles.dot}>✓</span>발급됨
            </span>
            <span className={styles.vsep} />
            {panel === "wait" ? (
              <span className={`${styles.vstep} ${styles.now}`}>
                <span className={styles.dot}>2</span>검증 대기
              </span>
            ) : (
              <span className={`${styles.vstep} ${styles.done}`}>
                <span className={styles.dot}>✓</span>검증 대기
              </span>
            )}
            <span className={styles.vsep} />
            {panel === "wait" ? (
              <span className={styles.vstep}>
                <span className={styles.dot}>3</span>검증됨
              </span>
            ) : panel === "ok" ? (
              <span className={`${styles.vstep} ${styles.now}`} style={OK_STEP}>
                <span className={styles.dot} style={OK_DOT}>
                  ✓
                </span>
                검증됨
              </span>
            ) : (
              <span className={`${styles.vstep} ${styles.fail}`}>
                <span className={styles.dot}>✕</span>실패
              </span>
            )}
          </div>

          <Badge tone={BADGE[panel].tone} className={styles.stateBadge}>
            {BADGE[panel].text}
          </Badge>

          {panel === "fail" ? (
            <Card className={styles.cause}>
              <b>원인, 등록한 배포 주소가 응답하지 않아요</b>
              <p>
                배포처에서 서비스가 발행(publish)된 상태인지, 등록한 주소가 수정할
                때마다 바뀌는 임시 주소가 아니라 최종 배포 주소인지 확인한 뒤 다시
                검증해 보세요. Lovable은 고친 뒤 발행 버튼을 다시 눌러야 반영돼요.
              </p>
            </Card>
          ) : null}

          {howto}

          {panel === "fail" && canWrite ? originField : null}

          {canWrite && panel === "wait" ? (
            <Button
              type="submit"
              name="op"
              value="verify"
              variant="primary"
              disabled={pending}
            >
              {pending ? "검증하는 중…" : "다시 검증하기"}
            </Button>
          ) : canWrite && panel === "fail" ? (
            <Button
              type="submit"
              name="op"
              value="verify"
              variant="outline"
              disabled={pending || blocked !== null}
            >
              {pending ? "검증하는 중…" : "다시 검증하기"}
            </Button>
          ) : null}
        </>
      )}

      <Toast message={toast} />
    </form>
  );
}
