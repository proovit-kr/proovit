import type { Metadata } from "next";
import "./globals.css";

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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
