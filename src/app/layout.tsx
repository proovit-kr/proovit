import type { Metadata, Viewport } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";

import { DevBar } from "@/components/DevBar";

import "./globals.css";

/*
  GA4 측정 ID. 없으면 태그를 아예 심지 않는다 —
  로컬·프리뷰 방문이 운영 집계에 섞이면 되돌릴 방법이 없다.

  수동 gtag 스니펫을 쓰지 않는 이유: App Router는 라우트 이동이 문서 재요청이
  아니라서 gtag('config')의 자동 page_view가 첫 진입 한 번만 잡힌다.
  이 컴포넌트는 라우터 이동을 구독해 page_view를 다시 쏜다.

  09 심사 기준서가 유효 방문자를 "GA4 일별 활성 사용자 합"으로 고정했으므로
  이 숫자가 곧 심사 근거다. 계측 누락은 점수 누락이다.
*/
const gaId = process.env.NEXT_PUBLIC_GA_ID;

/*
  OG 카드·정규 URL의 기준이 되는 절대 주소.
  Next.js 선택의 근거가 SEO·OG(관전자 유입)였으므로 처음부터 제대로 잡아둔다.
*/
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const title = "PROOVIT — AI 빌드 시즌제 리그";
const description =
  "아이디어를 가진 1~2인 팀이 AI로 실제 웹서비스를 만들고, 외부 이용자와 매출로 겨루는 온라인 시즌제 리그. 산출물은 수료증이 아니라 배포된 서비스와 지표입니다.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    // 하위 페이지는 자기 제목만 지정하면 뒤에 브랜드가 붙는다
    template: "%s | PROOVIT",
  },
  description,
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "PROOVIT",
    title,
    description,
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

/*
  상단 띠 색.

  iOS 사파리는 상태 바 자리를 페이지 색으로 칠하는데, 선언이 없으면 페이지에서
  **짐작해** 뽑는다. 지금은 짐작한 결과가 마침 `--bg`와 같아 티가 안 나지만,
  배경을 손대는 순간 조용히 어긋난다. 그래서 값으로 못박는다.

  ⚠️ `--bg`(#0a101c)와 **같은 값이어야 한다.** globals.css의 그 토큰을 바꾸면
  여기도 같이 바꾼다 — CSS 변수를 meta에서 읽을 방법이 없어 손으로 맞춘다.

  Next는 이 export가 있어도 viewport meta의 기본값(width=device-width,
  initial-scale=1)은 그대로 내보낸다. `viewport-fit`은 넣지 않는다 —
  사파리에서 inset이 0이라 얻을 것이 없다(NavBar.module.css의 「막힌 길」).
*/
export const viewport: Viewport = {
  themeColor: "#0a101c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    /*
      ⚠️ html에 `h-full`(height:100%)을 주지 않는다. globals.css가 시안의
      `html,body{height:100%}`를 왜 안 옮겼는지 적어 둔 그 이유가 여기에도
      그대로 걸린다 — html이 높이를 가지면 body의 `min-height:100%`가
      뷰포트 높이로 해석되고, Safari는 그 값을 플렉스 배치의 **확정 높이**로
      써서 `.page`(플렉스 컬럼)의 자식을 짜낸다. 헤더가 height:64px 대신
      min-content인 35px로 그려진 게 그거였다. Chrome은 min-height를
      확정 높이로 안 봐서 멀쩡했고, 그래서 Chrome만 보면 안 잡힌다.

      전체 화면 높이는 `.page`의 `min-height:100vh`가 이미 책임진다.
    */
    <html lang="ko" className="antialiased">
      <head>
        {/*
          JetBrains Mono — 시안의 `--mono`다. 지표·순위·코드값이 전부 이걸로
          그려지고 weight 800까지 쓴다(`.score`, `.hb-cd`, `.rm-node`).
          없으면 SF Mono로 떨어지면서 자폭이 달라지고 800은 합성 볼드가 된다.

          next/font/google을 쓰지 않는 이유는 빌드 시점에 폰트를 받아오기
          때문이다 — 네트워크가 막힌 CI에서 빌드가 통째로 실패한다.
          시안과 같은 방식(preconnect + 스타일시트)으로 둔다.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        {/*
          아래 규칙(no-page-custom-font)은 Pages Router 전제다 — 거기서는
          페이지에 넣은 link가 그 페이지에만 붙어서 경고가 맞다. App Router의
          루트 레이아웃은 모든 라우트를 감싸므로 해당하지 않는다.
        */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex flex-col">
        {children}
        {/*
          개발용 상태 토글 바. production 빌드에서는 아무것도 안 그리고,
          dev 빌드라도 **dev DB에 붙었을 때만** 동작한다(lib/dev-sandbox.ts).
          레이아웃에 두는 이유는 화면을 옮겨 다니며 상태를 바꾸는 도구라서다.
        */}
        <DevBar />
      </body>
      {gaId ? <GoogleAnalytics gaId={gaId} /> : null}
    </html>
  );
}
