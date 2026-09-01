/*
  어떤 소셜 로그인이 실제로 켜져 있는가 — 설정(auth.ts)과 화면(/login)이
  같은 목록을 봐야 한다. 따로 두면 버튼은 있는데 제공자가 없거나 그 반대가 된다.

  키가 없으면 그 제공자를 아예 빼는 이유: 앱 등록 전에도 배포가 깨지지 않아야
  한다(Turnstile·개인정보처리방침과 같은 방식). 키를 넣는 순간 버튼이 생긴다.
*/

export interface AuthProviderInfo {
  /** Auth.js 제공자 id. 콜백 주소 /api/auth/callback/<id>가 여기서 나온다 */
  id: "google" | "kakao";
  /** 버튼에 노출되는 이름. 시안 표기를 따른다 — 「Google로 계속하기」/「카카오로 계속하기」 */
  label: string;
}

/*
  ⚠️ **순서가 곧 화면 순서다.** 시안 `#scr-auth`는 카카오를 위에, Google을
  아래에 둔다. 이 배열 순서가 그대로 버튼 순서가 되므로 바꾸지 않는다.

*/
const CANDIDATES: (AuthProviderInfo & { idEnv: string; secretEnv: string })[] =
  [
    /*
      카카오는 2026-09-01에 「개인 개발자 비즈 앱」으로 전환했고(앱 1541124),
      「카카오계정(이메일)」을 **필수 동의**로 열었다. users.email이 NOT NULL이라
      이것이 선행 조건이었다. 사업자번호 없이 본인인증만으로 전환되어 별도
      심사는 없었다.

      ⚠️ 리다이렉트 URI는 **도메인마다 따로** 등록해야 한다. 등록된 것은
      proovit.kr / www.proovit.kr / proovit-neon.vercel.app / localhost:3000 넷이고,
      미등록 도메인에서 누르면 KOE006으로 막힌다. 프리뷰 배포는 URL이 매번
      바뀌므로 카카오 키를 Production에만 둔 것도 같은 이유다.
    */
    {
      id: "kakao",
      label: "카카오",
      idEnv: "AUTH_KAKAO_ID",
      secretEnv: "AUTH_KAKAO_SECRET",
    },
    {
      id: "google",
      label: "Google",
      idEnv: "AUTH_GOOGLE_ID",
      secretEnv: "AUTH_GOOGLE_SECRET",
    },
  ];

export function isProviderConfigured(id: AuthProviderInfo["id"]): boolean {
  const candidate = CANDIDATES.find((c) => c.id === id);
  if (!candidate) return false;
  return Boolean(
    process.env[candidate.idEnv] && process.env[candidate.secretEnv],
  );
}

/** 지금 실제로 로그인에 쓸 수 있는 제공자 목록 */
export const AUTH_PROVIDERS: AuthProviderInfo[] = CANDIDATES.filter((c) =>
  isProviderConfigured(c.id),
).map(({ id, label }) => ({ id, label }));
