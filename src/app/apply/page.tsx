import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AnchorButton, LinkButton } from "@/components/Button";
import { Clauses } from "@/components/Clauses";
import { CONTACT, Footer } from "@/components/Footer";
import { Logo, NavBar } from "@/components/NavBar";
import { getSessionUser, requireUser } from "@/lib/access";
import { findMyEntry } from "@/lib/apply-store";
import { loadPublicNav } from "@/lib/header-read";
import { LATE_PASS_MESSAGE } from "@/lib/late-entry";
import { loadApplyGate } from "@/lib/late-entry-store";
import { prisma } from "@/lib/prisma";
import { getCurrentSeason } from "@/lib/season";
import { isRacing } from "@/lib/season-phase";
import { isJoinPhase, joinWindowClosed, TEAM_FAILURE_MESSAGE } from "@/lib/team";
import { findInvite, loadJoinWindow } from "@/lib/team-store";

import { ApplyDone } from "./ApplyDone";
import { ApplyForm } from "./ApplyForm";
import { JoinForm } from "./JoinForm";

import styles from "./apply.module.css";

/*
  참가 신청 — 회원이 참가자가 되는 자리다.

  화면이 여섯 갈래이고, 그중 둘이 시안에 있다:
    받는 기간이 아니다        → 로그인을 요구하기 전에 먼저 말한다 (시안 없음)
      레이스 중이면           → 운영팀에 문의하는 길을 준다 (시안 없음, PRD OPEN-6)
    죽은 편입 링크를 들고 왔다 → 사유만 말한다, 로그인 전 (시안 없음)
    초대 코드를 들고 왔다     → 합류 폼 (시안 없음)
    이미 신청했다             → 시안 ② 신청 완료
    그 외                     → 시안 ① 작성 (모집 중, 또는 레이스 중 유효한 편입 링크)

  시안에 없는 것들은 아직 옛 골격(로고 + 좁은 기둥 + 푸터) 그대로다. 시안에 있는
  둘만 공개 헤더와 `.ap-wrap` 기둥으로 옮겼고 푸터가 없다 — 시안 `#scr-apply`에
  `.pub-foot`이 없다.

  합류 폼이 여기 있는 이유: 초대받은 사람은 **참가 기록이 없어** 대시보드로 못
  들어온다(`canAccess`가 404를 낸다). 합류는 「참가의 한 형태」라 이 화면이 그 자리다.
  초대 메일의 링크도 여기다(`mail.ts`의 `/apply?invite=`).

  ✅ **받는 기간이 신청과 합류에서 다르다**(2026-09-25 수연 지시 · PRD FR-B3).
    새 참가 신청 — 모집 구간에만. 레이스 중에는 운영자가 준 **지각 편입 링크**
                   (`?late=`)를 들고 온 사람만(2026-09-26 수연 지시 · PRD OPEN-6).
                   submitApply와 같은 판정(`loadApplyGate`)이다.
    합류         — 합류 페이즈(`isJoinPhase` — 모집·레이스)에 **초대 코드를 들고 온
                   사람**. 팀별로 s2 제출 전까지다(`joinClosedCode`, findInvite가
                   사유로 돌려준다). 합류 액션(join-actions)도 같은 두 함수를 본다.
                   → 2026-09-26 뒤집음: 팀별 진도가 아니라 **s1 달력 마감까지**다
                   (수연 지시 「절대 날짜로」). findInvite가 수락과 같은
                   `loadJoinWindow`로 마감을 읽어 판정한다.
  그래서 레이스 중에는 **편입 링크 없이는 신청 폼을 절대 그리지 않는다.** 코드가
  죽었거나 합류가 마감됐으면 사유만 말한다 — 모집 중처럼 「직접 참가 신청」으로
  내려보내면 닫힌 폼에 닿는다. 코드 없이 오면 모집 아님 화면 그대로다.

  ⚠️ access-policy의 `apply` 정책은 이 화면도 액션도 부르지 않는다(테스트만 부른다).
  위 두 기간은 여기서 직접 가르므로, 그 정책을 고쳐도 이 화면은 안 바뀐다.

  받는 기간이 아님을 로그인 앞에 두는 이유: 모집도 안 하는데 로그인부터 시키면,
  로그인을 마친 사람이 "지금은 안 받습니다"를 보게 된다. 상태를 먼저 알리는 편이 맞다.

  ⚠️ 접근 판정은 서버에서만 한다(06 §5.2). 폼이 그려졌다는 사실이 권한이 아니며,
  제출은 서버 액션이 기간·동의·중복을 다시 판정한다.
*/

