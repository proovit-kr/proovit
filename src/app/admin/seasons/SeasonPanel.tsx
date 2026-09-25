"use client";

import { useActionState, useState, type ReactNode } from "react";

import { Badge, type BadgeTone } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Clauses } from "@/components/Clauses";
import { Field, Input, Select, SwitchRow } from "@/components/Field";
import { Card, Chip } from "@/components/Surface";
import { SeasonPhase } from "@/generated/prisma/enums";
import { SEASON_STAGE_DETAIL } from "@/content/landing";

import hub from "../../dashboard/hub.module.css";
import { ReasonModal } from "../ReasonModal";
import { saveSeason, type SeasonActionState } from "./actions";
import styles from "./seasons.module.css";

/*
  시즌 관리의 쓰기 칸 — 스테이지 일정·트랙·기능 플래그(·페이즈 일정·수동 전환).

  시안에는 저장 버튼이 없다. 칸을 고치거나 스위치를 누르면 사유 모달이 떠야
  하는 자리라, 여기서 정한 것(내가 정함, 수연 확인 대기):
    · 날짜 칸은 고치면 카드 아래에 「일정 저장」이 나타나고 누르면 사유 모달
    · 스위치는 누르면 바로 사유 모달 — 저장되기 전까지 스위치는 그대로
    · 「+ 트랙 추가」는 사유 모달에 이름 칸을 하나 더 얹는다
    · 페이즈 일정도 날짜 칸과 같다 — 고치면 「전환 일정 저장」이 나타난다
*/

type Stage = { stageKey: string; isGate: boolean; opens: string; closes: string };
type Flags = { leaderboard: boolean; testerAssignments: boolean; credits: boolean };

/**
 * 페이즈 일정 한 줄 — 서버(page.tsx)가 저장된 상태로 만들어 넘긴다.
 *   applied  전환됨(크론 또는 수동)
 *   skipped  크론이 건너뜀 — 시즌이 이미 그 페이즈이거나 지나 있었다. 잠김
 *   reached  아직 처리 전이지만 시즌이 이미 그 페이즈이거나 지났다 — 크론이 건너뛸 행
 *   late     크론이 넘길 행인데 시각이 지났다 — 크론이 안 돌고 있다는 신호
 *   pending  예정                     empty    행 없음
 */
export type ScheduleRow = {
  phase: string;
  /** `<input type="datetime-local">` 값(KST). 비었으면 "" */
  at: string;
  state: "applied" | "skipped" | "reached" | "late" | "pending" | "empty";
  /** 전환 시각 「09.28 00:00」 */
  stamp?: string;
};

/*
  페이즈 일정의 줄 이름 — 운영 화면이라 명사형. 줄마다 **그 페이즈가 시작되는
  시각**이다. racing 행은 개막이고 레이스 시작이며 s1 시작이다(2026-09-26 수연
  결정, 기획 문서 순서 — admin-store `setPhaseSchedule` 주석). 저장하면 개막
  (`seasons.starts_at`)도 같이 옮겨지고, 랜딩·운영 헤더는 그 1분 전을 참가 신청
  마감으로 적는다 — 9/27 23:59 마감이면 9/28 00:00을 넣는다.
    → 2026-09-26 뒤집음: 「레이스 시작(모집 마감 다음 분)」이라 부르고 개막과는
    다른 날이라고 적었었다. 시안 날짜(참가 신청 마감 = s1 마감일)를 따른 것이었다.
  줄 이름은 내가 정함(수연 확인 대기).
*/
const SCHEDULE_NAME: Record<string, string> = {
  pre_apply: "사전 신청 시작",
  recruiting: "참가 모집 시작",
  racing: "개막(레이스·s1 시작)",
  awarded: "시상 발표",
  archived: "아카이브",
};

/* 상태 배지 — 시안에 없는 칸이라 색은 배지 역할표(Badge.module.css)대로 골랐다(내가 정함, 수연 확인 대기) */
const SCHEDULE_STATE: Record<
  ScheduleRow["state"],
  { label: string; tone: BadgeTone; dashed?: boolean; title?: string }
> = {
  applied: { label: "전환됨", tone: "lime" },
  skipped: { label: "이미 넘어감", tone: "gray", title: "시즌이 이미 이 페이즈이거나 지나 있어 크론이 넘기지 않음" },
  reached: { label: "이미 넘어감", tone: "gray", title: "시즌이 이미 이 페이즈이거나 지나 있어 크론이 넘기지 않음" },
  late: { label: "지연", tone: "warn", title: "예정 시각 지남, 크론 확인 필요(크론은 운영 배포에서만 돎)" },
  pending: { label: "예정", tone: "blue" },
  empty: { label: "비어 있음", tone: "gray", dashed: true },
};

