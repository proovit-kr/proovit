import type { Metadata } from "next";

import { Footer } from "@/components/Footer";
import { Logo } from "@/components/NavBar";
import { requireOnboardedUser } from "@/lib/access";
import { findMyEntry } from "@/lib/apply-store";
import { prisma } from "@/lib/prisma";
import { getCurrentSeason, resolveLandingCta } from "@/lib/season";

import { ApplyForm } from "./ApplyForm";

import styles from "./apply.module.css";

/*
  참가 신청 — 회원이 참가자가 되는 자리다.

  화면이 세 갈래다:
    ① 모집 기간이 아니다        → 로그인을 요구하기 전에 먼저 말한다
    ② 이미 신청했다             → 접수 내역을 보여준다
    ③ 그 외                     → 신청 폼

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
  searchParams: Promise<{ done?: string }>;
}) {
  await searchParams;

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
              <span>모집이 시작되면 랜딩에서 바로 신청할 수 있습니다.</span>
              <span>사전 신청을 해두시면 모집 시작을 메일로 알려드립니다.</span>
            </p>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  const user = await requireOnboardedUser("/apply");

  const existing = await findMyEntry(user.id, season.id);
  if (existing) {
    return (
      <main className={`page ${styles.page}`}>
        <div className={`container container--narrow grow ${styles.wrap}`}>
          <div className={styles.head}>
            <Logo />
            <h1 className={styles.title}>참가 신청이 접수됐습니다</h1>
            <p className={styles.lead}>
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
            내용을 고치는 자리는 아직 없다 — 대시보드(DEV4)의 팀 관리 화면이
            그 자리다. 없는 링크를 걸어두면 404가 되므로 문장으로만 안내한다.
          */}
          <p className={styles.note}>
            팀 이름이나 참가작 정보를 고쳐야 하면 운영에 문의해 주세요. 대시보드가
            열리면 직접 수정할 수 있게 됩니다.
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
            <span>{season.name}에 참가할 팀과 참가작을 알려주세요.</span>
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