export const metadata: Metadata = {
  title: "참가 신청",
  // 로그인 뒤의 화면이라 크롤러에게는 /login으로만 보인다. 색인할 값이 없다.
  robots: { index: false, follow: false },
};

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{
    done?: string | string[];
    invite?: string | string[];
    late?: string | string[];
  }>;
}) {
  const params = await searchParams;
  /*
    `?late=a&late=b`처럼 키가 반복되면 Next가 배열로 준다 — 그대로 `.trim()`을 부르면
    화면이 500으로 죽는다. 문자열 하나일 때만 코드로 받고, 아니면 코드 없이 온 것이다.
  */
  const one = (v: string | string[] | undefined) =>
    typeof v === "string" ? v.trim() : "";
  const inviteCode = one(params.invite);
  const lateCode = one(params.late);

  const season = await getCurrentSeason();
  /*
    새 참가 신청 — 신청 액션(apply-store)과 **같은 함수**(`loadApplyGate`)다.
      open    모집 중. 편입 링크를 들고 와도 평소 신청이다
      late    레이스 중인데 유효한 편입 링크를 들고 왔다
      closed  받지 않는다. `failure`가 있으면 링크가 죽은 사유
    초대 코드를 들고 왔으면 편입 링크는 보지 않는다 — 초대 흐름은 그대로 둔다.
  */
  const gate = await loadApplyGate(season, inviteCode ? null : lateCode);
  const applyOpen = gate.kind === "open";
  const lateOpen = gate.kind === "late";
  /*
    신청은 닫혔지만 합류는 열린 때 초대 링크로 온 사람(지금은 레이스 중). 페이즈는
    합류 액션과 같은 `isJoinPhase`로 본다 — 따로 적으면 한쪽만 넓어진다. 팀이 아직
    받는지는 로그인 뒤에 findInvite가 초대가 가리키는 팀의 진도로 판정한다.

    → 2026-09-26: 진도가 아니라 s1 달력 마감이다(findInvite → `loadJoinWindow`).
    마감은 시즌 전체의 날짜라 로그인 앞에서도 알 수 있지만 여기서는 끊지 않는다 —
    위의 「받지 않습니다」 화면은 모집·사전 신청을 말해서, 레이스 중 초대받은 사람에게
    틀린 안내가 된다. 로그인 뒤 ③이 「s1 마감까지만」을 그대로 말한다. 내가 정함(수연
    확인 대기).
    → 2026-09-26 뒤집음(리뷰 지적): **로그인 앞에서 끊는다.** 마감이 지났는데 로그인
    (처음이면 소셜 가입과 약관 동의)부터 시키면, 다 마친 사람이 「합류 기간이 끝났다」를
    본다 — 받는 기간이 아님을 로그인 앞에 두는 이 화면의 원칙(머리 주석)과 같다.
    막힌 것은 「받지 않습니다」 화면의 재사용이었으므로, 그 화면이 아니라 ③의 사유
    화면과 같은 모양의 한 줄 화면(`JoinBlocked`)을 쓴다. 판정은 시즌 전체의 사유만
    보는 `joinWindowClosed`다 — 초대 코드는 풀지 않는다(마감 뒤에는 어느 코드든 같다).
    내가 정함(수연 확인 대기).
  */
  const lateJoin =
    season !== null &&
    !applyOpen &&
    isJoinPhase(season.phase) &&
    inviteCode !== "";

  if (!season || (!applyOpen && !lateJoin && !lateOpen)) {
    const deadLink = season && gate.kind === "closed" ? gate.failure : null;
    const racing = season !== null && isRacing(season.phase);

    /*
      죽은 편입 링크를 들고 왔거나 레이스 중이면, **로그인한 사람이 이미 참가 중일 때
      신청 완료 판**을 그린다. 링크로 신청을 마친 사람이 그 링크로 되돌아오고
      (actions.ts의 redirect) — 방금 자기가 쓴 링크를 「이미 사용됨」이라고 들으면
      신청이 안 된 줄 안다. 레이스 중의 참가자에게 아래 「운영팀에 문의」를 보이지
      않으려는 것도 같다.
    */
    if (season && (deadLink || racing)) {
      const viewer = await getSessionUser();
      const mine = viewer ? await findMyEntry(viewer.id, season.id) : null;
      if (mine) {
        return <DoneScreen teamName={mine.team.name} ideaTitle={mine.ideaTitle} />;
      }
    }

    /*
      죽은 편입 링크(없음·사용됨·취소됨·만료·기간 아님) — 사유만 말하고 폼은 없다.
      로그인 앞에 두는 이유는 아래 「받는 기간 아님」과 같다.
    */
    if (deadLink) {
      return (
        <main className={`page ${styles.page}`}>
          <div className={`container container--narrow grow ${styles.wrap}`}>
            <div className={styles.head}>
              <Logo />
              <h1 className={styles.title}>편입 링크로 참가할 수 없습니다</h1>
              <p className={styles.lead}>
                {/* 두 문장짜리 사유가 있다 — 문장 끝에서만 끊는다(AGENTS.md 줄바꿈 검사) */}
                <Clauses text={LATE_PASS_MESSAGE[deadLink]} />
              </p>
            </div>
          </div>
          <Footer />
        </main>
      );
    }

    /*
      레이스 중에 링크 없이 왔다 — 대시보드의 지각 판(시안 h10)의 「팀 구성하기」도
      여기로 온다. 새 신청은 열지 않지만(PRD OPEN-6, 문을 여는 것은 운영자의 편입
      링크뿐) 막다른 길로 두지 않고 **문의하는 길**을 준다. 아래 「모집이 시작되면」·
      「사전 신청」은 모집 전의 말이라 레이스 중에는 틀리다(2026-09-26 리뷰 지적).
      시안에 없는 화면이다. 문안은 내가 정함(윤서 확인 대기) — 편입 링크가 나가는지는
      s1 구간이 남았는지에 달려 있어서 「보내 드린다」고 약속하지 않고 「확인해 알려 드린다」로 둔다.
    */
    if (racing) {
      return (
        <main className={`page ${styles.page}`}>
          <div className={`container container--narrow grow ${styles.wrap}`}>
            <div className={styles.head}>
              <Logo />
              <h1 className={styles.title}>모집이 끝났습니다</h1>
              <p className={styles.lead}>
                <span>레이스가 이미 시작되어 새 참가 신청은 받지 않습니다.</span>
                <span>
                  {/* 두 문장이다 — 문장 끝에서만 끊는다(AGENTS.md 줄바꿈 검사) */}
                  <Clauses text="지금 참가하고 싶으시면 운영팀에 문의해 주세요. 참가할 수 있는지 확인해 알려드립니다." />
                </span>
              </p>
              <AnchorButton href={`mailto:${CONTACT}`} size="lg" className={styles.cta}>
                운영팀에 문의하기
              </AnchorButton>
              <p className={styles.ctaNote}>
                메일 앱이 열리지 않으면 {CONTACT}로 보내 주세요.
              </p>
            </div>
          </div>
          <Footer />
        </main>
      );
    }

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
              사전 신청
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

  /* 레이스 중 초대 링크 — 합류 기간이 이미 끝났으면 로그인 앞에서 말한다(위 lateJoin 주석) */
  const lateClosed = lateJoin
    ? joinWindowClosed(await loadJoinWindow(season))
    : null;
  if (lateClosed) {
    return <JoinBlocked message={TEAM_FAILURE_MESSAGE[lateClosed]} />;
  }

  /* 초대 코드·편입 링크는 로그인을 거쳐 돌아올 때까지 들고 가야 한다 */
  const user = await requireUser(
    inviteCode
      ? `/apply?invite=${encodeURIComponent(inviteCode)}`
      : gate.kind === "late"
        ? `/apply?late=${encodeURIComponent(gate.code)}`
        : "/apply",
  );

  const existing = await findMyEntry(user.id, season.id);
  if (existing) {
    /*
      이미 이번 시즌에 참가 중이면 편입 링크를 들고 왔어도 여기서 끝난다 — 링크는
      쓰이지 않고 대기로 남는다(운영자가 목록에서 취소할 수 있다).
    */
    return (
      <DoneScreen
        teamName={existing.team.name}
        ideaTitle={existing.ideaTitle}
        /* 초대 코드를 들고 왔는데 이미 참가 중이면 그 사유를 말한다 */
        inviteConflict={inviteCode ? true : undefined}
      />
    );
  }

  /*
    ③ 초대 코드로 온 사람.

    코드가 살아 있으면 무엇에 합류하는지(팀·참가작)를 보여주고 동의만 받는다.

    죽은 코드거나 합류가 마감됐으면 사유를 말한다. 그다음이 기간마다 다르다.
      모집 중 — 코드 칸을 남기고 **신청 폼으로 내려보낸다.** 코드가 만료됐다고
                빈 화면을 주면 스스로 참가할 길까지 막힌다.
      레이스 중 — 사유만 말한다. 신청이 닫혀 있어 내려보낼 곳이 없고, 코드 칸도
                안 둔다(새 초대는 팀장이 메일로 다시 보낸다 — 링크가 여기로 온다).
  */
  if (inviteCode) {
    const invite = await findInvite(inviteCode, season);

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
                  {applyOpen ? (
                    <span>
                      코드를 다시 확인하거나, 직접 참가 신청도 할 수 있습니다.
                    </span>
                  ) : null}
                </>
              )}
            </p>
          </div>

          {invite.ok || applyOpen ? <JoinForm defaultCode={inviteCode} /> : null}

          {applyOpen ? (
            <p className={styles.note}>
              초대가 아니라 직접 참가하려면{" "}
              <Link href="/apply" className={styles.noteLink}>
                참가 신청 화면
              </Link>
              으로 가세요.
            </p>
          ) : null}
        </div>
        <Footer />
      </main>
    );
  }

  /*
    여기부터는 새 참가 신청이다. 레이스 중(`lateJoin`)에는 초대 코드가 늘 있어서
    위에서 끝난다 — 모집 구간도 유효한 편입 링크도 아닌데 여기 닿는 길은 없다.
    그래도 한 줄로 막아 둔다: 위 갈래를 고치다 새면 레이스 중에 신청 폼이 그려진다.
  */
  if (!applyOpen && !lateOpen) notFound();

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

    편입 링크로 왔어도 **같은 폼**이다 — 팀명·아이디어·동의를 본인이 직접 쓴다
    (운영자가 대신 만들지 않는 이유가 동의다, schema.prisma LateEntryPass 주석).
    코드만 숨은 칸으로 싣는다. 경고 배너는 신청 뒤 대시보드의 지각 판(h10)이 그린다.
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

        <ApplyForm
          defaultTeamName={profile?.teamMembers[0]?.team.name ?? ""}
          lateCode={gate.kind === "late" ? gate.code : undefined}
        />
      </div>
    </main>
  );
}

