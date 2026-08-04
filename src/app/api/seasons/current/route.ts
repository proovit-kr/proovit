import { getCurrentSeason, resolveLandingCta } from "@/lib/season";

/*
  GET /api/seasons/current — 04 API 명세 §1

  랜딩의 CTA 분기 기준. 공개 엔드포인트다.
  DB를 읽으므로 프리렌더 대상이 아니며, 기본값(요청 시 실행)을 그대로 둔다.
*/
export async function GET() {
  const season = await getCurrentSeason();

  if (!season) {
    // 열린 시즌이 없어도 랜딩은 떠야 한다. 사전신청은 받을 수 없는 상태.
    return Response.json({ season: null, cta: { kind: "CLOSED" } });
  }

  return Response.json({
    season: {
      id: season.id,
      slug: season.slug,
      name: season.name,
      theme: season.theme,
      phase: season.phase,
      recruitStartAt: season.recruitStartAt,
      recruitEndAt: season.recruitEndAt,
      startAt: season.startAt,
      endAt: season.endAt,
      featureFlags: season.featureFlags,
    },
    cta: resolveLandingCta(season),
  });
}
