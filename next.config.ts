import type { NextConfig } from "next";

/*
  한 줄에 한 지시어. 외부 출처는 넷뿐이다 —
    Google Fonts(css는 googleapis, 파일은 gstatic),
    GA(@next/third-parties가 googletagmanager를 넣고, 수집은 google-analytics로 간다),
    Turnstile(스크립트와 챌린지 iframe 모두 challenges.cloudflare.com).
*/
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://www.googletagmanager.com https://*.google-analytics.com",
  "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  /*
    개발 서버는 http로 뜬다. 사파리는 이 지시어를 **localhost에도** 적용해서
    `/_next/*.css`를 https로 올려 받으려 하고, 개발 서버에는 TLS가 없으니
    전부 실패한다 — 스타일이 통째로 빠진 화면이 된다. 크롬은 localhost를
    예외로 둬서 멀쩡하니, 크롬만 보면 이 문제가 안 보인다.
    운영은 HTTPS라 이 지시어가 할 일이 없다. 그래서 개발에서만 뺀다.
  */
  ...(process.env.NODE_ENV === "development" ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  /*
    Next 개발 표시기를 끈다.

    화면 왼쪽 아래 모서리에 떠서 우리 개발용 토글 바(components/DevBar)와 자리를
    다툰다. 표시기가 알려주던 것(이 라우트가 정적인가 동적인가)은 `next build`
    출력의 ○·ƒ 기호로 언제든 확인할 수 있고, **컴파일·런타임 오류는 이 설정과
    무관하게 그대로 뜬다**(devIndicators 문서).
  */
  devIndicators: false,

  /*
    개발 서버를 같은 네트워크의 다른 기기(폰·태블릿)에서 열 수 있게 한다.

    Next는 기본적으로 **다른 출처에서 오는 `/_next/*` 요청을 막는다.** 막히면
    HTML은 오는데 클라이언트 번들이 실행되지 않아, 화면이 그려지고 나서
    하이드레이션만 조용히 실패한다 — 우리 랜딩은 리빌이 `opacity: 0`으로
    시작하므로 **헤더 아래가 통째로 빈 화면**이 된다. 콘솔에는 아무 오류도
    안 뜨고 네트워크도 전부 200이라, 원인이 개발 서버라는 것을 알기 어렵다.
    (실제로 폰에서 이 증상을 보고 iOS 문제로 한참 찾았다.)

    ⚠️ **개발에만 적용된다.** `next build`한 것에는 이 제한이 없다.
    ⚠️ 사설 대역(192.168.*)만 적는다. 공인 주소를 적으면 개발 서버의 소스와
    HMR이 그 출처에 열린다.

    ⚠️ **맥의 주소는 자주 바뀐다**(공유기 재접속·네트워크 전환). 한 대만
    적어 두면 다음에 또 막힌다 — 사설 대역을 통째로 적는다.
    지금 주소는 `ipconfig getifaddr en0`으로 본다.
  */
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.30.*.*"],

  /*
    보안 헤더. 2026-09-08 OWASP ZAP 점검(노션 「proovit.kr 보안 점검」)에서
    빠졌다고 나온 것들. HSTS는 Vercel이 이미 붙이므로 여기 없다.

    CSP는 nonce 없이 간다. nonce는 모든 화면을 동적 렌더로 바꿔서 랜딩이
    CDN 캐시를 잃는다. 대신 script-src에 'unsafe-inline'을 두는데, Next가
    RSC 페이로드를 인라인 <script>로 넣기 때문에 이것 없이는 화면이 안 뜬다.
    그래서 이 CSP가 막는 것은 인라인 스크립트가 아니라 **바깥으로 나가는 길**
    이다 — 허용 목록 밖의 스크립트·fetch·iframe·플러그인·<base> 바꿔치기.

    ⚠️ form-action은 일부러 없다. 로그인 폼이 서버 액션으로 POST한 뒤
    kauth.kakao.com / accounts.google.com으로 302 되는데, Chrome은 그
    리다이렉트 끝까지 form-action으로 검사해서 'self'만 두면 로그인이 깨진다.

    출처를 더할 때는 여기 한 줄 추가로 끝난다. 검증은
    scripts/design-diff/csp.mjs — 프로덕션 빌드를 띄우고 모든 화면을 돌며
    콘솔의 CSP 위반을 센다.
  */
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          /* 우리 화면을 iframe에 넣어 쓰는 곳이 없고 로그인 세션이 있다 */
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
    ];
  },
};

export default nextConfig;
