import type { Metadata } from "next";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
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
