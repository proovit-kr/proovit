import { useEffect, useRef, useState } from "react";

/**
 * 요소가 뷰포트에 들어오면 true (한 번만).
 *
 * 프로토타입에는 IntersectionObserver가 없는 환경을 위한 폴백이 있었지만
 * 이펙트 본문에서 setState를 부르는 형태라 렌더가 연쇄로 돈다.
 * Next.js 16의 지원 브라우저(Chrome·Edge·Firefox 111+, Safari 16.4+)에는
 * IntersectionObserver가 전부 있으므로 폴백을 두지 않는다.
 */
export function useInView<T extends HTMLElement>(threshold = 0.25) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return { ref, inView };
}
