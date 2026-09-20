import type { MetadataRoute } from "next";

import { TERMS } from "@/content/terms";
import { parseFeatureFlags } from "@/lib/feature-flags";
import { listPublicEntries } from "@/lib/public-read";
import { getCurrentSeason, isRacingOrLater } from "@/lib/season";

/*
  sitemap.xml.

  ⚠️ **접근 판정을 여기서 다시 쓰지 않는다.** 리더보드·참가작은 페이즈와
  기능 플래그로 열리고 닫히는데(access-policy.ts의 ROUTE_POLICY), 그 조건을
  이 파일에 손으로 옮겨 적으면 두 자리가 갈린다. 갈리는 순간 **아직 404인
  주소를 우리가 먼저 색인해 달라고 내미는** 꼴이 된다 — soft 404로 잡히고,
  나중에 진짜로 열렸을 때 신뢰를 깎아 먹는다.
  그래서 같은 술어(`isRacingOrLater`)와 같은 파서(`parseFeatureFlags`)를 부른다.

  `canAccess()`를 그대로 못 쓰는 이유는 그쪽이 뷰어(세션)를 전제하기 때문이다.
  사이트맵에는 뷰어가 없다 — 「로그인 안 한 사람에게 열려 있나」만 묻는다.

  로그인·신청·대시보드 계열은 애초에 넣지 않는다. 사이트맵은 「색인해 달라」는
  목록이지 라우트 목록이 아니다.
*/

/*
  한 시간마다 다시 뜬다. 기본값(빌드 시점 고정)으로 두면 시즌이 racing으로
  넘어가도 다음 배포 전까지 참가작 주소가 목록에 안 들어간다 — 관전 트래픽이
  가장 몰리는 구간을 통째로 놓친다.
*/
export const revalidate = 3600;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const url = (path: string) => `${siteUrl}${path}`;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const season = await getCurrentSeason();

  /*
    시즌과 무관하게 늘 열려 있는 것. 규칙·약관·개인정보는 참가 판단의 근거
    문서라 관전자도 읽는다.
  */
  const staticPages: MetadataRoute.Sitemap = [
    { url: url("/"), changeFrequency: "daily", priority: 1 },
    { url: url("/rules"), changeFrequency: "monthly", priority: 0.6 },
    { url: url("/privacy"), changeFrequency: "yearly", priority: 0.3 },
  ];

  /*
    ⚠️ `/terms`는 `TERMS`가 null이면 404다. 라우트가 있다고 넣으면 없는
    문서를 색인해 달라고 내미는 셈이다. 2026-09-21에 정본이 들어와 지금은
    화면·푸터와 함께 살아 있지만, 개정 중에 비우면 여기도 같이 빠진다.
  */
  if (TERMS) {
    staticPages.push({
      url: url("/terms"),
      changeFrequency: "yearly",
      priority: 0.3,
    });
  }

  if (!season) return staticPages;

  const flags = parseFeatureFlags(season.featureFlags);
  const racing = isRacingOrLater(season.phase);

  const seasonPages: MetadataRoute.Sitemap = [
    {
      url: url(`/seasons/${season.slug}`),
      lastModified: season.updatedAt,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];

  if (racing && flags.leaderboard) {
    seasonPages.push({
      url: url(`/seasons/${season.slug}/leaderboard`),
      /*
        순위는 스냅샷이 갱신될 때 바뀐다. season.updatedAt은 그와 무관하므로
        lastModified를 붙이지 않는다 — 안 바뀐 날짜를 붙이면 크롤러가 다시
        안 온다. 없으면 크롤러가 자기 주기로 판단한다.
      */
      changeFrequency: "daily",
      priority: 0.9,
    });
  }

  /* 참가작은 레이스부터 열린다. 그 전에는 존재 자체가 404다 */
  const entryPages: MetadataRoute.Sitemap = racing
    ? (await listPublicEntries(season.id)).map((entry) => ({
        url: url(`/projects/${entry.id}`),
        lastModified: entry.updatedAt,
        changeFrequency: "daily" as const,
        priority: 0.7,
      }))
    : [];

  return [...staticPages, ...seasonPages, ...entryPages];
}
