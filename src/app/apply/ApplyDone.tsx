import { LinkButton } from "@/components/Button";
import { Clauses } from "@/components/Clauses";
import { Card } from "@/components/Surface";

import styles from "./ApplyDone.module.css";

/*
  참가 신청 ② 신청 완료 — 시안 ver4 `#scr-apply[data-state="done"]`의
  `.only-done.ap-done`(시안 2121~2130행).

  시안은 ✓ 마크 · 제목 · 다음 걸음 한 줄 · 요약 카드 셋 · 대시보드 버튼이
  전부다. 옛 화면이 갖고 있던 접수 시각·한 줄 소개·하단 안내문은 시안에
  없어서 여기 옮기지 않았다.

  ⚠️ 바깥 기둥(`.ap-wrap`)은 ① 작성과 공용이라 page.tsx가 두른다. 이 컴포넌트는
  그 안쪽만 그린다.
*/

export function ApplyDone({
  teamName,
  ideaTitle,
  /*
    시안 값은 「자유 주제」다. 시즌1은 단일 트랙이라 `entries.trackId`가 null로
    남고(schema.prisma의 Track 주석, lib/apply.ts), `getCurrentSeason()`도
    tracks를 안 물고 온다 — 지금은 넘겨줄 값 자체가 없다. 그래서 기본값을 두되
    프롭으로 열어 둔다. 트랙이 둘 이상이 되면 그때 `entry.track.name`을 넘긴다
    (시즌 상세 화면이 `season.tracks[0]?.name ?? season.theme ?? "자유 주제"`로
    같은 자리를 메우고 있다).
  */
  trackName = "자유 주제",
  inviteConflict,
}: {
  teamName: string;
  ideaTitle: string;
  trackName?: string;
  /** 초대 코드를 들고 왔는데 이미 참가 중인 경우의 안내. 없으면 안 그린다 */
  inviteConflict?: boolean;
}) {
  return (
    <div className={styles.done}>
      {/* 제목이 이미 「완료」라 마크는 장식이다 — 스크린리더가 「체크」를 또 읽지 않게 한다 */}
      <div className={styles.mk} aria-hidden="true">
        ✓
      </div>
      <h2>참가 신청 완료!</h2>
      <p>
        {/* 쉼표 뒤에서만 끊기게 한다 — 안 감싸면 「시작해요,」가 줄 끝에 홀로 남는다 */}
        <Clauses text="대시보드에서 온보딩을 시작해요, 팀 구성 → 측정 연동 순서예요." />
      </p>
      {inviteConflict ? (
        <p className={styles.conflict}>
          <Clauses text="이미 참가한 팀이 있어 다른 팀에 합류할 수 없어요, 팀을 옮기려면 지금 팀에서 나온 뒤 다시 초대를 받아 주세요." />
        </p>
      ) : null}
      <Card className={styles.sum}>
        <div>
          <span>팀명</span>
          <b>{teamName}</b>
        </div>
        <div>
          <span>아이디어</span>
          <b>{ideaTitle}</b>
        </div>
        <div>
          <span>트랙</span>
          <b>{trackName}</b>
        </div>
      </Card>
      {/*
        시안은 버튼 크기를 자리마다 인라인으로 준다(Button.tsx 주석). 여기 값
        `padding:13px 26px`은 `lg`(13px 24px)와 좌우가 2px 다르다 — size로
        반올림하지 않고 시안 값을 그대로 붙인다. font-size는 시안이 안 건드려
        `.btn` 기본 14.5px 그대로다.
      */}
      <LinkButton href="/dashboard" style={{ padding: "13px 26px" }}>
        대시보드로 이동
      </LinkButton>
    </div>
  );
}
