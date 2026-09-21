import type { Metadata } from "next";
import Link from "next/link";

import { LinkButton } from "@/components/Button";
import { Footer } from "@/components/Footer";
import { Logo, NavBar } from "@/components/NavBar";
import { requireUser } from "@/lib/access";
import { findMyEntry } from "@/lib/apply-store";
import { loadPublicNav } from "@/lib/header-read";
import { prisma } from "@/lib/prisma";
import { getCurrentSeason, resolveLandingCta } from "@/lib/season";
import { TEAM_FAILURE_MESSAGE } from "@/lib/team";
import { findInvite } from "@/lib/team-store";

import { ApplyDone } from "./ApplyDone";
import { ApplyForm } from "./ApplyForm";
import { JoinForm } from "./JoinForm";

import styles from "./apply.module.css";

/*
  참가 신청 — 회원이 참가자가 되는 자리다.

  화면이 네 갈래이고, 그중 둘이 시안에 있다:
    모집 기간이 아니다        → 로그인을 요구하기 전에 먼저 말한다 (시안 없음)
    초대 코드를 들고 왔다     → 합류 폼 (시안 없음)
    이미 신청했다             → 시안 ② 신청 완료
    그 외                     → 시안 ① 작성

  시안에 없는 둘은 아직 옛 골격(로고 + 좁은 기둥 + 푸터) 그대로다. 시안에 있는
  둘만 공개 헤더와 `.ap-wrap` 기둥으로 옮겼고 푸터가 없다 — 시안 `#scr-apply`에
  `.pub-foot`이 없다.

  합류 폼이 여기 있는 이유: 초대받은 사람은 **참가 기록이 없어** 대시보드로 못
  들어온다(`canAccess`가 404를 낸다). 합류는 「참가의 한 형태」라 이 화면이 그 자리다.

  모집 아님을 로그인 앞에 두는 이유: 모집도 안 하는데 로그인부터 시키면, 로그인을
  마친 사람이 "지금은 안 받습니다"를 보게 된다. 상태를 먼저 알리는 편이 맞다.

  ⚠️ 접근 판정은 서버에서만 한다(06 §5.2). 폼이 그려졌다는 사실이 권한이 아니며,
  제출은 서버 액션이 모집 기간·동의·중복을 다시 판정한다.
*/

