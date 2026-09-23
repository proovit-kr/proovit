import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SETTINGS_HEAD } from "@/content/settings";
import { guardPage } from "@/lib/access";
import { prisma } from "@/lib/prisma";

import hub from "../dashboard/hub.module.css";

import { SettingsPanel } from "./SettingsPanel";

import styles from "./settings.module.css";

/*
  계정 설정 — 시안 ver4 `#scr-settings`(단일 상태) + 탈퇴 확인 모달 `#mdl-quit`.

  수신 채널 스위치 둘(`users.notify_email`·`notify_alimtalk`), 로그인 계정과 연결된
  소셜, 로그아웃, 탈퇴. 대시보드 크롬 안이다(`layout.tsx`). 대조는
  `scripts/design-diff/settings.mjs`.

  ⚠️ 이름·닉네임을 고치는 칸은 없다 — 시안에 없어 뺐다(2026-09-23 수연 결정).
  둘 다 가입할 때 소셜 계정의 이름으로 들어간 값 그대로다.

  시안과 일부러 다른 것(내가 정함, 2026-09-23, 수연 확인 대기):
    · 구글로 가입한 사람은 배지가 회색 「구글 연결됨」이다. 시안은 카카오만 그렸다.
    · 알림톡 스위치는 전화번호가 없어도 켜진다. 값만 남고, 보낼 때 번호가 없으면
      안 보낸다(스키마 주석대로).
*/

export const metadata: Metadata = {
  title: "계정 설정",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { viewer } = await guardPage("settings", "/settings");
  // guardPage가 로그인 안 한 사람을 로그인으로 보낸다(settings는 auth: "user")
  if (!viewer.user) notFound();
  const me = await prisma.user.findUniqueOrThrow({
    where: { id: viewer.user.id },
    select: {
      email: true,
      notifyEmail: true,
      notifyAlimtalk: true,
      oauthAccounts: { select: { provider: true }, orderBy: { createdAt: "asc" } },
    },
  });

  return (
    <div className={styles.wrap} data-probe="settings" data-state="single">
      <h2 className={hub.h1}>{SETTINGS_HEAD.title}</h2>
      <p className={hub.sub}>{SETTINGS_HEAD.sub}</p>
      <SettingsPanel
        email={me.email}
        providers={me.oauthAccounts.map((a) => a.provider)}
        notifyEmail={me.notifyEmail}
        notifyAlimtalk={me.notifyAlimtalk}
      />
    </div>
  );
}
