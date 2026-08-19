import { redirect } from "next/navigation";

import { getCurrentSeason } from "@/lib/season";

/*
  `/leaderboard` → 지금 시즌의 리더보드로 넘긴다.

  리더보드의 정본 주소는 `/seasons/:slug/leaderboard`다(시즌마다 따로 남아야
  아카이브가 성립한다). 그런데 헤더 메뉴와 옛 문서가 `/leaderboard`를 가리키고
  있어 눌리면 404가 났다.

  메뉴 쪽 주소를 고치지 않고 여기서 받는 이유는, 짧은 주소가 **밖으로 나가는
  주소**이기 때문이다 — 관전 유입을 위해 공유·홍보에 실릴 링크는 시즌 번호가
  안 붙은 쪽이고, 시즌이 바뀌어도 같은 링크가 살아 있어야 한다.

  시즌이 없으면 랜딩으로 보낸다. 404를 내면 "리그가 없어졌나"로 읽힌다.
*/

export default async function Page() {
  const season = await getCurrentSeason();
  if (!season) redirect("/");
  redirect(`/seasons/${season.slug}/leaderboard`);
}
