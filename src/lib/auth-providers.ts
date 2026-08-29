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

const CANDIDATES: (AuthProviderInfo & { idEnv: string; secretEnv: string })[] =
  [
    {
      id: "google",
      label: "Google",
      idEnv: "AUTH_GOOGLE_ID",
      secretEnv: "AUTH_GOOGLE_SECRET",
    },
    /*
    ⚠️ 카카오는 키를 넣어도 아직 쓸 수 없다 (2026-08-12).
    「카카오계정(이메일)」 동의항목이 비즈 앱 전환 + 비즈니스 정보 심사를 통과해야
    열리는데, users.email이 NOT NULL이라 이메일 없이는 가입이 성립하지 않는다.
    심사가 끝나면 .env에 키 두 개를 넣는 것만으로 버튼이 생긴다.
  */
    {
      id: "kakao",
      label: "카카오",
      idEnv: "AUTH_KAKAO_ID",
      secretEnv: "AUTH_KAKAO_SECRET",
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
