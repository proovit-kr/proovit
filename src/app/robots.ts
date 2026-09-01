import type { MetadataRoute } from "next";

/*
  robots.txt — App Router 파일 규약. `public/robots.txt`를 손으로 두지 않는 이유는
  사이트맵 주소가 `NEXT_PUBLIC_SITE_URL`을 따라가야 해서다. 정적 파일이면
  프리뷰 배포가 운영 주소의 사이트맵을 가리킨다.

  ⚠️ **이미 `noindex`가 걸린 화면은 여기서 막지 않는다.**
  `Disallow`와 `noindex`는 서로 다른 층이다 — Disallow는 「읽지 마라」이고
  noindex는 「읽고 나서 색인하지 마라」다. Disallow로 막으면 크롤러가 문서를
  못 읽어 **그 안의 noindex도 못 본다.** 그러면 바깥에서 링크된 URL이
  본문 없이 주소만 색인되는, 정확히 막으려던 결과가 남는다.

  그래서 아래 목록에는 `/apply`·`/login`·`/signup`·`/settings`·`/notifications`·
  `/unsubscribe`가 **없다.** 그 여섯은 각 page.tsx의 `robots: { index: false }`가
  맡는다. 여기서 막는 것은 meta를 실을 자리가 없는 것(`/api/`)과, 어차피
  로그인으로 튕겨 크롤 예산만 먹는 것(`/admin`·`/dashboard`·`/dev`)뿐이다.
*/
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin", "/dashboard", "/dev"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
