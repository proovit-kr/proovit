"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/Button";
import { Field, Input, Select, Textarea } from "@/components/Field";
import { Modal } from "@/components/Modal";
import { Chip } from "@/components/Surface";
import { inStageTarget, STAGE_TARGET_LABEL, type StageTarget } from "@/lib/notify";

import c from "../console.module.css";
import { postNotice, type NoticeState } from "./actions";

/*
  공지 폼 — 시안 제목·본문 칸, 필터 줄(대상·채널·예상 대상), 「발송」, `#mdl-send`,
  그리고 발송 이력 표.

  「예상 대상」은 화면이 센다 — 서버가 준 팀 목록(진도·상태·트랙·인원)을 필터에
  걸어 「7팀, 12명」을 만든다. 발송할 때 서버가 같은 규칙(`inStageTarget`)으로 다시 센다.
*/

type Team = { stage: string; active: boolean; trackId: string | null; people: number };

const INITIAL: NoticeState = {};

const STAGES = Object.keys(STAGE_TARGET_LABEL) as StageTarget[];

export function NoticePanel({
  teams,
  tracks,
  sent,
}: {
  teams: Team[];
  tracks: { id: string; name: string }[];
  sent: { id: string; title: string; sentAt: string; target: string; channels: string }[];
}) {
  const [state, action, pending] = useActionState(postNotice, INITIAL);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [stage, setStage] = useState<StageTarget>("all");
  const [track, setTrack] = useState("all");
  const [inapp, setInapp] = useState(true);
  const [mail, setMail] = useState(true);

  /* 보냈으면 모달을 닫고 칸을 비운다 — 렌더 중에 견준다 */
  const [seen, setSeen] = useState(state.done);
  if (seen !== state.done) {
    setSeen(state.done);
    setOpen(false);
    setTitle("");
    setBody("");
  }

  const picked = teams.filter(
    (t) =>
      inStageTarget(stage, t.stage, t.active) &&
      (track === "all" || (track === "none" ? t.trackId === null : t.trackId === track)),
  );
  const people = picked.reduce((n, t) => n + t.people, 0);
  const target = `${picked.length}팀, ${people}명`;
  const channels = [inapp ? "인앱" : null, mail ? "메일" : null].filter(Boolean).join(", ");

  return (
    <>
      <Field label="제목" htmlFor="notice-title">
        <Input id="notice-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="본문" htmlFor="notice-body">
        <Textarea id="notice-body" value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>

      <div className={c.fbar} data-probe="fbar">
        <Select
          className={c.fbarSel}
          aria-label="대상 스테이지"
          value={stage}
          onChange={(e) => setStage(e.target.value as StageTarget)}
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_TARGET_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select className={c.fbarSel} aria-label="대상 트랙" value={track} onChange={(e) => setTrack(e.target.value)}>
          <option value="all">track, 전체</option>
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>
              track, {t.name}
            </option>
          ))}
        </Select>
        <label style={LABEL}>
          <input type="checkbox" checked={inapp} onChange={(e) => setInapp(e.target.checked)} style={CHECK} />
          인앱
        </label>
        <label style={LABEL}>
          <input type="checkbox" checked={mail} onChange={(e) => setMail(e.target.checked)} style={CHECK} />
          메일
        </label>
        <Chip style={{ marginLeft: "auto" }}>
          예상 대상{" "}
          <b className="mono" style={{ color: "var(--text)" }}>
            {target}
          </b>
        </Chip>
      </div>

      <Button
        type="button"
        variant="primary"
        style={{ marginBottom: "26px" }}
        onClick={() => setOpen(true)}
      >
        발송
      </Button>
      {/* 보낸 뒤에 남은 말(메일 일부 실패) — 모달이 닫혀 여기 적는다 */}
      {!open && state.message ? (
        <p role="status" style={{ margin: "-16px 0 22px", fontSize: "13px", color: "var(--warn)" }}>
          {state.message}
        </p>
      ) : null}

      <Field label="발송 이력">
        <table className={c.atbl} data-probe="notices">
          <thead>
            <tr>
              <th>일시</th>
              <th>제목</th>
              <th>대상</th>
              <th>채널</th>
            </tr>
          </thead>
          <tbody>
            {sent.map((s) => (
              <tr key={s.id}>
                <td className={c.num}>{s.sentAt}</td>
                <td>{s.title}</td>
                <td className={c.num}>{s.target}</td>
                <td>{s.channels}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Field>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="공지를 발송할까요?"
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
              취소
            </Button>
            <form action={action}>
              <input type="hidden" name="title" value={title} />
              <input type="hidden" name="body" value={body} />
              <input type="hidden" name="stage" value={stage} />
              <input type="hidden" name="track" value={track} />
              <input type="hidden" name="inapp" value={inapp ? "1" : "0"} />
              <input type="hidden" name="mail" value={mail ? "1" : "0"} />
              <Button variant="primary" type="submit" disabled={pending || people === 0 || !channels}>
                발송
              </Button>
            </form>
          </>
        }
      >
        <p>
          대상{" "}
          <b className="mono" style={{ color: "var(--text)" }}>
            {target}
          </b>
          , 채널 {channels || "없음"}. 발송 후 회수할 수 없어요.
        </p>
        {state.message ? (
          <p role="alert" style={{ marginTop: "10px", fontSize: "13px", color: "var(--danger)" }}>
            {state.message}
          </p>
        ) : null}
      </Modal>
    </>
  );
}

/* 시안 인라인 style 그대로 */
const LABEL = {
  display: "flex",
  alignItems: "center",
  gap: "7px",
  fontSize: "13px",
  color: "var(--muted)",
} as const;
const CHECK = { accentColor: "var(--accent)" } as const;
