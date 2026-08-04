import { Landing } from "@/components/Landing";
import { prisma } from "@/lib/prisma";
import { getCurrentSeason, resolveLandingCta } from "@/lib/season";

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

  const preRegisterCount = await prisma.lead.count({
    where: { seasonId: season.id },
  });

  return (
    <Landing
      seasonName={season.name}
      seasonTheme={season.theme}
      startAt={season.startAt?.toISOString() ?? null}
      cta={resolveLandingCta(season)}
      preRegisterCount={preRegisterCount}
    />
  );
}
