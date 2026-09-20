import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { AdminTop } from "@/components/AdminTop";
import { DashboardTop } from "@/components/DashboardTop";
import { NavBar } from "@/components/NavBar";
import { EntryStage, EntryStatus, SeasonPhase, StageKey } from "@/generated/prisma/enums";
import {
  resolveAdminHeader,
  resolveDashboardHeader,
  type AdminHeaderInput,
  type DashboardHeaderInput,
  type HeaderSeason,
  type HeaderUser,
  type StageInfo,
} from "@/lib/header-state";

/*
  헤더 진열장. **개발용이고 production 빌드에는 나가지 않는다**(아래 notFound 가드).

  「헤더 상태별 시안 v1.0」의 카탈로그 27종(P1~P11 · D1~D9 · A1~A7)을 시안과
  같은 표본 데이터로 그린다. `scripts/design-diff/header-states.mjs`가 시안의
  `.spec[data-id] .frame`과 여기의 `[data-id]`를 1:1로 대조한다.

  표본 값(루틴메이트 2인, 마감 10.18 D-4, 심사 대기 18건 …)은 시안 것을
  그대로 넣었다. 판정 함수를 거쳐 그리므로 **문구가 시안과 같아야 판정도
  맞는 것**이다 — 글자 대조가 곧 판정 검사다.

  data-id가 대조의 손잡이다. 시안 쪽 `.spec[data-id]`와 짝을 이룬다.
*/

const KST = (s: string) => new Date(`${s}+09:00`);

const SEASON = {
  title: "시즌 1",
  slug: "season-1",
  flags: { notifications: true, leaderboard: true },
};

/* ── 공개 헤더: 시안 조합기의 대표 칸. 아바타 글자도 시안 표본 그대로 ── */
const BOARD = `/seasons/${SEASON.slug}/leaderboard`;
const PUB: { id: string; season: HeaderSeason; user: HeaderUser; initial?: string; on?: string }[] = [
  { id: "P1", season: "pre", user: "guest" },
  { id: "P2", season: "recruit", user: "guest", on: "/" },
  { id: "P3", season: "stage", user: "guest", on: BOARD },
  { id: "P4", season: "stage", user: "guest", on: BOARD },
  { id: "P5", season: "done", user: "guest", on: BOARD },
  { id: "P6", season: "arch", user: "guest" },
  { id: "P7", season: "recruit", user: "member", initial: "김", on: "/" },
  { id: "P8", season: "stage", user: "member", initial: "김", on: BOARD },
  { id: "P9", season: "stage", user: "entrant", initial: "리", on: BOARD },
  { id: "P10", season: "stage", user: "elim", initial: "북", on: BOARD },
  { id: "P11", season: "stage", user: "admin", initial: "A", on: BOARD },
];

/* ── 참가자 헤더: 시안 표본 일정(시즌 1, 09.28 개막) ── */
const STAGES: StageInfo[] = [
  { key: StageKey.s1, name: "아이디어 등록과 고도화", isGate: false, opensAt: KST("2026-09-28T00:00:00"), closesAt: KST("2026-10-04T23:59:00") },
  { key: StageKey.s2, name: "랜딩과 수요조사", isGate: true, opensAt: KST("2026-10-05T00:00:00"), closesAt: KST("2026-10-11T23:59:00") },
  { key: StageKey.s3, name: "AI 빌드와 배포", isGate: false, opensAt: KST("2026-10-12T00:00:00"), closesAt: KST("2026-10-18T23:59:00") },
  { key: StageKey.s4, name: "마케팅과 유저 유입", isGate: false, opensAt: KST("2026-10-19T00:00:00"), closesAt: KST("2026-10-25T23:59:00") },
  { key: StageKey.s5, name: "트래픽과 매출", isGate: true, opensAt: KST("2026-10-26T00:00:00"), closesAt: KST("2026-11-02T00:00:00") },
];

const DASH_BASE: DashboardHeaderInput = {
  now: KST("2026-10-14T10:00:00"),
  season: {
    ...SEASON,
    phase: SeasonPhase.racing,
    startsAt: KST("2026-09-28T00:00:00"),
    endsAt: KST("2026-11-03T00:00:00"),
    flags: { notifications: true, leaderboard: true },
  },
  team: { name: "루틴메이트", members: 2 },
  entry: { stage: EntryStage.s3, status: EntryStatus.active },
  onboardingComplete: true,
  stages: STAGES,
  gateSubmittedAt: null,
  reviewSlaHours: 48,
  finalRank: null,
  elimination: null,
  sanction: null,
  unread: 1,
  initial: "리",
  nextSeason: null,
  stripDismissed: false,
};

const d = (over: Partial<DashboardHeaderInput>) => ({ ...DASH_BASE, ...over });

