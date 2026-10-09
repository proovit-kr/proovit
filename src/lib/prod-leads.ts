import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";

import { PrismaClient } from "@/generated/prisma/client";
import { LeadStatus } from "@/generated/prisma/enums";

/*
  운영 DB의 사전 신청 수.

  사전 신청 수는 KPI#1이라 **운영 DB의 행만 뜻이 있다.** 로컬·스테이징은 dev
  DB를 읽는데 거기 리드는 테스트로 넣은 것이라, 운영자 화면이 그 수를 보여 주면
  Neon에서 본 숫자와 어긋난다(2026-10-10 수연). 그래서 운영자 헤더와 대시보드
  KPI 카드는 운영 DB가 닿을 때 그쪽 수를 쓴다. 두 자리가 같은 규칙이라야
  헤더 1, 카드 2처럼 서로 어긋나지 않는다.

  켜는 조건은 `PROD_DATABASE_URL` 하나다(.env.example 「데이터베이스」). 운영
  배포에는 없으므로 운영은 자기 DB를 읽고, 로컬은 `.env.development.local`에,
  스테이징은 Vercel Preview(dev 브랜치) 환경변수에 넣어 둔다. DATABASE_URL과
  같은 주소면 굳이 두 번 붙지 않는다.

  시즌은 id가 아니라 **slug**로 맞춘다 — 두 DB의 시즌 id가 다르다.

  ⚠️ 절대 던지지 않는다. 운영 DB가 안 닿으면 null을 돌려주고 화면은 자기
  DB의 수로 돌아간다. 읽기만 한다. 리드 목록(/admin/leads)과 CSV는 운영
  이메일을 스테이징에 띄우는 일이라 여기 포함하지 않는다.
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

/** 운영 DB에서 그 시즌(slug)의 사전 신청 수. 꺼져 있거나 실패하면 null */
export async function prodLeadCount(seasonSlug: string): Promise<number | null> {
  if (!prodLeadsEnabled()) return null;
  try {
    return await client().lead.count({ where: { season: { slug: seasonSlug } } });
  } catch (error) {
    console.warn("[prod-leads] 운영 DB를 읽지 못해 로컬 수로 돌아간다", error);
    return null;
  }
}

export type ProdLeadStats = { total: number; week: number; unsubscribed: number };

/**
 * 운영 DB에서 그 시즌(slug)의 사전 신청 수 세 칸 — 누적·이번 주·수신거부.
 * 대시보드 KPI 카드(admin-read.ts)가 쓴다. 꺼져 있거나 실패하면 null.
 */
export async function prodLeadStats(
  seasonSlug: string,
  weekAgo: Date,
): Promise<ProdLeadStats | null> {
  if (!prodLeadsEnabled()) return null;
  try {
    const where = { season: { slug: seasonSlug } };
    const [total, week, unsubscribed] = await Promise.all([
      client().lead.count({ where }),
      client().lead.count({ where: { ...where, createdAt: { gte: weekAgo } } }),
      client().lead.count({ where: { ...where, status: LeadStatus.unsubscribed } }),
    ]);
    return { total, week, unsubscribed };
  } catch (error) {
    console.warn("[prod-leads] 운영 DB를 읽지 못해 로컬 수로 돌아간다", error);
    return null;
  }
}
