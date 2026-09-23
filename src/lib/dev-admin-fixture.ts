import { assertSandbox } from "@/lib/dev-sandbox";
import { prisma } from "@/lib/prisma";

/*
  운영자 화면의 시안 목업을 dev DB에 심는다 — 개발 바 「운영 콘솔」 줄과
  `scripts/design-diff/admin-state.mts`가 같이 쓴다.

  시안 목업(시즌 1, 10월)의 행을 **그 모양 그대로** 심는다. 팀은 `spec-teams.mts`가
  맞춰 둔 시안 12팀이고, 시각은 시안에 적힌 날짜(KST)다.

  ⚠️ **심은 행의 id를 돌려준다.** 걷을 때는 그 id만 지운다 — 원래 있던 행을
  건드리면 수연이 개발 바로 앉혀 둔 판이 같이 사라진다.
*/

export type AdminFixture = {
  screen: string;
  created: {
    auditLog?: string[];
    lead?: string[];
  };
  /** 덮어쓴 시즌 칸의 원래 값 — 걷을 때 되돌린다 */
  seasonBefore?: { scoringConfig: unknown; featureFlags: unknown };
};

const SLUG = "season-1";

/** 「10.24 16:40」 → 2026년 그 KST 시각 */
function at(md: string): Date {
  const [d, t = "09:00"] = md.split(" ");
  const [m, day] = d.split(".");
  return new Date(`2026-${m}-${day}T${t}:00+09:00`);
}

async function entryOf(seasonId: string, team: string): Promise<string> {
  const e = await prisma.entry.findFirst({
    where: { seasonId, team: { name: team } },
    select: { id: true },
  });
  if (!e) throw new Error(`[dev-admin] ${team} 참가 기록이 없다 — spec-teams.mts를 먼저 돌린다`);
  return e.id;
}

async function adminId(): Promise<string> {
  const r = await prisma.userRole.findFirst({
    where: { role: { key: "admin" } },
    select: { userId: true },
  });
  if (!r) throw new Error("[dev-admin] 운영자 계정이 없다");
  return r.userId;
}

/*
  시안 감사 로그(3190행)와 대시보드 `.minlog`(2991행)의 여섯 줄.
  대상은 팀이면 참가 기록 id로, 묶음(「GATE 1, 11팀」·「전체」)이면 `meta.target`으로 적는다 —
  `loadAuditLines`가 읽는 방식 그대로다.
*/
type AuditSeed = {
  at: string;
  actor: "admin" | "system";
  action: string;
  team?: string;
  season?: true;
  target?: string;
  meta?: Record<string, string>;
  reason: string;
  /* 대시보드 `.minlog`(2991행)는 같은 기록을 조금 다르게 적었다 — 그 화면에서는 이것 */
  dash?: { target?: string; reason?: string };
};

const AUDIT: AuditSeed[] = [
  { at: "09.25 10:00", actor: "admin", action: "season.update", season: true, reason: "scoring_config v0.3 반영" },
  { at: "10.12 14:20", actor: "admin", action: "judgment.record", target: "GATE 1, 11팀", reason: "운영진 판정 입력", dash: { target: "GATE 1 11팀" } },
  { at: "10.12 14:35", actor: "admin", action: "judgment.update", team: "시들지마", meta: { from: "fail", to: "pass" }, reason: "증빙 재확인, 교차 채점 합의" },
  { at: "10.19 09:30", actor: "admin", action: "notification.broadcast", target: "전체", reason: "롤업 주기 안내" },
  { at: "10.21 08:15", actor: "system", action: "abuse.flag", team: "두잇로그", reason: "자동 탐지, UA 단일 트래픽" },
  { at: "10.23 11:02", actor: "admin", action: "metric.recalc", team: "두잇로그", reason: "03시 급증 구간 재계산" },
  { at: "10.24 16:40", actor: "admin", action: "abuse.sanction_lift", team: "두잇로그", reason: "소명 인용, IP 다양성 187, 봇 패턴 불일치", dash: { reason: "소명 인용, 봇 패턴 불일치" } },
];

async function seedAudit(
  seasonId: string,
  { only, dash = false }: { only?: (s: AuditSeed) => boolean; dash?: boolean } = {},
): Promise<string[]> {
  const actor = await adminId();
  const ids: string[] = [];
  for (const base of AUDIT.filter(only ?? (() => true))) {
    const s = dash && base.dash ? { ...base, ...base.dash } : base;
    const entryId = s.team ? await entryOf(seasonId, s.team) : null;
    const row = await prisma.auditLog.create({
      data: {
        actorId: s.actor === "admin" ? actor : null,
        action: s.action,
        targetType: s.season ? "season" : entryId ? "entry" : "batch",
        targetId: s.season ? seasonId : entryId,
        reason: s.reason,
        meta: { ...(s.target ? { target: s.target } : {}), ...(s.meta ?? {}) },
        createdAt: at(s.at),
      },
      select: { id: true },
    });
    ids.push(String(row.id));
  }
  return ids;
}

