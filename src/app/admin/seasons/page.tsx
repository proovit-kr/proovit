import type { Metadata } from "next";

import { Badge, type BadgeTone } from "@/components/Badge";
import { Field } from "@/components/Field";
import { guardPage } from "@/lib/access";
import { loadAdminSeason } from "@/lib/admin-read";
import { parseFeatureFlags } from "@/lib/feature-flags";
import { fmtMD, fmtYMD } from "@/lib/header-state";

import hub from "../../dashboard/hub.module.css";
import c from "../console.module.css";
import { SeasonPanel } from "./SeasonPanel";
import styles from "./seasons.module.css";

/*
  시즌 관리 — 시안 `#scr-adm-seasons`(3003행).

  헤더의 시즌 셀렉트가 고른 시즌 하나를 본다. 스테이지 일정·트랙·기능 플래그를
  여기서 고치고, 고칠 때마다 사유 모달(`#mdl-reason`)을 거친다.

  ⚠️ 페이즈 전환의 정본은 크론이다(ADR-010). 시안에는 전환 칸이 없는데, 크론이
  멈췄을 때 앞당기거나 되돌릴 길이 없으면 DB를 직접 고치게 된다 — 그래서 맨 아래에
  「페이즈 수동 전환」 한 칸을 남겼다(내가 정함, 수연 확인 대기).
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
