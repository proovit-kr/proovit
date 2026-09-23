"use server";

import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/access";
import { signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** 수신 채널 스위치 하나. 누르는 즉시 저장한다 — 시안에 저장 버튼이 없다 */
export async function setChannel(channel: "email" | "alimtalk", on: boolean) {
  // 서버 액션은 폼을 거치지 않고 직접 호출할 수 있다. 인증을 생략하지 않는다.
  const user = await getSessionUser();
  if (!user) return;
  await prisma.user.update({
    where: { id: user.id },
    data: channel === "email" ? { notifyEmail: on } : { notifyAlimtalk: on },
  });
  revalidatePath("/settings");
}

/*
  탈퇴 — 익명화하고 로그아웃한다(2026-09-23 수연 결정).

  행은 지우지 않는다. 참가·판정·제재·감사 기록이 이 사용자를 가리키고, 그 기록은
  운영 규정대로 보관한 뒤 지운다(개인정보 처리방침 제3조). 대신 사람을 알아볼 수
  있는 값을 전부 지운다 — 이메일·이름·닉네임·전화·아바타, 그리고 소셜 연결.
  소셜 연결이 없어지므로 같은 계정으로 다시 로그인하면 새 회원이 된다.

  이메일은 unique라 비울 수 없어 이 행만의 자리표로 바꾼다(`.invalid`는 배달되지
  않는 최상위 도메인). 세션은 전부 지운다 — 다른 기기에 남은 로그인도 끝낸다.

  팀·참가 기록은 건드리지 않는다(내가 정함, 수연 확인 대기). 시안 모달의
  「팀 참가가 함께 종료될 수 있어요」는 운영진이 판단할 여지로 읽었다.
*/
export async function withdraw() {
  const user = await getSessionUser();
  if (!user) return;

  const gone = "탈퇴한 회원";
  await prisma.$transaction([
    prisma.oauthAccount.deleteMany({ where: { userId: user.id } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        email: `withdrawn-${user.id}@withdrawn.invalid`,
        name: gone,
        nickname: gone,
        phone: null,
        avatarUrl: null,
        notifyEmail: false,
        notifyAlimtalk: false,
        emailVerifiedAt: null,
        withdrawnAt: new Date(),
      },
    }),
  ]);

  await signOut({ redirectTo: "/" });
}