/*
  사전신청 리드. 대시보드 KPI 1의 「↑ 3.8% 이번 주」가 서도록 이번 주 몫을 1,
  그 전을 26으로 둔다(1/26 = 3.8%). 리드 화면의 다섯 줄(3120행)이 맨 앞이다 —
  주소는 가려져 나오므로 앞 글자와 도메인 머리만 시안과 같게 짓는다.
*/
const LEADS: { email: string; mkt: boolean; utm: string; at?: string }[] = [
  { email: "yeonwoo@gmail.com", mkt: true, utm: "threads_launch" },
  { email: "sora@naver.com", mkt: false, utm: "openchat_dev" },
  { email: "minji@kakao.com", mkt: true, utm: "threads_launch" },
  { email: "hyun@gmail.com", mkt: true, utm: "reels_teaser" },
  { email: "jae@daum.net", mkt: false, utm: "direct" },
];

async function seedLeads(seasonId: string): Promise<string[]> {
  const { devNow } = await import("@/lib/dev-clock");
  const now = devNow().getTime();
  const ids: string[] = [];
  const rows = [
    ...LEADS.map((l, i) => ({ ...l, at: new Date(now - (i === 0 ? 1 : 8 + i) * 86_400_000) })),
    ...Array.from({ length: 21 }, (_, i) => ({
      email: `spec-lead-${i + 1}@example.com`,
      mkt: i % 3 !== 0,
      utm: "direct",
      at: new Date(now - (14 + i) * 86_400_000),
    })),
  ];
  for (const r of rows) {
    const row = await prisma.lead.create({
      data: {
        seasonId,
        email: r.email,
        utmSource: r.utm,
        privacyConsentAt: r.at,
        privacyConsentVersion: "v1.0",
        marketingOptIn: r.mkt,
        marketingConsentVersion: r.mkt ? "v1.0" : null,
        createdAt: r.at,
      },
      select: { id: true },
    });
    ids.push(row.id);
  }
  return ids;
}

export async function setSandboxAdmin({ screen }: { screen: string }): Promise<AdminFixture> {
  assertSandbox();
  const season = await prisma.season.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const created: AdminFixture["created"] = {};

  switch (screen) {
    case "dash":
      /* 대시보드는 최근 다섯 줄 — 시안에 없는 10.21 abuse.flag는 뺀다 */
      created.auditLog = await seedAudit(season.id, {
        only: (s) => s.action !== "abuse.flag" && s.action !== "season.update",
        dash: true,
      });
      created.lead = await seedLeads(season.id);
      break;
    case "seasons": {
      /*
        시안의 scoring_config(3024행)와 플래그 셋(리더보드 켬, 테스터·크레딧 끔).
        시즌 행을 덮으므로 원래 값을 떠 둔다.
      */
      const before = await prisma.season.findUniqueOrThrow({
        where: { id: season.id },
        select: { scoringConfig: true, featureFlags: true },
      });
      const flags = (before.featureFlags ?? {}) as Record<string, unknown>;
      await prisma.season.update({
        where: { id: season.id },
        data: {
          scoringConfig: {
            traffic_weight: 0.6,
            conversion_weight: 0.4,
            t3_channel_hhi: true,
            r2_bayesian_prior: 12,
            log_scale_metrics: ["t1", "r1"],
          },
          featureFlags: { ...flags, leaderboard: true, testerAssignments: false, credits: false },
        },
      });
      return { screen, created, seasonBefore: before };
    }
    case "audit":
      created.auditLog = await seedAudit(season.id);
      break;
    default:
      break;
  }
  return { screen, created };
}

export async function clearSandboxAdmin(f: AdminFixture): Promise<void> {
  assertSandbox();
  if (f.seasonBefore) {
    await prisma.season.update({
      where: { slug: SLUG },
      data: {
        scoringConfig: f.seasonBefore.scoringConfig as never,
        featureFlags: f.seasonBefore.featureFlags as never,
      },
    });
  }
  if (f.created.lead?.length) {
    await prisma.lead.deleteMany({ where: { id: { in: f.created.lead } } });
  }
  if (f.created.auditLog?.length) {
    await prisma.auditLog.deleteMany({ where: { id: { in: f.created.auditLog.map(BigInt) } } });
  }
}
