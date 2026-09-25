import type { Metadata } from "next";
import { headers } from "next/headers";

import { Badge, type BadgeTone } from "@/components/Badge";
import { EntryStage, EntryStatus } from "@/generated/prisma/enums";
import { guardPage } from "@/lib/access";
import { loadAdminEntries, loadLatePassBoard } from "@/lib/admin-read";
import { devNow } from "@/lib/dev-clock";
import { devToolsEnabled } from "@/lib/dev-env";
import { fmtMD, fmtMDHM, fmtStamp } from "@/lib/header-state";
import { LATE_ENTRY_BLOCK_MESSAGE } from "@/lib/late-entry";
import { siteUrl } from "@/lib/mail";

import hub from "../../dashboard/hub.module.css";
import c from "../console.module.css";
import { FilterBar } from "../FilterBar";
import { EntryActions } from "./EntryRow";
import { LatePassPanel } from "./LatePassPanel";

/*
  참가 관리 — 시안 `#scr-adm-entries`(3041행).

  실격·복구가 여기서 일어난다. 그래서 **한 줄에 판단 재료를 다 둔다** — 진도,
  생존 상태, 온보딩, 최근 제출. 화면을 옮겨 다니며 맞춰보게 하면 근거를 덜 보고
  누르게 된다.

  ⚠️ 실명은 읽지 않는다(admin-read.ts 머리 주석). 팀명까지다.

  표 아래 「지각 편입」은 **시안에 없는 칸**이다(2026-09-26 수연 지시 「문의가 오면
  운영자가 수동 편입하는 화면과 로직」 · PRD OPEN-6). 모집이 끝난 뒤 문의가 오면
  DB를 직접 고치던 자리라, 1회용 편입 링크를 만들어 건네는 칸을 두었다 — 참가자가
  그 링크로 평소 신청서를 직접 쓰며 동의한다(schema.prisma LateEntryPass 주석).
  모양은 시즌 관리의 「페이즈 수동 전환」처럼 공용 부품만 쓴다(내가 정함, 수연 확인 대기).
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

/**
 * 편입 링크의 앞부분. 참가자에게 건너가는 주소라 서버가 정한다.
 *
 *   운영          `siteUrl()` — 메일 링크(초대·알림)와 같은 정규 주소. 운영자가 콘솔을
 *                 *.vercel.app 배포 주소로 열었어도 참가자에게 그 주소(Vercel 로그인으로
 *                 잠긴)가 나가지 않게(2026-09-26 리뷰 지적).
 *   개발·스테이징  지금 요청의 주소. `siteUrl()`은 개발에서도 https://proovit.kr을 돌려줘
 *                 (.env.development.local) dev DB에 만든 링크가 운영을 가리키게 된다 —
 *                 링크는 그 링크를 만든 DB와 같은 배포로 가야 한다.
 * 가르는 기준은 개발 바와 같은 `devToolsEnabled`(dev-env.ts)다.
 */
async function latePassOrigin(): Promise<string> {
  if (!devToolsEnabled) return siteUrl();
  const h = await headers();
  /* 프록시를 여럿 지나면 쉼표로 이어진다 — 맨 앞이 브라우저가 연 주소다 */
  const first = (name: string) => h.get(name)?.split(",")[0]?.trim() || null;
  const host = first("x-forwarded-host") ?? first("host");
  if (!host) return siteUrl();
  const proto = first("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { viewer } = await guardPage("adminEntries", "/admin/entries");
  const sp = await searchParams;
  const [rows, late, origin] = viewer.season
    ? await Promise.all([
        loadAdminEntries(viewer.season.id, {
          stage: sp.stage,
          status: sp.status,
          flag: sp.flag,
          q: sp.q,
        }),
        loadLatePassBoard(viewer.season.id, devNow()),
        latePassOrigin(),
      ])
    : [[], null, ""];

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

      {/* 시안에 없는 칸 — 머리 주석 */}
      {viewer.season && late ? (
        <LatePassPanel
          seasonId={viewer.season.id}
          origin={origin}
          blocked={late.block ? LATE_ENTRY_BLOCK_MESSAGE[late.block] : null}
          deadline={late.deadline ? fmtMDHM(late.deadline) : null}
          rows={late.rows.map((row) => ({
            id: row.id,
            code: row.code,
            label: row.label,
            created: fmtStamp(row.createdAt),
            expires: fmtMDHM(row.expiresAt),
            status: row.status,
            teamName: row.teamName,
            reason: row.reason,
          }))}
        />
      ) : null}
    </>
  );
}