export const metadata: Metadata = {
  title: "참가 신청",
  // 로그인 뒤의 화면이라 크롤러에게는 /login으로만 보인다. 색인할 값이 없다.
  robots: { index: false, follow: false },
};

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; invite?: string }>;
}) {
  const params = await searchParams;
  const inviteCode = params.invite?.trim() ?? "";

  const season = await getCurrentSeason();
  const open = season !== null && resolveLandingCta(season).kind === "APPLY";

  if (!open) {
    return (
      <main className={`page ${styles.page}`}>
        <div className={`container container--narrow grow ${styles.wrap}`}>
          <div className={styles.head}>
            <Logo />
            <h1 className={styles.title}>지금은 참가 신청을 받지 않습니다</h1>
            <p className={styles.lead}>
              <span>모집이 시작되면 이 화면에서 바로 신청할 수 있습니다.</span>
              <span>
                사전 신청을 해두시면 모집이 열리는 날 메일로 알려드립니다.
              </span>
            </p>
            {/*
              여기까지 온 사람은 참가 의사가 이미 확실하다. 그런데 이 화면에는
              할 수 있는 일이 없다 — 안내만 읽고 닫으면 모집이 열려도 다시 오지
              않는다. 사전 신청 폼이 어디 있는지 말로만 적어두면 랜딩으로 돌아가
              스스로 찾아야 하므로, 그 자리로 직접 보낸다.

              해시(#앵커)가 아니라 쿼리인 이유: 해시를 쓰면 브라우저가 그 요소를
              화면 맨 위에 붙이는 기본 점프를 하는데, 그게 우리 스크롤보다 늦게
              확정돼 이긴다. 입력란이 고정 헤더 밑으로 잘리고 그 아래 동의
              체크박스부터 보였다. 쿼리에는 그 기본 동작이 없다.

              도착 처리는 Landing.tsx의 preregister 효과가 한다 —
              입력란을 화면 중앙에 놓고 커서를 넣는다.
            */}
            <LinkButton href="/?preregister=1" size="lg" className={styles.cta}>
              사전 신청하기
            </LinkButton>
            <p className={styles.ctaNote}>
              랜딩 첫 화면의 이메일 칸으로 이동해 커서까지 놓아드립니다. 이메일
              주소 하나면 됩니다.
            </p>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  /* 초대 코드는 로그인을 거쳐 돌아올 때까지 들고 가야 한다 */
  const user = await requireUser(
    inviteCode ? `/apply?invite=${encodeURIComponent(inviteCode)}` : "/apply",
  );

  const existing = await findMyEntry(user.id, season.id);
  if (existing) {
    /*
      ② 신청 완료 — 시안 `#scr-apply[data-state="done"]`.

      옛 화면은 접수 내역을 `<dl>`로 늘어놓고 밑에 「운영에 문의」까지 달았다.
      시안은 ✓ · 제목 · 다음 걸음 한 줄 · 요약 카드 셋 · 대시보드 버튼이 전부다.
      빠진 값(접수 시각·한 줄 소개·1인 팀 표기)은 ApplyDone 주석에 적어 뒀다.
    */
    const nav = await loadPublicNav();
    return (
      <main className={`page ${styles.page}`}>
        <NavBar {...nav} />
        <div className={`${styles.apWrap} grow`}>
          <ApplyDone
            teamName={existing.team.name}
            ideaTitle={existing.ideaTitle}
            /* 초대 코드를 들고 왔는데 이미 참가 중이면 그 사유를 말한다 */
            inviteConflict={inviteCode ? true : undefined}
          />
        </div>
      </main>
    );
  }

  /*
    ③ 초대 코드로 온 사람.

    코드가 살아 있으면 무엇에 합류하는지(팀·참가작)를 보여주고 동의만 받는다.
    죽은 코드면 사유를 말하고 **신청 폼으로 내려보낸다** — 코드가 만료됐다고
    빈 화면을 주면 스스로 참가할 길까지 막힌다.
  */
  if (inviteCode) {
    const invite = await findInvite(inviteCode, season.id);

    return (
      <main className={`page ${styles.page}`}>
        <div className={`container container--narrow grow ${styles.wrap}`}>
          <div className={styles.head}>
            <Logo />
            <h1 className={styles.title}>
              {invite.ok ? `${invite.teamName}에 합류` : "팀에 합류하기"}
            </h1>
            <p className={styles.lead}>
              {invite.ok ? (
                <>
                  <span>참가작 「{invite.ideaTitle}」의 팀원으로 들어갑니다.</span>
                  <span>
                    팀 이름과 참가작은 팀장이 이미 등록했습니다. 동의만 확인해
                    주세요.
                  </span>
                </>
              ) : (
                <>
                  <span>{TEAM_FAILURE_MESSAGE[invite.code]}</span>
                  <span>코드를 다시 확인하거나, 직접 참가 신청도 할 수 있습니다.</span>
                </>
              )}
            </p>
          </div>

          <JoinForm defaultCode={inviteCode} />

          <p className={styles.note}>
            초대가 아니라 직접 참가하려면{" "}
            <Link href="/apply" className={styles.noteLink}>
              참가 신청 화면
            </Link>
            으로 가세요.
          </p>
        </div>
        <Footer />
      </main>
    );
  }

  /* 이미 팀장인 팀이 있으면 그 이름을 채워둔다(팀은 시즌을 넘어 유지된다) */
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      teamMembers: {
        where: { role: "leader" },
        select: { team: { select: { name: true } } },
        take: 1,
      },
    },
  });

  /*
    ① 작성 — 시안 `#scr-apply[data-state="form"]`.

    제목과 그 밑 한 줄은 시안이 `.ap-wrap` 직속으로 두므로 폼 바깥인 여기서
    그린다. 「시즌 1」은 박지 않고 `season.title`을 쓴다.

    ⚠️ 연락처(`users.phone`)를 더는 읽지 않는다 — 시안에 그 칸이 없다
    (09-21 수연 결정). 근거는 `lib/apply.ts` 머리 주석에 있다.
  */
  const nav = await loadPublicNav();

  return (
    <main className={`page ${styles.page}`}>
      <NavBar {...nav} />
      <div className={`${styles.apWrap} grow`}>
        <h1>{season.title} 참가 신청</h1>
        <p className={styles.ss}>
          아이디어만 있으면 참여할 수 있어요. 5분이면 끝나요.
        </p>

        <ApplyForm defaultTeamName={profile?.teamMembers[0]?.team.name ?? ""} />
      </div>
    </main>
  );
}
