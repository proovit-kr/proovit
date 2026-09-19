import Link from "next/link";

import { Button } from "@/components/Button";
import type { AuthProviderInfo } from "@/lib/auth-providers";

import styles from "./login.module.css";

/*
  인증 카드 — 시안 ver4 `#scr-auth`의 ① 「단일 진입 화면」.

  ⚠️ **ver3에서 통째로 바뀐 화면이다.** ver3는 로그인과 회원가입을 두 상태로
  갈라 제목·부제·동의 블록·전환 문장 넷을 바꿔 그렸다. ver4는 그 구분을 없앴다 —
  Auth.js가 어차피 가입과 로그인을 구분하지 않고(처음 오는 계정이면 어댑터가
  사용자를 만든다) 화면만 둘인 것이 실제와 달랐다.

  같이 사라진 것이 **동의 체크박스**다. ver3는 소셜 버튼을 누르기 전에 받았는데,
  그 체크는 OAuth 왕복을 건너지 못해 DB에 남지 않았다. ver4는 인증을 먼저 끝내고
  돌아온 자리에서 모달로 받는다(`ConsentGate`). 그래서 이 카드에는 상태가 없고,
  클라이언트 상태도 없어 **서버 컴포넌트**다.

  ⚠️ 이 화면에는 헤더도 푸터도 없다. 시안 `#scr-auth`에 `.pub-head`·`.pub-foot`가
  아예 없고 카드 하나가 화면 가운데 놓인다.
*/

/* 시안은 제공자 머리글자를 아이콘 자리에 끼워 넣는다 */
const MARK: Record<AuthProviderInfo["id"], string> = {
  kakao: "K",
  google: "G",
};

/* 시안의 버튼 색은 제공자 브랜드다. Button의 kakao·google 변형이 그 값을 쓴다 */
const VARIANT = { kakao: "kakao", google: "google" } as const;

export function AuthCard({
  providers,
  errorMessage,
  onSignIn,
}: {
  providers: AuthProviderInfo[];
  errorMessage: string | null;
  /**
   * 서버 액션. 어느 제공자인지는 폼 데이터의 `provider`로 받는다.
   *
   * ⚠️ `.bind(null, id)`로 인자를 묶지 않는다. 그러면 Next가 묶인 인자를
   * 숨은 `<input>`으로 **버튼 안에** 심어서, 시안에는 없는 자식이 셋 생긴다.
   */
  onSignIn: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        {/*
          ⚠️ **시안에 없는 링크다**(2026-09-03 수연 제안). 시안은
          `<div class="wm">`로 두지만, 이 화면에는 헤더도 푸터도 없어서
          지금은 나갈 길이 브라우저 뒤로가기뿐이다 — 주소로 바로 들어온
          사람은 그것도 안 통한다.

          워드마크를 눌러 첫 화면으로 가는 것은 널리 쓰이는 관례이고,
          모양은 그대로 둔다 — 누르는 자리도 글자 폭에만 둔다(login.module.css).
        */}
        <Link href="/" className={styles.wm} aria-label="PROOVIT 첫 화면">
          PROO<em className={styles.wmCheck}>✓</em>IT
        </Link>
        <h1 className={styles.title}>로그인 또는 회원가입</h1>
        <p className={styles.sub}>계정이 없으면 자동으로 만들어져요.</p>

        {errorMessage ? (
          <p className={styles.error} role="alert">
            {errorMessage}
          </p>
        ) : null}

        {providers.length > 0 ? (
          /*
            ⚠️ 폼은 `.sso` **바깥**이다. 시안의 `.sso`는 버튼만 담은 `<div>`인데,
            여기에 form을 겹치면 Next가 서버 액션용 숨은 input을 그 안에 심어서
            자식이 넷 늘어난다(화면에는 안 보이지만 구조가 달라진다).

            제공자마다 form을 두지도 않는다 — 그러면 `.sso`의 직계 자식이 폼이
            되어 버튼이 받는 블록화와 높이 정렬이 사라진다.
            어느 버튼을 눌렀는지는 `name="provider"`가 폼 데이터로 알려 준다.
          */
          <form action={onSignIn}>
            <div className={styles.sso}>
              {providers.map((p) => (
                <Button
                  key={p.id}
                  type="submit"
                  name="provider"
                  value={p.id}
                  variant={VARIANT[p.id]}
                >
                  <span className={styles.ssoMark}>{MARK[p.id]}</span>
                  {` ${p.label}로 계속하기`}
                </Button>
              ))}
            </div>
          </form>
        ) : (
          <p className={styles.empty}>
            로그인 수단이 아직 연결되지 않았습니다. 잠시 후 다시 시도해 주세요.
          </p>
        )}

        {/*
          ver4의 문장이다. ver3는 「계속하면 …에 동의하게 돼요」로 **이 자리에서
          동의가 성립한다**고 말했는데, 실제로는 체크박스가 따로 있었고 기록도
          남지 않았다. ver4는 동의를 받는 자리가 뒤(콜백 뒤 모달)라고 알린다.

          ⚠️ 「동의를」 뒤에서 끊는다(2026-09-20 수연 결정). 시안은 폭대로 흘려
          「동의를 확인하는」까지 첫 줄에 올린다. 앞 구절이 한 줄에 들어가는
          폭에서만 끊고(login.module.css `.termsBreak`), 그보다 좁으면 흐르게
          둔다 — 억지로 끊으면 「동의를」만 홀로 한 줄이 된다.
        */}
        <p className={styles.terms}>
          처음 로그인하면 <Link href="/terms">이용약관</Link>과{" "}
          <Link href="/privacy">개인정보 수집과 이용</Link> 동의를
          <br className={styles.termsBreak} /> 확인하는 화면이 한 번 이어져요.
        </p>
      </div>
    </div>
  );
}
