import type { Metadata } from "next";
import Link from "next/link";

import { Badge, type BadgeTone } from "@/components/Badge";
import { Card } from "@/components/Surface";
import { ABUSE_KIND_LABEL, SEVERITY_LABEL } from "@/content/abuse";
import { AbuseStatus } from "@/generated/prisma/enums";
import { guardPage } from "@/lib/access";
import { fmtMD } from "@/lib/header-state";
import { prisma } from "@/lib/prisma";

import hub from "../../dashboard/hub.module.css";
import c from "../console.module.css";
import { SanctionButtons } from "./SanctionButtons";

/*
  어뷰징 — 시안 `#scr-adm-abuse`(3131행). 참가자 소명(`/dashboard/appeal`)의 짝이다.

  위는 플래그 큐, 아래는 고른 플래그 하나의 판정 카드다. 줄의 유형을 누르면 그
  플래그가 카드에 선다(`?flag=`). 고르지 않았으면 아직 판정하지 않은 것 중 맨 위.

  ⚠️ 참가자 소명을 판정 옆에 둔다 — 카드 부연이 「소명 접수됨(10.23)」이다.
  다른 화면에 있으면 안 읽고 누르게 되고, 규칙 제16조 ①이 요구하는 「적용 전 소명
  기회」가 형식만 남는다.
*/

export const metadata: Metadata = {
  title: "어뷰징",
  robots: { index: false, follow: false },
};

const SEVERITY_TONE: Record<string, BadgeTone> = { high: "red", medium: "warn", low: "gray" };

/* 상태 — 시안 「소명 중」(바이올렛)·「대기」(회색)·「판정 완료」(라임) */
const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  [AbuseStatus.flagged]: { label: "대기", tone: "gray" },
  [AbuseStatus.appealed]: { label: "소명 중", tone: "violet" },
  [AbuseStatus.upheld]: { label: "판정 완료", tone: "lime" },
  [AbuseStatus.overturned]: { label: "판정 완료", tone: "lime" },
};

const OPEN: string[] = [AbuseStatus.flagged, AbuseStatus.appealed];

/* 줄 순서 — 소명이 들어온 것(회신 의무가 있다)이 맨 위, 그다음 대기, 끝난 것은 아래 */
const RANK: Record<string, number> = {
  [AbuseStatus.appealed]: 0,
  [AbuseStatus.flagged]: 1,
  [AbuseStatus.upheld]: 2,
  [AbuseStatus.overturned]: 2,
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { viewer } = await guardPage("adminAbuse", "/admin/abuse");
  const sp = await searchParams;

  const flags = (viewer.season
    ? await prisma.abuseFlag.findMany({
        where: { entry: { seasonId: viewer.season.id } },
        orderBy: [{ createdAt: "desc" }],
        take: 200,
        select: {
          id: true,
          status: true,
          kind: true,
          severity: true,
          evidence: true,
          reason: true,
          appealedAt: true,
          resolutionNote: true,
          entry: { select: { team: { select: { name: true } } } },
        },
      })
    : []
  ).sort((a, b) => RANK[a.status] - RANK[b.status]);

  const picked =
    flags.find((f) => f.id === sp.flag) ?? flags.find((f) => OPEN.includes(f.status)) ?? null;
  const kindLabel = (f: (typeof flags)[number]) =>
    f.kind ? ABUSE_KIND_LABEL[f.kind] : (f.reason ?? "기타");

  return (
    <>
      <h2 className={hub.h1}>어뷰징</h2>
      <p className={hub.sub}>플래그 큐 판정, 모든 제재는 사유 필수, 소명 절차 연결</p>

      <table className={c.atbl} style={{ marginBottom: "16px" }} data-probe="abuse">
        <thead>
          <tr>
            <th>유형</th>
            <th>TEAM</th>
            <th>심각도</th>
            <th>증거 요약</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {flags.map((f) => (
            <tr key={f.id}>
              <td>
                <Link href={`?flag=${f.id}`} scroll={false} style={{ color: "inherit" }}>
                  <b>{kindLabel(f)}</b>
                </Link>
              </td>
              <td>{f.entry.team.name}</td>
              <td>
                {f.severity ? (
                  <Badge tone={SEVERITY_TONE[f.severity]}>{SEVERITY_LABEL[f.severity]}</Badge>
                ) : (
                  <Badge tone="gray">미정</Badge>
                )}
              </td>
              <td className={c.num}>{f.evidence ?? f.reason ?? "-"}</td>
              <td>
                <Badge tone={STATUS[f.status].tone}>{STATUS[f.status].label}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {flags.length === 0 ? (
        <p style={{ fontSize: "12px", color: "var(--faint)" }}>
          플래그 없음. 측정 파이프라인이 이상 트래픽을 잡거나 지표 검토에서 이관하면 쌓임.
        </p>
      ) : null}

      {picked ? (
        <Card style={{ padding: "20px" }} data-probe="abuse-card">
          <b style={{ fontSize: "14px" }}>
            판정, {picked.entry.team.name}, {kindLabel(picked)}
          </b>
          <p style={{ fontSize: "13px", color: "var(--muted)", margin: "6px 0 14px" }}>
            {picked.status === AbuseStatus.appealed && picked.appealedAt
              ? `소명 접수됨(${fmtMD(picked.appealedAt)}), 근거 지표 회신 의무`
              : picked.status === AbuseStatus.flagged
                ? "소명 전, 제재 적용 전 소명 기회 부여(제16조 ①)"
                : `판정 완료, ${picked.resolutionNote ?? "사유 미기재"}`}
          </p>
          <SanctionButtons key={picked.id} flagId={picked.id} kind={picked.kind} />
        </Card>
      ) : null}
    </>
  );
}
