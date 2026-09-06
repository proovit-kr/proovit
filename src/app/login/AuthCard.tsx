"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/Button";
import ConsentFields, {
  emptyConsent,
  focusFirstMissingConsent,
  isConsentComplete,
  type ConsentState,
} from "@/components/ConsentFields";
import { SIGNUP_CONSENTS } from "@/content/consent";
import type { AuthProviderInfo } from "@/lib/auth-providers";

import styles from "./login.module.css";

/*
  인증 카드 — 시안 `#scr-auth`. 로그인·회원가입 두 상태를 한 카드가 그린다.

  시안이 상태로 가르는 것은 넷이다: 제목, 부제, 동의 블록(가입만), 아래 전환 문장.
  소셜 버튼과 약관 문장은 두 상태가 공유한다.

  ⚠️ 이 화면에는 헤더도 푸터도 없다. 시안 `#scr-auth`에 `.pub-head`·`.pub-foot`가
  아예 없고 카드 하나가 화면 가운데 놓인다.
*/

const COPY = {
  login: {
    title: "다시 오셨네요",
    sub: "계정으로 계속하세요.",
    swap: { text: "처음이신가요?", href: "/signup", label: "회원가입" },
  },
  signup: {
    title: "지표로 증명할 준비, 시작해요",
    sub: "가입은 소셜 계정으로 10초면 끝나요.",
    swap: { text: "이미 계정이 있나요?", href: "/login", label: "로그인" },
  },
} as const;

/* 시안은 제공자 머리글자를 아이콘 자리에 끼워 넣는다 */
const MARK: Record<AuthProviderInfo["id"], string> = {
  kakao: "K",
  google: "G",
};

/* 시안의 버튼 색은 제공자 브랜드다. Button의 kakao·google 변형이 그 값을 쓴다 */
const VARIANT = { kakao: "kakao", google: "google" } as const;

export function AuthCard({
  mode,
  providers,
  errorMessage,
  onSignIn,
}: {
  mode: "login" | "signup";
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
  const copy = COPY[mode];
  const [consent, setConsent] = useState<ConsentState>(() =>
    emptyConsent(SIGNUP_CONSENTS),
  );
  const [showMissing, setShowMissing] = useState(false);

  /*
    가입은 필수 동의 둘을 받고서야 넘어간다.

    버튼을 `disabled`로 잠그지 않는 이유는 랜딩 폼과 같다 — disabled인 버튼은
    클릭 이벤트가 발생하지 않아 왜 안 되는지 말해줄 수 없다. 눌리게 두고
    비어 있는 첫 항목으로 포커스를 옮긴다.
  */
  const blockIfMissing = (e: React.MouseEvent) => {
    if (mode !== "signup") return;
    if (isConsentComplete(consent, SIGNUP_CONSENTS)) return;
    e.preventDefault();
    setShowMissing(true);
    focusFirstMissingConsent(consent, SIGNUP_CONSENTS);
  };

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
        <h1 className={styles.title}>{copy.title}</h1>
        <p className={styles.sub}>{copy.sub}</p>

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
                  onClick={blockIfMissing}
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

        {mode === "signup" ? (
          <ConsentFields
            items={SIGNUP_CONSENTS}
            value={consent}
            onChange={setConsent}
            showMissing={showMissing}
            missingMessage="필수 항목에 동의해야 가입할 수 있어요."
          />
        ) : null}

        {/*
          ⚠️ **`/terms`는 아직 404다**(본문 미확정, `content/terms.ts`). 그래도
          링크한다 — 2026-09-03 수연 판단. 사전신청 구간에는 이 화면으로 오는
          길이 어디에도 없어서 404를 볼 사람이 없고, 시안대로 두 링크를 나란히
          두는 편이 낫다.

          푸터에는 약관 항목이 아예 없다. 시안이 아니라 노션 정본(「사전신청 폼
          문안·푸터」)을 따르기 때문이고, 거기에는 개인정보처리방침 하나뿐이다.
        */}
        <p className={styles.terms}>
          {/*
            ⚠️ 「동의하게」와 「돼요」 사이는 **줄바꿈 없는 공백**(&nbsp;)이다.
            390·360px에서 「돼요.」만 다음 줄에 홀로 떨어졌다(2026-09-06 수연).
            시안도 같은 폭에서 똑같이 깨진다 — 데스크톱에서만 검토된 자리다.

            `text-wrap: pretty`가 세 폭(390·360·320)에서 이것과 결과가 같지만,
            사파리에 없으면 조용히 원래대로 돌아간다. 폰에서 보는 화면이라
            어디서나 되는 쪽을 골랐다.
          */}
          계속하면 <Link href="/terms">이용약관</Link>과{" "}
          <Link href="/privacy">개인정보처리방침</Link>에 동의하게&nbsp;돼요.
        </p>
        <p className={styles.swap}>
          {copy.swap.text} <Link href={copy.swap.href}>{copy.swap.label}</Link>
        </p>
      </div>
    </div>
  );
}
