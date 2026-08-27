import { prisma } from "../src/lib/prisma";

/*
  시즌1 시드.

  phase = pre_apply.

  8/12까지는 이 자리에 "06의 9개 phase에 사전신청 단계가 없어 RECRUITING +
  recruitStartAt으로 우회한다"는 주석이 있었다. 종결본(2026-08-13)이 phase에
  pre_apply를 넣으면서 그 우회가 사라졌다 — 랜딩 CTA가 phase 하나로 갈린다.

    pre_apply  → 사전신청(이메일 수집)
    recruiting → 참가신청(/apply 개방)

  전환은 season_schedules가 한다(ADR-010). 시즌1 캘린더가 아직 "잠정"이라
  일정 행을 만들지 않았다 — 확정되면 여기에 pre_apply·recruiting 두 행을 넣고,
  그때부터 크론이 phase를 옮긴다. 그전까지는 운영자가 직접 바꾼다.
*/
async function main() {
  const season = await prisma.season.upsert({
    where: { slug: "season-1" },
    update: {},
    create: {
      slug: "season-1",
      title: "시즌 1",
      phase: "pre_apply",
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

  /*
    스테이지 5개. PLN6 필드 정의서 v0.1(2026-08-13)이 정본이다.
    게이트는 s2·s5 둘뿐이고 s1·s3·s4는 제출만 받고 통과 처리로 넘어간다.
    제출 축(stage_key 5개)과 심사 축(is_gate 2개)을 한 값에 겸하지 않는다 —
    겸하면 리더보드·심사 콘솔에서 다섯 스테이지 전부에 판정이 있는 것처럼 보인다.

    opensAt·closesAt은 시즌 캘린더 확정 후에 채운다. s4 행의 opensAt이
    주차 기산일이라(거기서 7일씩 끊어 submissions.week를 센다) 그때까지
    s4 주간 제출은 열리지 않는다.
  */
  const stages = [
    { stageKey: "s1", name: "등록·아이디어 고도화", isGate: false },
    { stageKey: "s2", name: "랜딩·수요조사", isGate: true },
    { stageKey: "s3", name: "AI 빌드·배포", isGate: false },
    { stageKey: "s4", name: "마케팅·유저 유입", isGate: false },
    { stageKey: "s5", name: "트래픽·매출", isGate: true },
  ] as const;

  for (const stage of stages) {
    await prisma.stage.upsert({
      where: { seasonId_stageKey: { seasonId: season.id, stageKey: stage.stageKey } },
      update: { name: stage.name, isGate: stage.isGate },
      create: { seasonId: season.id, ...stage },
    });
  }

  /*
    혜택 카드 4장. 13 크레딧 센터 설계서 v0.1 3장이 고정한 구조다.

    **전부 협의 중으로 만든다.** 스폰서·금액·유효기간·코드 방식은 9/14 제휴
    go/no-go 뒤에야 정해진다(설계서 9장 미결). 그럴듯한 값을 채워 두면 그게
    스크린샷으로 돌아다니고, 우리가 아직 못 받은 제휴를 받은 것처럼 보인다.

    그래도 행을 만들어 두는 이유는 제휴가 0건이어도 혜택 탭이 열려야 하기
    때문이다(설계서 2장 「폴백 필수 출시」). 협의 중 카드는 폴백 가이드를 보여준다.
    폴백 목록은 운영자가 화면에서 채운다 — 무료 티어 구성도 확정 전이다.
  */
  const offers = [
    { kind: "c1", unlockEvent: "s1_submitted" },
    { kind: "c2", unlockEvent: "gate1_passed" },
    { kind: "c3", unlockEvent: "deploy_verified" },
    { kind: "c4", unlockEvent: "final_confirmed" },
  ] as const;

  for (const offer of offers) {
    await prisma.creditOffer.upsert({
      where: { seasonId_kind: { seasonId: season.id, kind: offer.kind } },
      /* 이미 있으면 손대지 않는다 — 운영자가 채운 값을 시드가 덮으면 안 된다 */
      update: {},
      create: {
        seasonId: season.id,
        kind: offer.kind,
        unlockEvent: offer.unlockEvent,
        status: "negotiating",
        deliveryMethod: "manual",
      },
    });
  }

  console.log(
    `시즌 시드 완료: ${season.slug} (${season.phase}) · 스테이지 ${stages.length}개 · 혜택 카드 ${offers.length}장(협의 중)`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
