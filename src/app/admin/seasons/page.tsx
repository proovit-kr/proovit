import type { Metadata } from "next";

import { Badge, type BadgeTone } from "@/components/Badge";
import { Field } from "@/components/Field";
import { SeasonPhase, StageKey } from "@/generated/prisma/enums";
import { guardPage } from "@/lib/access";
import { kstInputValue } from "@/lib/admin";
import { loadAdminSeason } from "@/lib/admin-read";
import { devNow } from "@/lib/dev-clock";
import { parseFeatureFlags } from "@/lib/feature-flags";
import { fmtMD, fmtStamp, fmtYMD } from "@/lib/header-state";
import {
  PHASE_SKIP_NOTE,
  SCHEDULE_PHASES,
  kickoffMismatch,
  phaseAtLeast,
} from "@/lib/season-phase";

import hub from "../../dashboard/hub.module.css";
import c from "../console.module.css";
import { SeasonPanel, type ScheduleRow } from "./SeasonPanel";
import styles from "./seasons.module.css";

/*
  시즌 관리 — 시안 `#scr-adm-seasons`(3003행).

  헤더의 시즌 셀렉트가 고른 시즌 하나를 본다. 스테이지 일정·트랙·기능 플래그를
  여기서 고치고, 고칠 때마다 사유 모달(`#mdl-reason`)을 거친다.

  ⚠️ 페이즈 전환의 정본은 크론이다(ADR-010). 시안에는 전환 칸이 없는데, 크론이
  멈췄을 때 앞당기거나 되돌릴 길이 없으면 DB를 직접 고치게 된다 — 그래서 맨 아래에
  「페이즈 수동 전환」 한 칸을 남겼다(내가 정함, 수연 확인 대기).

  그 위의 「페이즈 일정」도 시안에 없는 칸이다. 크론(`/api/v1/cron/phase`)은
  `season_schedules`만 읽는데 그 행을 넣을 화면이 없어 SQL로만 넣을 수 있었다
  (2026-09-25 수연 지시로 크론을 만들며 더함). 페이즈 다섯 줄에 KST 시각 하나씩.
  racing 줄이 개막이다 — 저장하면 `seasons.starts_at`도 같이 옮기고, s1 시작과
  어긋나면 그 아래에 경고 한 줄을 띄운다(2026-09-26 수연 결정, 기획 문서 순서).
*/

/** 「2026-10-12」 — 시작일이라 자정을 전날로 옮기지 않는다(fmtYMD는 마감용) */
const YMD = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });

export const metadata: Metadata = {
  title: "시즌 관리",
  robots: { index: false, follow: false },
};

/* 페이즈 배지 색 — 시안은 racing(라임)만 그렸다. 나머지는 내가 정함(수연 확인 대기) */
const PHASE_TONE: Record<string, BadgeTone> = {
  draft: "gray",
  pre_apply: "blue",
  recruiting: "blue",
  racing: "lime",
  awarded: "violet",
  archived: "gray",
};

/*
  scoring_config를 시안 `.pre`처럼 적는다 — 최상위 키마다 한 줄, 배열·객체 값은
  한 줄에 붙인다. `JSON.stringify(v, null, 2)`는 배열을 여러 줄로 펼친다.
*/
function prettyConfig(cfg: unknown): string {
  const inline = (v: unknown): string =>
    Array.isArray(v)
      ? `[${v.map(inline).join(", ")}]`
      : v && typeof v === "object"
        ? `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(", ")} }`
        : JSON.stringify(v);
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return inline(cfg ?? {});
  const entries = Object.entries(cfg);
  if (entries.length === 0) return "{}";
  return `{\n${entries.map(([k, v]) => `  ${JSON.stringify(k)}: ${inline(v)}`).join(",\n")}\n}`;
}

/** 마감 표기 — 자정 마감(다음 날 00:00)은 전날로 적는다(fmtMDHM과 같은 규칙) */
function closeMD(d: Date): string {
  return fmtMD(new Date(d.getTime() - 60_000));
}