/**
 * ② 신청 완료 — 시안 `#scr-apply[data-state="done"]`.
 *
 * 옛 화면은 접수 내역을 `<dl>`로 늘어놓고 밑에 「운영에 문의」까지 달았다.
 * 시안은 ✓ · 제목 · 다음 걸음 한 줄 · 요약 카드 셋 · 대시보드 버튼이 전부다.
 * 빠진 값(접수 시각·한 줄 소개·1인 팀 표기)은 ApplyDone 주석에 적어 뒀다.
 *
 * 부르는 자리가 둘이라(이미 참가 중 · 방금 쓴 편입 링크로 돌아옴) 한 벌로 둔다.
 */
async function DoneScreen({
  teamName,
  ideaTitle,
  inviteConflict,
}: {
  teamName: string;
  ideaTitle: string;
  inviteConflict?: boolean;
}) {
  const nav = await loadPublicNav();
  return (
    <main className={`page ${styles.page}`}>
      <NavBar {...nav} />
      <div className={`${styles.apWrap} grow`}>
        <ApplyDone
          teamName={teamName}
          ideaTitle={ideaTitle}
          inviteConflict={inviteConflict}
        />
      </div>
    </main>
  );
}

/*
  합류를 받을 수 없을 때의 한 줄 화면 — 로그인 앞(레이스 중 합류 기간이 끝났을 때).
  ③에서 코드가 막혔을 때 레이스 중 모양(제목 「팀에 합류하기」 + 사유 한 줄, 폼 없음)과
  같다. 「받지 않습니다」 화면은 모집·사전 신청을 안내해서 여기 쓰지 않는다.
*/
function JoinBlocked({ message }: { message: string }) {
  return (
    <main className={`page ${styles.page}`}>
      <div className={`container container--narrow grow ${styles.wrap}`}>
        <div className={styles.head}>
          <Logo />
          <h1 className={styles.title}>팀에 합류하기</h1>
          <p className={styles.lead}>
            <span>{message}</span>
          </p>
        </div>
      </div>
      <Footer />
    </main>
  );
}