/* 시안 3031행의 세 줄 — 제목과 부연을 그대로 */
const FLAG_ROWS: { key: keyof Flags; title: string; desc?: string }[] = [
  { key: "leaderboard", title: "공개 리더보드" },
  { key: "testerAssignments", title: "상호 테스터", desc: "시즌2+ 이관" },
  {
    key: "credits",
    title: "크레딧 센터",
    desc: "13 설계서 v0.1, 9/14 go/no-go 후 ON, OFF면 폴백 카드만",
  },
];

/* 게이트 번호 — s2가 1, s5가 2 */
const GATE_NO: Record<string, number> = { s2: 1, s5: 2 };

const INITIAL: SeasonActionState = {};

export function SeasonPanel({
  seasonId,
  phase,
  stages,
  tracks,
  schedule,
  kickoffWarning,
  flags,
  config,
}: {
  seasonId: string;
  phase: string;
  stages: Stage[];
  tracks: { id: string; name: string }[];
  schedule: ScheduleRow[];
  /** 개막(레이스 시작)과 s1 시작이 어긋났을 때의 경고 한 줄(page.tsx). 맞으면 null */
  kickoffWarning: string | null;
  flags: Flags;
  config: ReactNode;
}) {
  const [state, action, pending] = useActionState(saveSeason, INITIAL);
  const [modal, setModal] = useState<Record<string, string> | null>(null);
  const [dates, setDates] = useState(stages);
  const [times, setTimes] = useState(() => schedule.map((r) => r.at));
  const [nextPhase, setNextPhase] = useState(phase);

  /*
    저장되면 모달을 닫고, 서버가 다시 그린 일정으로 칸을 되맞춘다. 이펙트가 아니라
    렌더 중에 앞 값과 견줘 맞춘다(React 「props가 바뀔 때 state 맞추기」).
  */
  const [seen, setSeen] = useState({ done: state.done, stages, schedule });
  if (seen.done !== state.done || seen.stages !== stages || seen.schedule !== schedule) {
    setSeen({ done: state.done, stages, schedule });
    if (seen.done !== state.done) setModal(null);
    if (seen.stages !== stages) setDates(stages);
    if (seen.schedule !== schedule) setTimes(schedule.map((r) => r.at));
  }

  /* 전환됐거나 건너뛴 행은 읽기 전용 — 서버도 못 바꾸게 막는다 */
  const locked = (r: ScheduleRow) => r.state === "applied" || r.state === "skipped";
  const scheduleDirty = times.some((t, i) => t !== schedule[i]?.at);
  const editTime = (i: number, v: string) =>
    setTimes((prev) => prev.map((t, j) => (j === i ? v : t)));

  const dirty = dates.some(
    (d, i) => d.opens !== stages[i]?.opens || d.closes !== stages[i]?.closes,
  );
  const edit = (i: number, k: "opens" | "closes", v: string) =>
    setDates((prev) => prev.map((d, j) => (j === i ? { ...d, [k]: v } : d)));

  return (
    <>
      <Field label="스테이지 일정" note="게이트는 s2, s5 고정">
        <Card style={{ padding: "8px 18px" }} data-probe="stages">
          {dates.map((st, i) => (
            <div key={st.stageKey} className={styles.stgrow}>
              <span className={styles.k}>{st.stageKey}</span>
              <span>{SEASON_STAGE_DETAIL[st.stageKey]?.name ?? st.stageKey}</span>
              <Input
                mono
                className={styles.inp}
                value={st.opens}
                placeholder="MM.DD"
                aria-label={`${st.stageKey} 시작`}
                onChange={(e) => edit(i, "opens", e.target.value)}
              />
              <Input
                mono
                className={styles.inp}
                value={st.closes}
                placeholder="MM.DD"
                aria-label={`${st.stageKey} 마감`}
                onChange={(e) => edit(i, "closes", e.target.value)}
              />
              {st.isGate && GATE_NO[st.stageKey] ? (
                <span className={styles.gateChip}>GATE {GATE_NO[st.stageKey]}</span>
              ) : st.stageKey === "s4" ? (
                <Chip>주간</Chip>
              ) : (
                <span />
              )}
            </div>
          ))}
        </Card>
        {dirty ? (
          <div className={styles.saveRow}>
            <Button type="button" variant="ghost" onClick={() => setDates(stages)}>
              되돌리기
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() =>
                setModal({
                  op: "stages",
                  stages: JSON.stringify(
                    dates.map(({ stageKey, opens, closes }) => ({ stageKey, opens, closes })),
                  ),
                })
              }
            >
              일정 저장
            </Button>
          </div>
        ) : null}
      </Field>

      <Field label="트랙">
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }} data-probe="tracks">
          {/*
            트랙 행이 없으면 시즌 1의 단일 트랙 「자유 주제」다(schema Track 주석 —
            단일 트랙이라 entries.trackId를 비워 둔다). 시안의 「테마 트랙 비활성」은
            목업이다. 트랙에 활성 여부 칸이 없어서 있는 트랙은 전부 활성으로 적는다.
          */}
          {(tracks.length ? tracks : [{ id: "free", name: "자유 주제" }]).map((t) => (
            <span key={t.id} className={hub.keybox} style={{ padding: "10px 14px", flexWrap: "nowrap" }}>
              {t.name} <Badge tone="lime">활성</Badge>
            </span>
          ))}
          <Button
            type="button"
            variant="ghost"
            style={{ fontSize: "13px" }}
            onClick={() => setModal({ op: "track" })}
          >
            + 트랙 추가
          </Button>
        </div>
      </Field>

      <Field label="scoring_config">{config}</Field>

      <Field label="feature_flags">
        <div data-probe="flags">
          {FLAG_ROWS.map((row, i) => (
            <SwitchRow
              key={row.key}
              title={row.title}
              desc={row.desc}
              rowProps={i < FLAG_ROWS.length - 1 ? { style: { marginBottom: "10px" } } : undefined}
              checked={flags[row.key]}
              onChange={() => setModal({ op: "flag", key: row.key, on: flags[row.key] ? "0" : "1" })}
            />
          ))}
        </div>
      </Field>

      {/* 시안에 없는 칸 — page.tsx 머리 주석 */}
      <Field label="페이즈 일정" note="15분 단위로 크론이 전환">
        <Card style={{ padding: "8px 18px" }} data-probe="schedule">
          {schedule.map((row, i) => {
            const st = SCHEDULE_STATE[row.state];
            return (
              <div key={row.phase} className={styles.schrow}>
                <span className={`${styles.k} ${styles.schKey}`}>{row.phase}</span>
                <span className={styles.schName}>{SCHEDULE_NAME[row.phase] ?? row.phase}</span>
                <Input
                  type="datetime-local"
                  className={styles.schAt}
                  value={times[i] ?? ""}
                  disabled={locked(row)}
                  aria-label={`${row.phase} 전환 시각`}
                  onChange={(e) => editTime(i, e.target.value)}
                />
                {!locked(row) && times[i] ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className={styles.clear}
                    aria-label={`${row.phase} 시각 비우기`}
                    onClick={() => editTime(i, "")}
                  >
                    비우기
                  </Button>
                ) : null}
                <Badge
                  tone={st.tone}
                  dashed={st.dashed}
                  className={styles.schState}
                  title={st.title}
                >
                  {row.stamp ? `${st.label} ${row.stamp}` : st.label}
                </Badge>
              </div>
            );
          })}
        </Card>
        {/* 저장은 막지 않고 알리기만 한다(season-phase `kickoffMismatch`) */}
        {kickoffWarning ? (
          <p role="status" className={styles.schWarn} data-probe="kickoff-warning">
            <Clauses text={kickoffWarning} />
          </p>
        ) : null}
        {scheduleDirty ? (
          <div className={styles.saveRow}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setTimes(schedule.map((r) => r.at))}
            >
              되돌리기
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() =>
                setModal({
                  op: "schedule",
                  schedule: JSON.stringify(
                    schedule
                      .map((r, i) => ({ row: r, at: times[i] ?? "" }))
                      .filter(({ row }) => !locked(row))
                      .map(({ row, at }) => ({ phase: row.phase, at })),
                  ),
                })
              }
            >
              전환 일정 저장
            </Button>
          </div>
        ) : null}
      </Field>

      {/* 시안에 없는 칸 — page.tsx 머리 주석 */}
      <Field label="페이즈 수동 전환" note="정본은 크론, 앞당기거나 되돌릴 때만">
        <div className={styles.phaseRow}>
          <Select
            className={styles.phaseSel}
            value={nextPhase}
            aria-label="바꿀 페이즈"
            onChange={(e) => setNextPhase(e.target.value)}
          >
            {Object.values(SeasonPhase).map((p) => (
              <option key={p} value={p}>
                {p}
                {p === phase ? " (지금)" : ""}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            variant="outline"
            disabled={nextPhase === phase}
            onClick={() => setModal({ op: "phase", phase: nextPhase })}
          >
            전환
          </Button>
        </div>
      </Field>

      <ReasonModal
        open={modal !== null}
        onClose={() => setModal(null)}
        action={action}
        pending={pending}
        message={state.message}
        fields={{ seasonId, ...(modal ?? {}) }}
        extra={
          modal?.op === "track" ? (
            <Input name="name" placeholder="트랙 이름" aria-label="트랙 이름" style={{ marginTop: "12px" }} />
          ) : null
        }
      />
    </>
  );
}
