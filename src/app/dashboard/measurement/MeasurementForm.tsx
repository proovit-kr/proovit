"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/Button";
import {
  BLOCKED_ORIGIN_HOSTS,
  LABEL_MAX,
  ROOT_DOMAIN,
  blockedOrigin,
} from "@/lib/measurement";

import { saveMeasurement, type MeasurementState } from "./actions";

import fieldStyles from "@/components/ProfileFields.module.css";
import styles from "./measurement.module.css";

/*
  측정 주소 등록 폼.

  ⚠️ 막힌 배포처(Vercel·GitHub Pages)는 **타이핑하는 동안 알려준다.** 제출하고
  나서야 알리면 이미 그 주소로 배포를 끝낸 뒤다 — 그때 옮기라고 하면 하루가 날아간다.
  진짜 차단은 서버가 다시 한다(measurement.ts 스키마).
*/

const INITIAL: MeasurementState = {};

export function MeasurementForm({
  defaults,
  locked,
  canWrite,
}: {
  defaults: { label: string; originUrl: string };
  locked: boolean;
  canWrite: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveMeasurement, INITIAL);
  const [origin, setOrigin] = useState(defaults.originUrl);

  const blocked = blockedOrigin(origin);
  const disabled = !canWrite || locked;

  return (
    <form action={formAction} className={styles.form} noValidate>
      {state.message ? (
        <p className={styles.formError} role="alert">
          {state.message}
        </p>
      ) : null}
      {state.done ? (
        <p className={styles.saved} role="status">
          등록했습니다. 소유 확인이 끝나면 집계가 시작됩니다.
        </p>
      ) : null}

      <div className={fieldStyles.field}>
        <label className={fieldStyles.label} htmlFor="label">
          측정 주소
        </label>
        <p className={fieldStyles.hint}>
          <span>
            참가작은 이 주소로 서비스합니다. 결제·소셜 로그인 복귀 주소도 이
            주소여야 지표가 잡힙니다.
          </span>
          <span>소유 확인이 끝나면 바꿀 수 없습니다.</span>
        </p>
        <div className={styles.hostRow}>
          <input
            className="input"
            id="label"
            name="label"
            maxLength={LABEL_MAX}
            placeholder="팀이름"
            defaultValue={state.values?.label ?? defaults.label}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
          />
          <span className={styles.rootDomain}>.{ROOT_DOMAIN}</span>
        </div>
        {state.errors?.label ? (
          <p className={fieldStyles.fieldError}>{state.errors.label}</p>
        ) : null}
      </div>

      <div className={fieldStyles.field}>
        <label className={fieldStyles.label} htmlFor="originUrl">
          실제 배포 주소
        </label>
        <p className={fieldStyles.hint}>
          <span>
            빌더에서 배포한 주소입니다. 위 주소로 들어온 방문을 여기로 넘겨
            보여줍니다.
          </span>
        </p>
        <input
          className="input"
          id="originUrl"
          name="originUrl"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={origin}
          onChange={(event) => setOrigin(event.target.value)}
          disabled={disabled}
          autoComplete="off"
        />
        {blocked ? (
          <p className={fieldStyles.fieldError}>
            {blocked}는 약관에서 상업적 사용을 금지합니다. 결제를 붙이는 순간
            위반이 되고, 계정이 막히면 그동안의 지표가 사라집니다. 다른 배포처를
            써 주세요.
          </p>
        ) : state.errors?.originUrl ? (
          <p className={fieldStyles.fieldError}>{state.errors.originUrl}</p>
        ) : null}
      </div>

      {/* 무엇이 막혀 있는지 미리 밝힌다 — 배포를 시작하기 전에 알아야 의미가 있다 */}
      <p className={styles.note}>
        쓸 수 없는 배포처:{" "}
        {BLOCKED_ORIGIN_HOSTS.map((host) => host.label).join(" · ")}
      </p>

      {canWrite && !locked ? (
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={pending || blocked !== null}
        >
          {pending ? "등록 중…" : "등록하기"}
        </Button>
      ) : null}
    </form>
  );
}
