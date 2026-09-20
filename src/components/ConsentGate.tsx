"use client";

import { useEffect, useState } from "react";

import { AccountConsent } from "@/components/ConsentDialog";
import { acceptAccountConsent, declineAccountConsent } from "@/app/actions/consent";
import { fetchMe } from "@/lib/me-client";

/*
  계정 동의 게이트 — 시안 ver4 `#scr-auth` ②③.

  **루트 레이아웃에 매단다.** 시안 개발 메모가 그렇게 정했다:

    · 콜백은 returnTo(직전 페이지)로 이동하고, 동의 기록이 없으면 그 위에 모달
    · 보호 라우트: 동의 전에는 /apply, /dashboard 진입 시 모달을 먼저 띄움
    · 콜백 뒤 홈에서 모달을 닫지 않고 다른 페이지로 가도 다시 뜸

  마지막 줄이 이 자리를 정한다. 특정 화면에 붙이면 "다른 페이지로 가면 안 뜨는"
  구멍이 생긴다. 루트에 두면 로그인한 채 여는 모든 화면이 자동으로 막힌다 —
  라우트가 새로 생겨도 빠뜨릴 수 없다(운영자 레이아웃에서 접근 판정을 하지 않는
  것과 같은 이유의 반대편이다. 저기는 판정 자리가 아니라서 빼고, 여기는
  전역이라서 넣는다).

  ⚠️ **리다이렉트로 막지 않는다.** `/consent` 같은 화면으로 튕기면 보던 페이지를
  잃는다. 시안 ③이 「동의 저장, 보던 페이지로 복귀」인 이유가 그것이고,
  덮어 두면 복귀할 것도 없이 그 자리에 남는다.

  ⚠️ **동의가 끝난 사람에게도 `AccountConsent`를 그린다**(모달 없이). 시안 ③의
  토스트는 모달이 걷힌 뒤에 뜨는데, 모달과 함께 컴포넌트가 떨어져 나가면 토스트를
  띄울 자리도 사라진다. 같은 자리에 남아 있어야 저장 전후로 상태가 이어진다.

  ⚠️ **클라이언트에서 판정한다.** 한때 서버 컴포넌트로 두고 `getSessionUser()`를
  불렀는데, 그 한 줄이 루트 레이아웃을 동적으로 만들어 **앱 전체의 정적 렌더가
  꺼져 있었다** — 랜딩의 `revalidate = 60`이 무시되고 비로그인 관전자의 모든
  방문이 DB 조회가 됐다(2026-09-20에 `next build`의 ○/ƒ 표로 확인). 쿠키를
  읽는 자리를 레이아웃 밖으로 옮기는 것 말고는 되살릴 방법이 없다.

  판정 값은 `/api/v1/me`가 실어 온다. 헤더가 이미 부르는 응답이라 요청이 늘지
  않고(`lib/me-client`가 문서당 한 번으로 묶는다), 비로그인은 그 라우트가
  쿠키만 보고 DB 없이 끝낸다.

  ⚠️ 그래서 모달이 **첫 그림보다 한 박자 늦게** 뜬다. 막는 것은 모달이 아니라
  서버다(`access-policy`) — 동의 전에 `/apply`·`/dashboard`를 열면 화면 자체가
  이미 막혀 있다. 이 모달은 그 사실을 알리고 받아내는 자리지 방벽이 아니다.
*/

type Need = {
  provider: "kakao" | "google" | null;
  maskedEmail: string;
  reconsent: boolean;
};

export function ConsentGate() {
  /*
    `undefined`는 아직 모르는 상태, `null`은 띄울 필요 없음이다. 둘을 갈라
    두는 이유는 아래 `mounted`와 같다 — 모르는 동안에는 아무것도 그리지 않는다.
  */
  const [need, setNeed] = useState<Need | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void fetchMe().then((body) => {
      if (alive) setNeed(body?.consent ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (need === undefined) return null;

  return (
    <AccountConsent
      need={need}
      onAccept={async (formData) => {
        const ok = await acceptAccountConsent(formData);
        /*
          저장됐으면 모달을 여기서 걷는다. 서버 컴포넌트였을 때는 레이아웃이
          다시 그려지며 사라졌다 — 그 0.5초 지연이 `AccountConsent`의 토스트
          타이밍 주석이 말하는 어긋남이었다.
        */
        if (ok) setNeed(null);
        return ok;
      }}
      onDecline={declineAccountConsent}
    />
  );
}