const DASH: { id: string; input: DashboardHeaderInput }[] = [
  { id: "D1", input: d({ season: { ...DASH_BASE.season, phase: SeasonPhase.recruiting }, entry: { stage: EntryStage.applied, status: EntryStatus.active }, unread: 0 }) },
  { id: "D2", input: d({}) },
  { id: "D2-urgent", input: d({ now: KST("2026-10-03T09:00:00"), entry: { stage: EntryStage.applied, status: EntryStatus.active } }) },
  { id: "D3", input: d({ now: KST("2026-10-12T10:00:00"), entry: { stage: EntryStage.s2, status: EntryStatus.active }, gateSubmittedAt: KST("2026-10-11T17:00:00"), unread: 0 }) },
  { id: "D4", input: d({ now: KST("2026-10-28T10:00:00"), entry: { stage: EntryStage.s4, status: EntryStatus.active } }) },
  { id: "D5", input: d({ season: { ...DASH_BASE.season, phase: SeasonPhase.awarded }, finalRank: 3 }) },
  { id: "D6", input: d({ season: { ...DASH_BASE.season, phase: SeasonPhase.archived }, entry: { stage: EntryStage.s2, status: EntryStatus.eliminated }, nextSeason: { label: "시즌 2", startsAt: KST("2027-01-05T00:00:00"), recruiting: true } }) },
  { id: "D7", input: d({ team: { name: "북클럽라이트", members: 1 }, entry: { stage: EntryStage.s2, status: EntryStatus.eliminated }, elimination: { gate: StageKey.s2, submitted: false }, initial: "북" }) },
  { id: "D8", input: d({ now: KST("2026-10-26T10:00:00"), team: { name: "트래픽팜", members: 2 }, entry: { stage: EntryStage.s4, status: EntryStatus.disqualified }, sanction: { reason: "bot_traffic", appealDeadlineAt: KST("2026-10-30T23:59:00"), appealedAt: null }, initial: "트" }) },
  { id: "D9", input: d({ season: { ...DASH_BASE.season, phase: SeasonPhase.archived }, finalRank: 3, nextSeason: { label: "시즌 2", startsAt: KST("2027-01-05T00:00:00"), recruiting: true } }) },
];

/* ── 운영자 헤더: 시안 표본 대기열 ── */
const ADMIN_SEASON = { id: "s1", title: "시즌 1", phase: SeasonPhase.racing, startsAt: KST("2026-09-28T00:00:00"), endsAt: KST("2026-11-03T00:00:00") };
const ADMIN_BASE: AdminHeaderInput = {
  now: KST("2026-10-14T10:00:00"),
  season: ADMIN_SEASON,
  seasons: [{ id: "s1", title: "시즌 1", phase: SeasonPhase.racing }],
  stages: STAGES.map((s) => (s.key === StageKey.s3 ? { ...s, name: "빌드와 배포" } : s)),
  recruitDeadline: KST("2026-09-27T23:59:00"),
  queues: {
    leads: 137, leadsConversion: 4.2, entries: 24, onboardingIncomplete: 3, stagePending: 8,
    reviewsPending: 18, reviewsSlaUnder12h: 3, metricsPending: 20, abuseFlags: 2, appealsPending: 1,
    nextSeasonLeads: null,
  },
  nextSeason: null,
  email: "admin@proovit.kr",
};

const a = (over: Partial<AdminHeaderInput>) => ({ ...ADMIN_BASE, ...over });
const phase = (p: SeasonPhase) => ({
  season: { ...ADMIN_SEASON, phase: p },
  seasons: [{ id: "s1", title: "시즌 1", phase: p }],
});

const ADMIN: { id: string; input: AdminHeaderInput }[] = [
  { id: "A1", input: a(phase(SeasonPhase.pre_apply)) },
  { id: "A2", input: a(phase(SeasonPhase.recruiting)) },
  { id: "A3", input: a({}) },
  { id: "A4", input: a({ now: KST("2026-10-12T10:00:00"), stages: STAGES.slice(0, 2) }) },
  { id: "A5", input: a({ now: KST("2026-11-02T10:00:00"), queues: { ...ADMIN_BASE.queues, reviewsPending: 0 } }) },
  { id: "A6", input: a(phase(SeasonPhase.awarded)) },
  {
    id: "A7",
    input: a({
      ...phase(SeasonPhase.archived),
      seasons: [
        { id: "s2", title: "시즌 2", phase: SeasonPhase.draft },
        { id: "s1", title: "시즌 1", phase: SeasonPhase.archived },
      ],
      nextSeason: { title: "시즌 2", startsAt: KST("2027-01-05T00:00:00") },
      queues: { ...ADMIN_BASE.queues, nextSeasonLeads: 41 },
    }),
  },
];

function Frame({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section data-id={id} style={{ marginBottom: 24 }}>
      <p style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--faint)", margin: "0 0 6px" }}>{id}</p>
      <div style={{ position: "relative", border: "1px solid var(--line-strong)", borderRadius: 12, overflow: "hidden" }}>
        {children}
      </div>
    </section>
  );
}

export default function Page() {
  /* 라우트 자체를 숨긴다. 진열장은 팀 바깥에 보여줄 것이 아니다 */
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main style={{ padding: 40, maxWidth: 1180, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24 }}>헤더 상태별 진열장</h1>

      {PUB.map((p) => (
        <Frame key={p.id} id={p.id}>
          <NavBar
            season={{ kind: p.season, slug: SEASON.slug, title: SEASON.title, flags: SEASON.flags }}
            viewer={p.user === "guest" ? null : { kind: p.user, initial: p.initial ?? "?", unread: p.user === "entrant" ? 1 : 0 }}
            /* 시안 프레임의 `.on`과 같은 항목을 켠다. 진열장 경로로는 어느 것도 안 켜진다 */
            activeHref={p.on ?? "/dev/headers"}
          />
        </Frame>
      ))}

      {DASH.map((x) => (
        <Frame key={x.id} id={x.id}>
          <DashboardTop model={resolveDashboardHeader(x.input)} entryId="fixture" />
        </Frame>
      ))}

      {ADMIN.map((x) => (
        <Frame key={x.id} id={x.id}>
          <AdminTop model={resolveAdminHeader(x.input)} />
        </Frame>
      ))}
    </main>
  );
}
