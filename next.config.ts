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
};

export default nextConfig;
