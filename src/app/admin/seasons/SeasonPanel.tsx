"use client";

import { useActionState, useState, type ReactNode } from "react";

import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Field, Input, Select, SwitchRow } from "@/components/Field";
import { Card, Chip } from "@/components/Surface";
import { SeasonPhase } from "@/generated/prisma/enums";
import { SEASON_STAGE_DETAIL } from "@/content/landing";

import hub from "../../dashboard/hub.module.css";
import { ReasonModal } from "../ReasonModal";
import { saveSeason, type SeasonActionState } from "./actions";
import styles from "./seasons.module.css";

/*
  시즌 관리의 쓰기 칸 — 스테이지 일정·트랙·기능 플래그(·페이즈 수동 전환).

  시안에는 저장 버튼이 없다. 칸을 고치거나 스위치를 누르면 사유 모달이 떠야
  하는 자리라, 여기서 정한 것(내가 정함, 수연 확인 대기):
    · 날짜 칸은 고치면 카드 아래에 「일정 저장」이 나타나고 누르면 사유 모달
    · 스위치는 누르면 바로 사유 모달 — 저장되기 전까지 스위치는 그대로
    · 「+ 트랙 추가」는 사유 모달에 이름 칸을 하나 더 얹는다
*/

type Stage = { stageKey: string; isGate: boolean; opens: string; closes: string };
type Flags = { leaderboard: boolean; testerAssignments: boolean; credits: boolean };

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
  flags,
  config,
}: {
  seasonId: string;
  phase: string;
  stages: Stage[];
  tracks: { id: string; name: string }[];
  flags: Flags;
  config: ReactNode;
}) {
  const [state, action, pending] = useActionState(saveSeason, INITIAL);
  const [modal, setModal] = useState<Record<string, string> | null>(null);
  const [dates, setDates] = useState(stages);
  const [nextPhase, setNextPhase] = useState(phase);

  /*
    저장되면 모달을 닫고, 서버가 다시 그린 일정으로 칸을 되맞춘다. 이펙트가 아니라
    렌더 중에 앞 값과 견줘 맞춘다(React 「props가 바뀔 때 state 맞추기」).
  */
  const [seen, setSeen] = useState({ done: state.done, stages });
  if (seen.done !== state.done || seen.stages !== stages) {
    setSeen({ done: state.done, stages });
    if (seen.done !== state.done) setModal(null);
    if (seen.stages !== stages) setDates(stages);
  }

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
