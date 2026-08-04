import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";

import { PrismaClient } from "@/generated/prisma/client";

/*
  Prisma 7은 드라이버 어댑터가 필수다.
  Neon 서버리스 드라이버를 쓰는 이유는 06 ARCHITECTURE §11 —
  Vercel Functions에서 커넥션이 고갈되는 것을 막기 위함이다.

  Neon 드라이버는 WebSocket으로 연결하는데, Node 런타임에는 전역 WebSocket이
  항상 있다고 보장할 수 없어 ws를 주입한다. 엣지 런타임에서는 내장 WebSocket을 쓴다.
*/
neonConfig.webSocketConstructor = ws;

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL이 설정되지 않았습니다. .env를 확인하세요.");
  }

  return new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
    // 개발 중에는 느린 쿼리를 눈으로 보고 싶다. 운영에서는 경고 이상만.
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });
}

/*
  개발 모드에서 파일이 바뀔 때마다 모듈이 다시 평가되므로,
  전역에 캐시하지 않으면 커넥션이 계속 쌓여 결국 DB가 연결을 거절한다.
*/
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
