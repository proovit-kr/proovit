import type { Metadata } from "next";

import { Badge, type BadgeTone } from "@/components/Badge";
import { EntryStage, EntryStatus } from "@/generated/prisma/enums";
import { guardPage } from "@/lib/access";
import { loadAdminEntries } from "@/lib/admin-read";
import { fmtMD } from "@/lib/header-state";

import hub from "../../dashboard/hub.module.css";
import c from "../console.module.css";
import { FilterBar } from "../FilterBar";
import { EntryActions } from "./EntryRow";

/*
  참가 관리 — 시안 `#scr-adm-entries`(3041행).

  실격·복구가 여기서 일어난다. 그래서 **한 줄에 판단 재료를 다 둔다** — 진도,
  생존 상태, 온보딩, 최근 제출. 화면을 옮겨 다니며 맞춰보게 하면 근거를 덜 보고
  누르게 된다.

  ⚠️ 실명은 읽지 않는다(admin-read.ts 머리 주석). 팀명까지다.
*/

export const metadata: Metadata = {
  title: "참가 관리",
  robots: { index: false, follow: false },
};

const STATUS_TONE: Record<string, BadgeTone> = {
  [EntryStatus.active]: "lime",
  [EntryStatus.eliminated]: "gray",
  [EntryStatus.disqualified]: "red",
  [EntryStatus.withdrawn]: "gray",
};

/*
  필터 선택지. 시안은 status에 `completed`를 적었는데 우리 상태에는 없고(완주는
  진도 `stage=completed`다) `withdrawn`(자진 포기)이 있다 — 스키마 값을 쓴다.
*/
const STAGES = Object.values(EntryStage);
const STATUSES = Object.values(EntryStatus);

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { viewer } = await guardPage("adminEntries", "/admin/entries");
  const sp = await searchParams;
  const rows = viewer.season
    ? await loadAdminEntries(viewer.season.id, {
        stage: sp.stage,
        status: sp.status,
        flag: sp.flag,
        q: sp.q,
      })
    : [];

  return (
    <>
      <h2 className={hub.h1}>참가 관리</h2>
      <p className={hub.sub}>엔트리 상태 전환, 상태 변경은 사유 필수, 감사 로그 기록</p>

      <FilterBar
        selects={[
          {
            name: "stage",
            label: "진도",
            options: [
              { value: "", label: "stage 전체" },
              ...STAGES.map((v) => ({ value: v, label: v })),
            ],
          },
          {
            name: "status",
            label: "상태",
            options: [
              { value: "", label: "status 전체" },
              ...STATUSES.map((v) => ({ value: v, label: v })),
            ],
          },
          {
            name: "flag",
            label: "플래그",
            options: [
              { value: "", label: "플래그 전체" },
              { value: "yes", label: "있음" },
              { value: "no", label: "없음" },
            ],
          },
        ]}
        search={{ name: "q", placeholder: "팀명 검색" }}
      />

      <table className={c.atbl} data-probe="entries">
        <thead>
          <tr>
            <th>TEAM</th>
            <th>TRACK</th>
            <th>STAGE</th>
            <th>STATUS</th>
            <th>온보딩</th>
            <th>최근 제출</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <b>{row.teamName}</b>
                {row.undeployed ? (
                  <>
                    {" "}
                    <Badge tone="gray">미배포</Badge>
                  </>
                ) : row.appealPending ? (
                  <>
                    {" "}
                    <Badge tone="violet">소명 대기</Badge>
                  </>
                ) : null}
              </td>
              {/* 트랙이 비었으면 시즌 1의 단일 트랙이다(schema Track 주석) */}
              <td>{row.track ?? "자유 주제"}</td>
              <td className={c.num}>{row.stage}</td>
              <td>
                <Badge tone={STATUS_TONE[row.status] ?? "gray"}>{row.status}</Badge>
              </td>
              <td className={c.num} style={{ color: row.onboarded ? "var(--teal)" : "var(--faint)" }}>
                {row.onboarded ? "✓" : "-"}
              </td>
              <td className={c.num}>{row.lastSubmittedAt ? fmtMD(row.lastSubmittedAt) : "-"}</td>
              <td>
                <EntryActions entryId={row.id} teamName={row.teamName} status={row.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <p style={{ fontSize: "12px", color: "var(--faint)", marginTop: "12px" }}>
          조건에 맞는 팀 없음.
        </p>
      ) : null}
    </>
  );
}
