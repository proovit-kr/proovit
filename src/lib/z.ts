/*
  zod는 여기서만 가져온다. `from "zod"`를 직접 쓰지 않는다.

  zod 4는 객체 파싱을 빠르게 하려고 `new Function`으로 코드를 만들어 쓰는데,
  우리 CSP(next.config.ts)는 `'unsafe-eval'`을 안 준다. zod는 그걸 탐지해
  느린 길로 스스로 돌아가지만, 탐지 자체가 `Function("")`이라 브라우저
  콘솔에 CSP 위반 한 줄이 남는다(설정·제출 화면에서 실제로 봤다).
  jitless는 그 탐지를 아예 안 한다. 폼 검증 크기에서는 속도 차이가 없다.
*/
import { z } from "zod";

z.config({ jitless: true });

export { z };
