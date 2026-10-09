import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";

import { PrismaClient } from "@/generated/prisma/client";
import { LeadStatus } from "@/generated/prisma/enums";

/*
  운영 DB의 사전 신청 리드.

  사전 신청 수는 KPI#1이라 **운영 DB의 행만 뜻이 있다.** 로컬·스테이징은 dev
  DB를 읽는데 거기 리드는 테스트로 넣은 것이라, 운영자 화면이 그 수를 보여 주면
  Neon에서 본 숫자와 어긋난다(2026-10-10 수연). 그래서 운영자 헤더·대시보드
  KPI 카드·리드 화면(카드·표·CSV)은 운영 DB가 닿을 때 그쪽을 읽는다. 네 자리가
  같은 규칙이라야 헤더 1, 카드 2처럼 서로 어긋나지 않는다.

  켜는 조건은 `PROD_DATABASE_URL` 하나다(.env.example 「데이터베이스」). 운영
  배포에는 없으므로 운영은 자기 DB를 읽고, 로컬은 `.env.development.local`에,
  스테이징은 Vercel Preview(dev 브랜치) 환경변수에 넣어 둔다. DATABASE_URL과
  같은 주소면 굳이 두 번 붙지 않는다.

  시즌은 id가 아니라 **slug**로 맞춘다 — 두 DB의 시즌 id가 다르다.

  ⚠️ 절대 던지지 않는다. 운영 DB가 안 닿으면 null을 돌려주고 화면은 자기
  DB로 돌아간다. 읽기만 한다 — CSV 내려받기의 감사 로그는 자기 DB에 남는다.
*/

export function prodLeadsEnabled(): boolean {
  const url = process.env.PROD_DATABASE_URL;
  return Boolean(url && url !== process.env.DATABASE_URL);
}

/* prisma.ts와 같은 이유로 전역에 하나만 둔다 — HMR마다 커넥션이 쌓이지 않게 */
const globalForProd = globalThis as unknown as { prodPrisma?: PrismaClient };

function client(): PrismaClient {
  if (globalForProd.prodPrisma) return globalForProd.prodPrisma;
  neonConfig.webSocketConstructor = ws;
  const created = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: process.env.PROD_DATABASE_URL! }),
    log: ["warn", "error"],
  });
  globalForProd.prodPrisma = created;
  return created;
}

/** 꺼져 있으면 null, 읽다가 실패해도 null — 부르는 쪽이 자기 DB로 돌아간다 */
async function readProd<T>(read: (db: PrismaClient) => Promise<T>): Promise<T | null> {
  if (!prodLeadsEnabled()) return null;
  try {
    return await read(client());
  } catch (error) {
    console.warn("[prod-leads] 운영 DB를 읽지 못해 로컬 수로 돌아간다", error);
    return null;
  }
}

const bySeason = (seasonSlug: string) => ({ season: { slug: seasonSlug } });

/** 운영 DB에서 그 시즌(slug)의 사전 신청 수 — 운영자 헤더. 꺼져 있거나 실패하면 null */
export function prodLeadCount(seasonSlug: string): Promise<number | null> {
  return readProd((db) => db.lead.count({ where: bySeason(seasonSlug) }));
}

export type ProdLeadStats = { total: number; week: number; unsubscribed: number };

/**
 * 운영 DB에서 그 시즌(slug)의 사전 신청 수 세 칸 — 누적·이번 주·수신거부.
 * 대시보드 KPI 카드(admin-read.ts)가 쓴다. 꺼져 있거나 실패하면 null.
 */
export function prodLeadStats(seasonSlug: string, weekAgo: Date): Promise<ProdLeadStats | null> {
  const where = bySeason(seasonSlug);
  return readProd(async (db) => {
    const [total, week, unsubscribed] = await Promise.all([
      db.lead.count({ where }),
      db.lead.count({ where: { ...where, createdAt: { gte: weekAgo } } }),
      db.lead.count({ where: { ...where, status: LeadStatus.unsubscribed } }),
    ]);
    return { total, week, unsubscribed };
  });
}

/** 리드 화면 표 한 줄(admin-read.ts `AdminLeadRow`와 같은 모양) */
const LEAD_ROW = {
  id: true,
  email: true,
  sourceChannel: true,
  utmSource: true,
  marketingOptIn: true,
  unsubscribedAt: true,
  createdAt: true,
} as const;

export type ProdLeadPage = {
  rows: {
    id: string;
    email: string;
    sourceChannel: string | null;
    utmSource: string | null;
    marketingOptIn: boolean;
    unsubscribedAt: Date | null;
    createdAt: Date;
  }[];
  total: number;
  todayCount: number;
  optIn: number;
};

/**
 * 운영 DB에서 리드 화면 전체 — 표 행(최신순 `take`건)과 카드 세 칸(누적·오늘·
 * 마케팅 동의). 「오늘」은 `[dayStart, dayStart+24h)`. 꺼져 있거나 실패하면 null.
 */
export function prodLeadPage(
  seasonSlug: string,
  dayStart: Date,
  take: number,
): Promise<ProdLeadPage | null> {
  const where = bySeason(seasonSlug);
  return readProd(async (db) => {
    const [rows, total, todayCount, optIn] = await Promise.all([
      db.lead.findMany({ where, orderBy: { createdAt: "desc" }, take, select: LEAD_ROW }),
      db.lead.count({ where }),
      db.lead.count({
        where: { ...where, createdAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 86_400_000) } },
      }),
      db.lead.count({ where: { ...where, marketingOptIn: true, unsubscribedAt: null } }),
    ]);
    return { rows, total, todayCount, optIn };
  });
}

/** CSV 한 줄에 싣는 칸(export/route.ts와 같은 모양) */
const LEAD_EXPORT = {
  email: true,
  marketingOptIn: true,
  unsubscribedAt: true,
  utmSource: true,
  utmMedium: true,
  utmCampaign: true,
  sourceChannel: true,
  createdAt: true,
} as const;

export type ProdLeadExportRow = {
  email: string;
  marketingOptIn: boolean;
  unsubscribedAt: Date | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  sourceChannel: string | null;
  createdAt: Date;
};

/** 운영 DB에서 CSV 내보내기 행 전부(오래된 순). 꺼져 있거나 실패하면 null */
export function prodLeadExportRows(seasonSlug: string): Promise<ProdLeadExportRow[] | null> {
  return readProd((db) =>
    db.lead.findMany({ where: bySeason(seasonSlug), orderBy: { createdAt: "asc" }, select: LEAD_EXPORT }),
  );
}
