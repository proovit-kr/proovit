import type { Metadata } from "next";

import { SeasonPhase } from "@/generated/prisma/client";
import { Footer } from "@/components/Footer";
import { OrganizationJsonLd } from "@/components/JsonLd";
import { Landing, type LandingLive } from "@/components/Landing";
import { currentStage } from "@/lib/header-state";
import { prisma } from "@/lib/prisma";
import { loadLeaderboard } from "@/lib/public-read";
import { getCurrentSeason, publicHeaderSeason } from "@/lib/season";

/*
  랜딩. 서버 컴포넌트에서 시즌과 사전신청 수를 읽어 클라이언트 컴포넌트에 내려준다.

  Next.js를 택한 이유가 이 페이지의 SEO·OG(관전자 유입)였으므로,
  데이터 조회는 서버에서 하고 클라이언트에는 결과만 넘긴다.
*/
/*
  ISR. 기본값으로 두면 빌드 시점에 프리렌더돼 사전 신청 수와 CTA 상태가 그대로 굳는다.
  요청마다 렌더(force-dynamic)하면 관전 트래픽이 전부 DB 조회가 되므로,
  60초 주기 재생성으로 SEO(정적 HTML)와 최신성을 함께 가져간다.
  제출 직후의 숫자는 클라이언트에서 낙관적으로 올려 보여준다.
*/
export const revalidate = 60;

/*
  정규 URL.

  ⚠️ 랜딩만 canonical이 특히 필요하다. 헤더·시즌 상세의 사전신청 CTA가
  `/?preregister=1`로 걸려 있어서(header-state.ts `PREREGISTER`) 같은 문서가
  주소 둘로 돌아다닌다. 쿼리만 다른 중복으로 잡히면 유입이 두 주소로 갈린다.
  나머지 공개 화면도 같은 이유로 각자 자기 주소를 못박는다 — 광고·메일에서
  붙는 UTM 파라미터가 전부 같은 모양의 중복을 만든다.

  상대 경로로 적으면 layout.tsx의 `metadataBase`가 앞에 붙는다.
*/
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/*
  진행 중 전광판에 올릴 것 — 지금 스테이지, 상위 3팀, 참가팀 수.

  ⚠️ 순위를 여기서 매기지 않는다. 리더보드와 같은 조회(`loadLeaderboard`)에서
  스냅샷 순위가 있는 팀만 앞에서 셋을 자른다. 집계 전이면 빈 배열이다.
*/
async function loadLive(seasonId: string): Promise<LandingLive> {
  const [board, stages] = await Promise.all([
    loadLeaderboard(seasonId),
    prisma.stage.findMany({
      where: { seasonId },
      orderBy: { stageKey: "asc" },
      select: { stageKey: true, name: true, isGate: true, opensAt: true, closesAt: true },
    }),
  ]);
  const stage = currentStage(
    stages.map((s) => ({ ...s, key: s.stageKey })),
    new Date(),
  );
  return {
    stage: stage ? { key: stage.key, name: stage.name } : null,
    top: board.rows
      .filter((row) => row.rank !== null)
      .slice(0, 3)
      .map((row) => ({
        entryId: row.entryId,
        teamName: row.teamName,
        validVisitors: row.validVisitors,
      })),
    teams: board.rows.length,
  };
}

export default async function Home() {
  const season = await getCurrentSeason();

  if (!season) {
    // 열린 시즌이 없는 경우. 실제로는 시드가 항상 하나를 보장한다.
    return (
      <main className="page">
        <div className="container grow flex items-center justify-center">
          <p className="text-fg-dim">준비 중입니다.</p>
        </div>
      </main>
    );
  }

  const headerSeason = publicHeaderSeason(season);
  const [preRegisterCount, racingSchedule, live] = await Promise.all([
    prisma.lead.count({ where: { seasonId: season.id } }),
    /* 참가 신청 마감 = 레이스로 넘어가는 예정 시각(운영 헤더와 같은 정의) */
    prisma.seasonSchedule.findFirst({
      where: { seasonId: season.id, phase: SeasonPhase.racing },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true },
    }),
    headerSeason?.kind === "stage" ? loadLive(season.id) : null,
  ]);

  return (
    <>
      <OrganizationJsonLd />
      <Landing
        seasonName={season.title}
        headerSeason={headerSeason}
        seasonTheme={season.theme}
        startAt={season.startsAt?.toISOString() ?? null}
        preRegisterCount={preRegisterCount}
        recruitClosesAt={racingSchedule?.startsAt.toISOString() ?? null}
        live={live}
        footer={<Footer />}
      />
    </>
  );
}
