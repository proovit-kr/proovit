"use client";

import { type ReactNode, useLayoutEffect, useRef } from "react";

/*
  레일의 라임 선 — 시안 `.cr-rail::after`의 `--fill`.

  시안은 렌더 뒤 `requestAnimationFrame`에서 첫 노드와 마지막으로 열린 노드의
  거리를 재어 픽셀로 준다(`crRender`). 카드 높이는 폭과 글자에 따라 달라지므로
  CSS만으로는 못 정한다. 우리는 폭이 바뀔 때도 다시 잰다(시안은 안 잰다 —
  뷰어라 그럴 일이 없다).

  `last`는 열린 카드 중 마지막의 순번(없으면 -1). 노드는 카드마다 같은 자리
  (top 20px)라 카드의 `offsetTop` 차이가 곧 노드 사이 거리다 — rect와 달리
  변형·소수점을 안 탄다.
*/
export function Rail({
  className,
  last,
  children,
}: {
  className: string;
  last: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const rail = ref.current;
    if (!rail) return;
    const measure = () => {
      const cards = [...rail.children] as HTMLElement[];
      const first = cards[0];
      const end = cards[last];
      if (last < 0 || !first || !end) {
        rail.style.setProperty("--fill", "0px");
        return;
      }
      rail.style.setProperty("--fill", `${Math.max(0, end.offsetTop - first.offsetTop + 8)}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(rail);
    return () => ro.disconnect();
  }, [last]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
