import type { Metadata } from "next";
import Link from "next/link";

import { LinkButton } from "@/components/Button";
import { Footer } from "@/components/Footer";
import { Logo } from "@/components/NavBar";
import { requireOnboardedUser } from "@/lib/access";
import { findMyEntry } from "@/lib/apply-store";
import { prisma } from "@/lib/prisma";
import { getCurrentSeason, resolveLandingCta } from "@/lib/season";
import { TEAM_FAILURE_MESSAGE } from "@/lib/team";
import { findInvite } from "@/lib/team-store";

import { ApplyForm } from "./ApplyForm";
import { JoinForm } from "./JoinForm";

import styles from "./apply.module.css";

/*
  참가 신청 — 회원이 참가자가 되는 자리다.

  화면이 네 갈래다:
    ① 모집 기간이 아니다        → 로그인을 요구하기 전에 먼저 말한다
    ② 이미 신청했다             → 접수 내역을 보여준다
    ③ 초대 코드를 들고 왔다     → 합류 폼 (동의 3종만 받는다)
    ④ 그 외                     → 신청 폼

  ③이 여기 있는 이유: 초대받은 사람은 **참가 기록이 없어** 대시보드로 못 들어온다
  (`canAccess`가 404를 낸다). 합류는 「참가의 한 형태」라 이 화면이 그 자리다.

  ①을 로그인 앞에 두는 이유: 모집도 안 하는데 로그인부터 시키면, 로그인을 마친
  사람이 "지금은 안 받습니다"를 보게 된다. 상태를 먼저 알리는 편이 맞다.

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

  /* 초대 코드는 로그인·온보딩을 거쳐 돌아올 때까지 들고 가야 한다 */
  const user = await requireOnboardedUser(
    inviteCode ? `/apply?invite=${encodeURIComponent(inviteCode)}` : "/apply",
  );

  const existing = await findMyEntry(user.id, season.id);
  if (existing) {
    return (
      <main className={`page ${styles.page}`}>
        <div className={`container container--narrow grow ${styles.wrap}`}>
          <div className={styles.head}>
            <Logo />
            <h1 className={styles.title}>참가 신청이 접수됐습니다</h1>
            <p className={styles.lead}>
              {/*
                초대 링크를 들고 왔는데 이미 참가 중인 경우다. 이 안내가 없으면
                코드를 넣을 자리를 찾다가 "왜 합류가 안 되지"로 끝난다 —
                한 사람이 두 팀에 있을 수 없는 것이 이유다(acceptInvite 주석).
              */}
              {inviteCode ? (
                <span>
                  이미 참가한 팀이 있어 다른 팀에 합류할 수 없습니다. 팀을
                  옮기려면 지금 팀에서 나온 뒤 다시 초대를 받아 주세요.
                </span>
              ) : null}
              <span>시즌 시작에 맞춰 진행 안내를 보내드립니다.</span>
            </p>
          </div>

          <dl className={styles.receipt}>
            <dt>팀</dt>
            <dd>
              {existing.team.name}
              {existing.team.isSolo ? " (1인 팀)" : null}
            </dd>
            <dt>참가작</dt>
            <dd>{existing.ideaTitle}</dd>
            {existing.ideaSummary ? (
              <>
                <dt>한 줄 소개</dt>
                <dd>{existing.ideaSummary}</dd>
              </>
            ) : null}
            <dt>접수 시각</dt>
            <dd>
              {/*
                시각은 분쟁 지점이라 초까지 남긴다. 표시 시간대는 서버 기준이며
                (Asia/Seoul), 저장은 timestamptz라 시간대가 함께 보존된다.
              */}
              {(existing.appliedAt ?? new Date()).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
              })}
            </dd>
          </dl>

          {/*
            신청을 마친 사람이 다음에 갈 곳은 대시보드다. 여기서 잇지 않으면
            주소를 외우지 않는 한 자기 진도로 돌아올 길이 없다 — 헤더에도
            푸터에도 대시보드 링크가 없기 때문이다.

            8/13에는 "없는 링크를 걸면 404가 되므로 문장으로만 안내한다"고
            적혀 있었다. 그때는 대시보드가 없었고, DEV4에서 들어왔다.
          */}
          <div className={styles.actions}>
            <LinkButton href="/dashboard" size="lg">
              대시보드로 이동
            </LinkButton>
            <span className={styles.actionsNote}>
              팀 구성과 측정 연동부터 하면 됩니다.
            </span>
          </div>

          <p className={styles.note}>
            참가작 정보를 고쳐야 하면 운영에 문의해 주세요. 팀 이름과 팀원은{" "}
            <Link href="/dashboard/team" className={styles.noteLink}>
              팀 관리
            </Link>
            에서 직접 바꿀 수 있습니다.
          </p>
        </div>
        <Footer />
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

  /*
    이미 팀장인 팀이 있으면 그 이름을 채워둔다(팀은 시즌을 넘어 유지된다).
    연락처도 이미 받은 값이 있으면 다시 치게 하지 않는다 — 카카오 로그인
    사용자는 나중에 provider가 준 번호로 미리 채우는 자리가 여기다.
  */
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      phone: true,
      teamMembers: {
        where: { role: "leader" },
        select: { team: { select: { name: true } } },
        take: 1,
      },
    },
  });

  return (
    <main className={`page ${styles.page}`}>
      <div className={`container container--narrow grow ${styles.wrap}`}>
        <div className={styles.head}>
          <Logo />
          <h1 className={styles.title}>참가 신청</h1>
          <p className={styles.lead}>
            <span>{season.title}에 참가할 팀과 참가작을 알려주세요.</span>
            <span>신청 후에도 시즌 시작 전까지는 내용을 고칠 수 있습니다.</span>
          </p>
        </div>

        <ApplyForm
          defaultTeamName={profile?.teamMembers[0]?.team.name ?? ""}
          defaultPhone={profile?.phone ?? ""}
        />
      </div>
      <Footer />
    </main>
  );
}
