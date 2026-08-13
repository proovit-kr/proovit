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

  // 모집 기간 두 칸(recruitStartAt·recruitEndAt)은 2026-08-13에 없어졌다.
  // 페이즈 전환 시각의 정본이 season_schedules로 옮겨갔기 때문이다(ADR-010).
  // 화면이 "모집 D-N"을 그려야 하면 그 표를 읽는 필드를 여기에 새로 붙인다.
  return Response.json({
    season: {
      id: season.id,
      slug: season.slug,
      title: season.title,
      theme: season.theme,
      phase: season.phase,
      startsAt: season.startsAt,
      endsAt: season.endsAt,
      featureFlags: season.featureFlags,
    },
    cta: resolveLandingCta(season),
  });
}
