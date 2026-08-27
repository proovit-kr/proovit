"use client";

import { useState } from "react";

import {
  devImpersonate,
  devSetPhase,
  devSetStage,
  devSetStatus,
  devSignOut,
  devToggleFlag,
} from "@/app/actions/dev";

import styles from "./DevBar.module.css";

/*
  개발용 토글 바의 화면.

  ⚠️ 판정은 전부 서버에 있다(dev-sandbox.ts). 여기서 하는 일은 폼을 그리고
  서버 액션을 부르는 것뿐이라, 이 파일을 고쳐서 운영을 건드릴 수는 없다.

  버튼을 전부 `<form>`으로 두는 이유는 낙관적 갱신을 안 하기 위해서다 —
  DB가 바뀌고 페이지가 다시 그려진 뒤에 바가 갱신돼야 "바에 찍힌 값 = 화면이
  보고 있는 값"이 유지된다. 이 둘이 어긋나는 순간 도구가 함정이 된다.
*/

type Team = {
  entryId: string;
  userId: string;
  teamName: string;
  ideaTitle: string;
  stage: string;
  status: string;
  email: string;
};

type Option<T extends string> = { value: T; label: string };

type Props = {
  blocked?: string;
  me?: { nickname: string; onboarded: boolean } | null;
  teams?: Team[];
  current?: Team | null;
  season?: { id: string; slug: string; phase: string } | null;
  stages?: Option<string>[];
  statuses?: Option<string>[];
  phases?: Option<string>[];
  flags?: { key: string; label: string; on: boolean }[];
};

/*
  값 하나를 실어 보내는 버튼 한 개 = 폼 한 개.

  ⚠️ 액션 타입을 `(formData) => Promise<void>`로 **정확히** 적는다. 캐스팅으로
  얼버무리면 시그니처가 어긋나도 컴파일이 통과한다 — 처음에 (prev, formData)
  두 인자짜리를 그대로 걸었다가 버튼마다 formData가 undefined로 들어와 터졌다.
*/
function PickButton({
  action,
  fields,
  active,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <form action={action}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button
        type="submit"
        className={active ? styles.pickOn : styles.pick}
        aria-pressed={active}
      >
        {children}
      </button>
    </form>
  );
}

export function DevBarClient({
  blocked,
  me,
  teams = [],
  current,
  season,
  stages = [],
  statuses = [],
  phases = [],
  flags = [],
}: Props) {
  const [open, setOpen] = useState(false);

  if (blocked) {
    return (
      <div className={`${styles.bar} ${styles.blocked}`}>
        <span className={styles.tag}>DEV</span>
        <span className={styles.blockedText}>{blocked}</span>
      </div>
    );
  }

  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={styles.tag}>DEV</span>
        <span className={styles.who}>
          {me ? me.nickname : "비로그인"}
          {current ? ` · ${current.teamName}` : null}
        </span>
        <span className={styles.summary}>
          {current ? `${current.stage} / ${current.status}` : "참가 기록 없음"}
          {season ? ` · ${season.phase}` : null}
        </span>
        <span className={styles.caret} aria-hidden>
          {open ? "▾" : "▴"}
        </span>
      </button>

      {open ? (
        <div className={styles.panel}>
          {/* ── 누구로 볼까 ─────────────────────────────────── */}
          <div className={styles.row}>
            <span className={styles.label}>계정</span>
            <div className={styles.picks}>
              {teams.map((team) => (
                <PickButton
                  key={team.userId}
                  action={devImpersonate}
                  fields={{ userId: team.userId }}
                  active={current?.userId === team.userId}
                >
                  {team.teamName}
                  <em className={styles.sub}>{team.stage}</em>
                </PickButton>
              ))}
              <form action={devSignOut}>
                <button type="submit" className={styles.pickQuiet}>
                  로그아웃
                </button>
              </form>
            </div>
          </div>

          {/* ── 진도 ────────────────────────────────────────── */}
          <div className={styles.row}>
            <span className={styles.label}>
              진도
              <em className={styles.hint}>제출물도 같이 만들어요</em>
            </span>
            <div className={styles.picks}>
              {current ? (
                stages.map((stage) => (
                  <PickButton
                    key={stage.value}
                    action={devSetStage}
                    fields={{ entryId: current.entryId, stage: stage.value }}
                    active={current.stage === stage.value}
                  >
                    {stage.label}
                  </PickButton>
                ))
              ) : (
                <span className={styles.empty}>팀을 먼저 고르세요</span>
              )}
            </div>
          </div>

          {/* ── 생존 상태 ───────────────────────────────────── */}
          <div className={styles.row}>
            <span className={styles.label}>상태</span>
            <div className={styles.picks}>
              {current ? (
                statuses.map((status) => (
                  <PickButton
                    key={status.value}
                    action={devSetStatus}
                    fields={{ entryId: current.entryId, status: status.value }}
                    active={current.status === status.value}
                  >
                    {status.label}
                  </PickButton>
                ))
              ) : (
                <span className={styles.empty}>팀을 먼저 고르세요</span>
              )}
            </div>
          </div>

          {/* ── 시즌 페이즈 ─────────────────────────────────── */}
          <div className={styles.row}>
            <span className={styles.label}>페이즈</span>
            <div className={styles.picks}>
              {season ? (
                phases.map((phase) => (
                  <PickButton
                    key={phase.value}
                    action={devSetPhase}
                    fields={{ seasonId: season.id, phase: phase.value }}
                    active={season.phase === phase.value}
                  >
                    {phase.label}
                  </PickButton>
                ))
              ) : (
                <span className={styles.empty}>시즌이 없습니다</span>
              )}
            </div>
          </div>

          {/* ── 기능 플래그 ─────────────────────────────────── */}
          <div className={styles.row}>
            <span className={styles.label}>
              플래그
              <em className={styles.hint}>꺼진 화면은 404</em>
            </span>
            <div className={styles.picks}>
              {season ? (
                flags.map((flag) => (
                  <PickButton
                    key={flag.key}
                    action={devToggleFlag}
                    fields={{
                      seasonId: season.id,
                      flag: flag.key,
                      value: flag.on ? "0" : "1",
                    }}
                    active={flag.on}
                  >
                    {flag.label}
                  </PickButton>
                ))
              ) : (
                <span className={styles.empty}>시즌이 없습니다</span>
              )}
            </div>
          </div>

          <p className={styles.foot}>
            dev DB에만 붙습니다. 여기서 만든 제출물은 전부 「[개발용]」으로
            표시돼요.
          </p>
        </div>
      ) : null}
    </div>
  );
}
