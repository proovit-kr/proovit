import { prisma } from "../src/lib/prisma";

/*
  시즌1 시드.

  ⚠️ phase를 RECRUITING으로 두는 이유 — 06 §4.2와 「필요 페이지 정리」가 어긋난다.
     · 06의 9개 phase에는 '사전신청만 받는 단계'가 없다. 사전신청을 recruiting에 포함시킨다.
     · 그런데 「필요 페이지 정리」의 랜딩 CTA는 "모집 전 → 사전신청 / 모집 중 → apply"로
       두 상태를 구분한다.
     · DRAFT는 "비공개(운영자만)"라 랜딩 자체가 안 열리므로 쓸 수 없다.

  해법: phase는 RECRUITING으로 두고, 사전신청/참가신청 분기는 recruitStartAt으로 판단한다.
        recruitStartAt이 null이거나 아직 안 왔으면 사전신청, 지났으면 참가신청.
        enum을 늘리지 않고 이미 있는 컬럼으로 해결된다.
  → 회의에서 확정 필요.
*/
async function main() {
  const season = await prisma.season.upsert({
    where: { slug: "season-1" },
    update: {},
    create: {
      slug: "season-1",
      name: "시즌 1",
      phase: "RECRUITING",
      // 모집 시작일 미정 → 랜딩은 사전신청 CTA를 보여준다
      recruitStartAt: null,
      // 06 §4.4 시즌1 기본값. off면 네비게이션 숨김 + 라우트 직접 접근 시 404.
      featureFlags: {
        leaderboard: true,
        notifications: true,
        deposit: false, // 수요조사 대기 — 확정 시 변경
        testerAssignments: false, // 개발은 하되 시즌1 미사용
        credits: false, // 스폰서 확보 후
        sponsors: false,
        archive: false, // 시즌2부터 의미 있음
      },
      // 채점식은 09 운영 규정/심사 기준서 확정 후 채운다.
      scoringConfig: {},
    },
  });

  console.log(`시즌 시드 완료: ${season.slug} (${season.phase})`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
