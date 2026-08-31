import type { NextConfig } from "next";

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

    맥의 주소는 바뀔 수 있다: `ipconfig getifaddr en0`
  */
  allowedDevOrigins: ["192.168.0.20", "192.168.0.*"],
};

export default nextConfig;
