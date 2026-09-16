import { redirect } from "next/navigation";

import { safeNext } from "@/lib/access";

/*
  회원가입 — 시안 ver4가 `/login`과 합쳤다.

  ⚠️ **라우트를 지우지 않는다.** 시안 화면 레지스트리는 인증을 여전히
  `/login, /signup` 두 주소로 적고, 이미 뿌려진 링크(사전 신청 메일·안내 문서)가
  이 주소를 가리킬 수 있다. 지우면 그 링크가 404를 낸다.

  대신 화면을 두지 않고 되돌린다. ver3의 「가입 상태」는 이제 없다 —
  Auth.js가 가입과 로그인을 구분하지 않아서(처음 오는 계정이면 어댑터가 사용자를
  만든다) 화면을 둘로 둔 것이 애초에 실제와 달랐다.

  ⚠️ `callbackUrl`을 **그대로 이어 넘긴다.** 여기서 떨구면 가입 링크로 들어온
  사람만 로그인 뒤 홈으로 튕겨, 원래 가려던 자리를 잃는다.

  `redirect()`는 307이다. 영구 이동(308)으로 두지 않는 이유는 브라우저가 캐시해
  버려서다 — 주소 정본이 8/17 회의 안건으로 남아 있어(login/page.tsx 주석) 아직
  못을 박을 자리가 아니다.
*/

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;

  const params = new URLSearchParams();
  /* ⚠️ 검증을 거쳐 넘긴다. 그대로 실으면 오픈 리다이렉트가 된다(access.ts safeNext) */
  const next = safeNext(callbackUrl);
  if (next) params.set("callbackUrl", next);
  if (error) params.set("error", error);

  const query = params.toString();
  redirect(query ? `/login?${query}` : "/login");
}
