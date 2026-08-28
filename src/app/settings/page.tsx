import type { Metadata } from "next";

import { Footer } from "@/components/Footer";
import { Logo } from "@/components/NavBar";
import { requireUser } from "@/lib/access";
import { hasAnyEntry } from "@/lib/apply-store";

import { SettingsForm } from "./SettingsForm";

import styles from "./settings.module.css";

/*
  설정 — 이름·닉네임을 나중에 고치는 자리.

  일자별 계획에서는 9/2였는데 8/12로 당겼다. 온보딩 안내문이 "설정에서 언제든
  바꿀 수 있습니다"라고 약속하는데 그 화면이 없으면 지키지 못할 말이 되고,
  이름을 잘못 넣은 사람의 문의가 3명짜리 팀 운영 손으로 온다.

  지금 다루는 것은 이름 두 개뿐이다. 알림 설정(notify_email·notify_alimtalk)은
  일부러 뺐다 — 알림톡은 발신프로필 심사(윤서)가 선행이고 전화번호는 /apply에서
  받기로 한 값이라, 여기 먼저 놓으면 끌 수만 있고 켤 수 없는 스위치가 된다.

  requireUser만 쓴다. 소셜 가입 직후에는 이름 두 칸이 임시값(이메일 아이디)인데,
  그 값을 진짜 이름으로 바꾸는 자리가 여기다 — 막으면 바꿀 데가 없어진다.

  실명 칸은 참가 신청이 확정되면 읽기 전용이 된다(DEV3에서 구현). 근거는
  profile-store.ts 머리 주석에 있다 — 상금 지급 때 예금주와 대조하는 값이라
  계약이 성립한 뒤에 조용히 바뀌면 안 된다.
*/

export const metadata: Metadata = {
  title: "설정",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const nameLocked = await hasAnyEntry(user.id);

  return (
    <main className={`page ${styles.page}`}>
      <div className={`container container--narrow grow ${styles.wrap}`}>
        <div className={styles.head}>
          <Logo />
          <h1 className={styles.title}>설정</h1>
          <p className={styles.lead}>
            <span>PROOVIT에서 쓰는 이름을 바꿀 수 있습니다.</span>
            <span>로그인 계정은 {user.email} 입니다.</span>
          </p>
        </div>

        <SettingsForm
          defaultName={user.name}
          defaultNickname={user.nickname}
          nameLocked={nameLocked}
        />
      </div>
      <Footer />
    </main>
  );
}
