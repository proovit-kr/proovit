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
    submission?: string[];
    judgment?: string[];
    notification?: string[];
    metricDaily?: string[];
    metricChannel?: string[];
    abuseFlag?: string[];
    snapshot?: string[];
    sanction?: string[];
  };
  /** 큐에서 잠시 내린 집계 줄(reviewedBy를 채웠다) — 걷을 때 비운다 */
  metricHidden?: string[];
  /** 덮어쓴 시즌 칸의 원래 값 — 걷을 때 되돌린다 */
  seasonBefore?: { scoringConfig: unknown; featureFlags: unknown };
  /** 덮어쓴 제출의 원래 값(없던 제출은 created.submission) */
  submissionBefore?: { id: string; status: string; submittedAt: string | null }[];
  /** 덮어쓴 참가 기록의 원래 값 */
  entryBefore?: { id: string; status: string; stage: string }[];
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
    case "judging": {
      /*
        시안 심사 표(3074행) — GATE 1에 낸 네 팀과 판정, 그리고 내지 않고 탈락한 모카브루.
        있던 s2 제출은 상태·시각만 덮고 떠 둔다. 모카브루의 s2 제출은 임시저장으로
        돌려 「미제출」로 만든다.
      */
      const actor = await adminId();
      const rows = [
        { team: "리틀포션", at: "10.10 18:40", result: "pass", why: "수요 검증 충실, 위험 가정과 조사 설계 연결" },
        { team: "새벽창고", at: "10.11 21:02", result: "pass", why: "문제 정의 명확, 기존 대안 분석 구체적" },
        { team: "시들지마", at: "10.11 23:40", result: "fail", why: "유효 신청 존재 확인 미달, 대안 분석 일반론" },
        { team: "북클럽라이트", at: "10.11 22:15", result: "fail", why: "수요 신호 부족, 직접 조사 기록 없음" },
      ] as const;
      const submissionBefore: NonNullable<AdminFixture["submissionBefore"]> = [];
      /* 판정을 저장해 보면(흐름 검증) 진도·상태가 움직인다 — 네 팀도 떠 둔다 */
      const entryBefore: NonNullable<AdminFixture["entryBefore"]> = [];
      created.submission = [];
      created.judgment = [];
      for (const r of rows) {
        const entryId = await entryOf(season.id, r.team);
        const e = await prisma.entry.findUniqueOrThrow({ where: { id: entryId }, select: { status: true, stage: true } });
        entryBefore.push({ id: entryId, status: e.status, stage: e.stage });
        const had = await prisma.submission.findUnique({
          where: { entryId_stageKey_week: { entryId, stageKey: "s2", week: 0 } },
          select: { id: true, status: true, submittedAt: true },
        });
        let submissionId: string;
        if (had) {
          submissionBefore.push({ id: had.id, status: had.status, submittedAt: had.submittedAt?.toISOString() ?? null });
          await prisma.submission.update({
            where: { id: had.id },
            data: { status: "locked", submittedAt: at(r.at) },
          });
          submissionId = had.id;
        } else {
          const row = await prisma.submission.create({
            data: {
              entryId, stageKey: "s2", week: 0, status: "locked", submittedAt: at(r.at),
              payload: { landingUrl: "https://example.com", channels: ["스레드"], postUrl: "https://example.com" },
            },
            select: { id: true },
          });
          created.submission.push(row.id);
          submissionId = row.id;
        }
        const j = await prisma.judgment.create({
          data: { submissionId, result: r.result, feedback: r.why, judgedBy: actor, judgedAt: new Date(Date.now() - 86_400_000) },
          select: { id: true },
        });
        created.judgment.push(j.id);
      }
      const mocha = await prisma.entry.findFirstOrThrow({
        where: { seasonId: season.id, team: { name: "모카브루" } },
        select: { id: true, status: true, stage: true },
      });
      const mochaS2 = await prisma.submission.findUnique({
        where: { entryId_stageKey_week: { entryId: mocha.id, stageKey: "s2", week: 0 } },
        select: { id: true, status: true, submittedAt: true },
      });
      if (mochaS2) {
        submissionBefore.push({ id: mochaS2.id, status: mochaS2.status, submittedAt: mochaS2.submittedAt?.toISOString() ?? null });
        await prisma.submission.update({ where: { id: mochaS2.id }, data: { status: "draft" } });
      }
      await prisma.entry.update({ where: { id: mocha.id }, data: { status: "eliminated", stage: "s1" } });
      return {
        screen,
        created,
        submissionBefore,
        entryBefore: [...entryBefore, { id: mocha.id, status: mocha.status, stage: mocha.stage }],
      };
    }
    case "abuse": {
      /* 시안 어뷰징 표(3137행)의 세 줄 */
      const seeds = [
        { team: "두잇로그", kind: "bot_traffic", severity: "high", evidence: "03:12~04:40, 214건, UA 단일", status: "appealed", appealedAt: at("10.23 11:00") },
        { team: "러닝메이트", kind: "multi_account", severity: "medium", evidence: "동일 결제수단 가입 6건", status: "flagged", appealedAt: null },
        { team: "시들지마", kind: "false_representation", severity: "medium", evidence: "제출 채널과 유입원 불일치", status: "upheld", appealedAt: null },
      ] as const;
      created.abuseFlag = [];
      for (const f of seeds) {
        const row = await prisma.abuseFlag.create({
          data: {
            entryId: await entryOf(season.id, f.team),
            kind: f.kind,
            severity: f.severity,
            evidence: f.evidence,
            status: f.status,
            appealedAt: f.appealedAt,
            reason: "시안 목업",
          },
          select: { id: true },
        });
        created.abuseFlag.push(row.id);
      }
      break;
    }
    case "noti": {
      /* 시안 발송 이력(3170행) 세 줄 — 발송마다 감사 로그 한 줄이 남는 모양 그대로 */
      const actor = await adminId();
      const rows = [
        { at: "09.28 10:00", title: "시즌 1 킥오프", mail: true },
        { at: "10.12 15:00", title: "1차 심사 결과 발표, 판정과 사유", mail: true },
        { at: "10.19 09:30", title: "롤업 주기 안내", mail: false },
      ];
      created.auditLog = [];
      for (const r of rows) {
        const row = await prisma.auditLog.create({
          data: {
            actorId: actor,
            action: "notification.broadcast",
            targetType: "season",
            targetId: season.id,
            reason: r.title,
            meta: { target: "전체", stage: "all", track: "all", teams: 12, people: 20, inapp: true, mail: r.mail },
            createdAt: at(r.at),
          },
          select: { id: true },
        });
        created.auditLog.push(String(row.id));
      }
      break;
    }
    case "awards": {
      /*
        시안 시상 표(3212행) — 1~4위와 제재로 빠진 두잇로그(512 → 298, 지표 무효화 −214).
        스냅샷은 다른 집계보다 늦은 날(11.17)에 심어 「가장 최근 집계일」이 되게 한다.
      */
      const day = new Date("2026-11-17T00:00:00Z");
      const rows = [
        { team: "새벽창고", rank: 1, visitors: 1368 },
        { team: "리틀포션", rank: 2, visitors: 1248 },
        { team: "오늘의루틴", rank: 3, visitors: 1094 },
        { team: "밥값하는AI", rank: 4, visitors: 901 },
        { team: "두잇로그", rank: 5, visitors: 512 },
      ];
      created.snapshot = [];
      for (const r of rows) {
        const snap = await prisma.leaderboardSnapshot.create({
          data: {
            seasonId: season.id,
            entryId: await entryOf(season.id, r.team),
            snapshotDate: day,
            rank: r.rank,
            score: 0,
            validVisitorsTotal: r.visitors,
          },
          select: { id: true },
        });
        created.snapshot.push(snap.id);
      }
      const doit = await prisma.entry.findFirstOrThrow({
        where: { seasonId: season.id, team: { name: "두잇로그" } },
        select: { id: true, status: true, stage: true },
      });
      await prisma.entry.update({ where: { id: doit.id }, data: { status: "disqualified" } });
      const flag = await prisma.abuseFlag.create({
        data: { entryId: doit.id, kind: "bot_traffic", status: "upheld", adjustedVisitors: -214, reason: "시안 목업" },
        select: { id: true },
      });
      created.abuseFlag = [flag.id];
      const sanction = await prisma.sanction.create({
        data: {
          entryId: doit.id, stage: "week_invalidated", reason: "bot_traffic",
          detail: "시안 목업", status: "applied", appliedAt: new Date(),
        },
        select: { id: true },
      });
      created.sanction = [sanction.id];
      return { screen, created, entryBefore: [{ id: doit.id, status: doit.status, stage: doit.stage }] };
    }
    case "sponsors:offers":
    case "sponsors:claims":
    case "sponsors:log": {
      /*
        시안 발송 이력(3299행)의 모양 — 시스템 일괄 발송(자동)과 운영자 쓰기(수기).
        혜택 카드 넷은 dev에 이미 시안과 같은 상태로 있다(크레딧 화면 작업 때 심음).
      */
      const actor = await adminId();
      const c1 = await prisma.creditOffer.findFirst({ where: { seasonId: season.id, kind: "c1" }, select: { id: true } });
      const c2 = await prisma.creditOffer.findFirst({ where: { seasonId: season.id, kind: "c2" }, select: { id: true } });
      const c3 = await prisma.creditOffer.findFirst({ where: { seasonId: season.id, kind: "c3" }, select: { id: true } });
      const rows = [
        { at: "09.14 20:00", actor, action: "credit.offer_update", offer: c3, reason: "폴백 콘텐츠 확정, go/no-go 결과 반영", meta: { kind: "c3", from: "negotiating", to: "negotiating" } },
        { at: "10.05 11:30", actor, action: "credit.status", offer: c2, reason: "Vercel Meetup SDK 승인 메일", meta: { kind: "c2", from: "negotiating", to: "active" } },
        { at: "10.11 22:10", actor, action: "credit.codes_upload", offer: c1, reason: "스폰서 1차 전달분", meta: { kind: "c1", submitted: 80, added: 80 } },
        { at: "10.12 09:00", actor: null, action: "credit.batch", offer: c1, reason: "발급 가능 팀 일괄 발송", meta: { kind: "c1", teams: 31 } },
        { at: "10.13 09:00", actor: null, action: "credit.batch", offer: c2, reason: "발급 가능 팀 일괄 발송", meta: { kind: "c2", teams: 9 } },
      ];
      created.auditLog = [];
      for (const r of rows) {
        if (!r.offer) continue;
        const row = await prisma.auditLog.create({
          data: {
            actorId: r.actor,
            action: r.action,
            targetType: "credit_offer",
            targetId: r.offer.id,
            reason: r.reason,
            meta: r.meta,
            createdAt: at(r.at),
          },
          select: { id: true },
        });
        created.auditLog.push(String(row.id));
      }
      break;
    }
    case "leads":
      created.lead = await seedLeads(season.id);
      break;
    case "metrics:q": {
      /*
        시안 ① 큐 세 줄(3095행) — 두잇로그 급증, 모카브루 단일 채널, 골목마켓.
        골목마켓의 「체류 0초 비율 42%」는 우리 규칙에 없어 무효 세션 비율로 건다.
        날짜는 집계 픽스처(10.19~)가 안 쓰는 10.15 하루, 그 날 행이 없을 때만 심는다.
      */
      const day = new Date("2026-10-15T00:00:00Z");
      const seeds = [
        { team: "두잇로그", raw: 512, valid: 298, spike: 214, sessions: 512, channels: null },
        { team: "모카브루", raw: 455, valid: 455, spike: 0, sessions: 455, channels: [434, 21] },
        { team: "골목마켓", raw: 731, valid: 688, spike: 0, sessions: 1750, channels: null },
      ];
      created.metricDaily = [];
      created.metricChannel = [];
      for (const m of seeds) {
        const entryId = await entryOf(season.id, m.team);
        const had = await prisma.metricDaily.findFirst({ where: { entryId, metricDate: day }, select: { id: true } });
        if (had) continue;
        const row = await prisma.metricDaily.create({
          data: {
            entryId, metricDate: day, rawVisitors: m.raw, validVisitors: m.valid,
            spikeTrimmed: m.spike, sessions: m.sessions, batchAt: new Date(),
          },
          select: { id: true },
        });
        created.metricDaily.push(row.id);
        for (const [i, v] of (m.channels ?? []).entries()) {
          const ch = await prisma.metricChannelDaily.create({
            data: { entryId, metricDate: day, channel: i === 0 ? "threads" : "direct", visitors: v },
            select: { id: true },
          });
          created.metricChannel.push(ch.id);
        }
      }
      break;
    }
    case "metrics:empty": {
      /* 시안 ② — 큐에 오를 줄을 잠시 「누가 본 것」으로 돌려 큐를 비운다 */
      const actor = await adminId();
      const rows = await prisma.metricDaily.findMany({
        where: {
          entry: { seasonId: season.id },
          reviewedBy: null,
          OR: [{ spikeTrimmed: { gt: 0 } }, { botFiltered: { gt: 0 } }, { sessions: { gt: 0 } }],
        },
        select: { id: true },
      });
      await prisma.metricDaily.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { reviewedBy: actor },
      });
      return { screen, created, metricHidden: rows.map((r) => r.id) };
    }
    case "audit":
      /* 감사 로그 표(3190행)의 여섯 줄 — 대시보드에만 있는 10.19 공지 줄은 뺀다 */
      created.auditLog = await seedAudit(season.id, { only: (s) => s.action !== "notification.broadcast" });
      break;
    default:
      break;
  }
  return { screen, created };
}

