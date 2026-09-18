import { ConsentDialog } from "@/components/ConsentDialog";
import { acceptAccountConsent, declineAccountConsent } from "@/app/actions/consent";
import { getSessionUser } from "@/lib/access";
import { loadAccountConsentNeed } from "@/lib/account-consent";

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

  비용은 로그인 사용자 한정 조회 두어 건이다. 비로그인은 `getSessionUser`가
  세션 쿠키만 보고 곧바로 null을 내므로 DB를 읽지 않는다.
*/
export async function ConsentGate() {
  const user = await getSessionUser();
  if (!user) return null;

  const need = await loadAccountConsentNeed(user.id);
  if (!need.needed) return null;

  return (
    <ConsentDialog
      provider={need.provider}
      maskedEmail={need.maskedEmail}
      reconsent={need.reconsent}
      onAccept={acceptAccountConsent}
      onDecline={declineAccountConsent}
    />
  );
}
