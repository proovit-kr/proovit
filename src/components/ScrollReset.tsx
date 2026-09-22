"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";

/*
  화면이 바뀌면 창을 맨 위로.

  앱 라우터는 이동 뒤 창 맨 위가 아니라 **바뀐 구역의 첫 요소**를 뷰포트 위에
  맞춘다(`scrollIntoView`). 대시보드처럼 본문 위에 헤더가 있는 레이아웃에서는
  헤더 높이만큼 내려간 자리에 멈춘다 — 다른 화면에서 스크롤을 내린 채 목차를
  누르면 「맨 위에서 조금 밑」이 되는 이유다(2026-09-23 수연 지적).

  ⚠️ 뒤로·앞으로 가기는 건드리지 않는다 — 브라우저가 있던 자리를 복원한다.
  `popstate`가 React 커밋보다 먼저 오므로 표시만 남겨 두고 건너뛴다.
  해시가 있으면 그 자리로 가는 것이 맞으니 역시 건너뛴다.

  ⚠️ 레이아웃 효과여야 한다. 라우터의 scrollIntoView가 자식 구역의 layout
  단계에서 돌고, 이 부품은 루트 레이아웃에서 `children` **뒤**에 서므로 같은
  커밋의 그 뒤에 돈다 — 그래야 이쪽이 이긴다.
*/
export function ScrollReset() {
  const pathname = usePathname();
  const pop = useRef(false);
  const first = useRef(true);

  useEffect(() => {
    const mark = () => {
      pop.current = true;
    };
    window.addEventListener("popstate", mark);
    return () => window.removeEventListener("popstate", mark);
  }, []);

  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (pop.current) {
      pop.current = false;
      return;
    }
    if (window.location.hash) return;
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