export async function clearSandboxAdmin(f: AdminFixture): Promise<void> {
  assertSandbox();
  if (f.created.snapshot?.length) {
    await prisma.leaderboardSnapshot.deleteMany({ where: { id: { in: f.created.snapshot } } });
  }
  if (f.created.sanction?.length) {
    await prisma.sanction.deleteMany({ where: { id: { in: f.created.sanction } } });
  }
  if (f.created.abuseFlag?.length) {
    await prisma.abuseFlag.deleteMany({ where: { id: { in: f.created.abuseFlag } } });
  }
  if (f.metricHidden?.length) {
    await prisma.metricDaily.updateMany({ where: { id: { in: f.metricHidden } }, data: { reviewedBy: null } });
  }
  if (f.created.metricChannel?.length) {
    await prisma.metricChannelDaily.deleteMany({ where: { id: { in: f.created.metricChannel } } });
  }
  if (f.created.metricDaily?.length) {
    await prisma.metricDaily.deleteMany({ where: { id: { in: f.created.metricDaily } } });
  }
  if (f.created.notification?.length) {
    await prisma.notification.deleteMany({ where: { id: { in: f.created.notification } } });
  }
  if (f.created.judgment?.length) {
    await prisma.judgment.deleteMany({ where: { id: { in: f.created.judgment } } });
  }
  if (f.created.submission?.length) {
    await prisma.judgment.deleteMany({ where: { submissionId: { in: f.created.submission } } });
    await prisma.submission.deleteMany({ where: { id: { in: f.created.submission } } });
  }
  for (const b of f.submissionBefore ?? []) {
    await prisma.submission.update({
      where: { id: b.id },
      data: { status: b.status as never, submittedAt: b.submittedAt ? new Date(b.submittedAt) : null },
    });
  }
  for (const b of f.entryBefore ?? []) {
    await prisma.entry.update({
      where: { id: b.id },
      data: { status: b.status as never, stage: b.stage as never },
    });
  }
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