export default async function Page() {
  const { viewer } = await guardPage("adminSeasons", "/admin/seasons");
  const season = viewer.season ? await loadAdminSeason(viewer.season.id) : null;

  if (!season) {
    return (
      <>
        <h2 className={hub.h1}>시즌 관리</h2>
        <p className={hub.sub}>시즌 없음. 시드(npm run db:seed)로 시즌 1을 만들 수 있음.</p>
      </>
    );
  }

  const flags = parseFeatureFlags(season.featureFlags);

  /*
    줄 상태. 「지연」은 크론과 같은 「지금」으로 가르고, **크론이 넘길 행에만**
    붙인다 — 시즌이 이미 그 페이즈이거나 지났으면 크론은 건너뛰기만 하므로
    경고할 일이 아니다(「이미 넘어감」). 크론이 건너뛴 행(`PHASE_SKIP_NOTE`)도
    같은 뜻이라 같게 적는다.
  */
  const now = devNow();
  const schedule: ScheduleRow[] = SCHEDULE_PHASES.map((phase) => {
    const row = season.schedules.find((s) => s.phase === phase);
    if (!row) return { phase, at: "", state: "empty" };
    const at = kstInputValue(row.startsAt);
    if (row.appliedAt) {
      return row.note === PHASE_SKIP_NOTE
        ? { phase, at, state: "skipped" }
        : { phase, at, state: "applied", stamp: fmtStamp(row.appliedAt) };
    }
    if (phaseAtLeast(season.phase, phase)) return { phase, at, state: "reached" };
    return { phase, at, state: row.startsAt <= now ? "late" : "pending" };
  });

  /*
    개막(레이스 시작)과 s1 시작은 같은 순간이다(2026-09-26 수연 결정, 기획 문서
    순서). 두 값을 다른 칸(페이즈 일정·스테이지 일정)이 받으니 어긋나면 페이즈
    일정 아래에 한 줄로 알린다. 저장은 막지 않는다(season-phase `kickoffMismatch`).
  */
  const racingAt =
    season.schedules.find((s) => s.phase === SeasonPhase.racing)?.startsAt ?? null;
  const s1Opens = season.stages.find((st) => st.stageKey === StageKey.s1)?.opensAt ?? null;
  /*
    시즌 시작일(헤더·랜딩의 「개막」)도 같은 순간이어야 한다. racing 행을 저장하면
    맞춰지지만, 옛 전제로 들어간 값이나 SQL로 넣은 값은 다시 저장하기 전까지 어긋난
    채 남는다 — 그것도 같은 줄로 알린다.
  */
  const kickoffWarning =
    racingAt && s1Opens && kickoffMismatch({ racing: racingAt, s1Opens })
      ? `개막(레이스 시작)과 s1 시작이 다름, 레이스 ${fmtStamp(racingAt)}, s1 ${fmtStamp(s1Opens)}`
      : racingAt && season.startsAt && kickoffMismatch({ racing: racingAt, s1Opens: season.startsAt })
        ? `시즌 시작일과 개막(레이스 시작)이 다름, 시즌 ${fmtStamp(season.startsAt)}, 레이스 ${fmtStamp(racingAt)}`
        : null;

  return (
    <>
      <h2 className={hub.h1}>시즌 관리</h2>
      <p className={hub.sub}>시즌, 스테이지, 트랙 시딩 및 설정</p>

      <Field label="시즌">
        <div className={hub.keybox} style={{ flexWrap: "nowrap" }} data-probe="season-box">
          {season.title} <Badge tone={PHASE_TONE[season.phase] ?? "gray"}>{season.phase}</Badge>
          {season.startsAt && season.endsAt ? (
            <span className={`${styles.cp} mono`} style={{ fontSize: "11.5px", color: "var(--faint)" }}>
              {`${YMD.format(season.startsAt)} → ${fmtYMD(season.endsAt).slice(5)}`}
            </span>
          ) : null}
        </div>
      </Field>

      <SeasonPanel
        seasonId={season.id}
        phase={season.phase}
        stages={season.stages.map((st) => ({
          stageKey: st.stageKey,
          isGate: st.isGate,
          opens: st.opensAt ? fmtMD(st.opensAt) : "",
          closes: st.closesAt ? closeMD(st.closesAt) : "",
        }))}
        tracks={season.tracks}
        schedule={schedule}
        kickoffWarning={kickoffWarning}
        flags={{
          leaderboard: flags.leaderboard,
          testerAssignments: flags.testerAssignments,
          credits: flags.credits,
        }}
        config={<div className={c.pre}>{prettyConfig(season.scoringConfig)}</div>}
      />
    </>
  );
}
