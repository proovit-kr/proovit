import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Footer } from "@/components/Footer";
import { Logo } from "@/components/NavBar";
import { requireUser, safeNext } from "@/lib/access";

import { OnboardingForm } from "./OnboardingForm";

import styles from "./onboarding.module.css";

/*
  온보딩 — 소셜 가입 직후 실명·닉네임을 받는 화면.

  왜 필요한가: 소셜 제공자가 이름을 안 줄 수 있어 가입 시점에는 이메일
  아이디로 갈음하고 onboarded_at을 null로 남긴다(auth-adapter.ts).
  users.name·nickname이 둘 다 NOT NULL이라 이 갈음이 없으면 소셜 가입 자체가
  터진다. 그 임시값을 진짜 값으로 바꾸는 자리가 여기다.

  왜 /apply가 아니라 전용 화면인가: 참가 신청을 하지 않는 사람(심사위원·운영자)도
  이름이 필요하다. /apply에 흡수하면 그 사람들은 영원히 이메일 아이디로 남는다.

  필수 동의 3종은 여기서 받지 않는다 — /apply(DEV3)의 요건이다.
*/

export const metadata: Metadata = {
  title: "시작하기",
  // 로그인 뒤에만 닿는 화면이라 검색에 잡힐 이유가 없다.
  robots: { index: false, follow: false },
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  /*
    ⚠️ 자기 자신을 목적지로 삼으면 무한 리다이렉트가 된다.
    온보딩을 마친 사람이 ?next=/onboarding 으로 들어오면 아래 redirect가
    이 화면을 다시 부르고 같은 판정이 또 걸린다. 걸러서 랜딩으로 보낸다.
  */
  const requested = safeNext(next);
  const target =
    requested && !requested.startsWith("/onboarding") ? requested : "/";

  const user = await requireUser(
    `/onboarding?next=${encodeURIComponent(target)}`,
  );

  // 이미 마친 사람은 붙잡지 않는다. 로그인 흐름이 매번 이 화면을 거쳐 지나간다.
  if (user.onboardedAt) redirect(target);

  return (
    <main className={`page ${styles.page}`}>
      <div className={`container container--narrow grow ${styles.wrap}`}>
        <div className={styles.head}>
          <Logo />
          <h1 className={styles.title}>거의 다 됐습니다</h1>
          {/* 문장마다 제 줄을 갖게 한다 — 근거는 ProfileFields.tsx 주석 */}
          <p className={styles.lead}>
            <span>PROOVIT에서 쓸 이름을 알려주세요.</span>
            <span>실명과 공개용 닉네임을 따로 받습니다.</span>
          </p>
        </div>

        <OnboardingForm
          next={target}
          /*
            지금 값은 제공자가 준 이름이거나 이메일 아이디다. 그대로 채워두면
            구글 실명을 쓰는 사람은 손댈 게 없고, 아이디로 갈음된 사람은
            무엇을 고쳐야 하는지가 눈에 보인다.
          */
          defaultName={user.name}
          defaultNickname={user.nickname}
        />
      </div>
      <Footer />
    </main>
  );
}
