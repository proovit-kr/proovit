"use client";

/*
  표의 한 줄을 통째로 누를 수 있게 만든다 — 그 팀의 참가작 상세로 간다
  (2026-09-20 수연 지시).

  ⚠️ **링크 자체는 팀명 칸의 `<a>`다.** 여기서 하는 일은 「그 링크를 행
  아무 데서나 눌러도 되게」 하는 것뿐이라, JS가 없거나 키보드로 오가는
  사람에게도 길이 그대로 남는다.

  ⚠️ 한때 팀명 링크의 `::after`로 행을 덮었는데, 그 덮개는 `<tr>`에 준
  `position: relative`를 믿는다. **사파리는 `<tr>`의 상대 위치를 무시한다** —
  그러면 덮개가 표 전체로 퍼지고 맨 뒤 행의 것이 위를 덮어서, 어느 행을
  눌러도 마지막 팀으로 갔다(수연이 잡았다). 그래서 덮개를 버렸다.
*/

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

export function RowLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  const onClick = (e: MouseEvent<HTMLTableRowElement>) => {
    /* 칸 안의 진짜 링크·버튼은 제 갈 길로 간다 — 서비스 주소가 그렇다 */
    if ((e.target as HTMLElement).closest("a, button")) return;
    /* 글자를 끌어 고르던 중이면 이동하지 않는다 */
    if (window.getSelection()?.toString()) return;
    /* 새 탭으로 여는 손버릇(⌘·Ctrl·가운데 버튼)도 살린다 */
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) {
      window.open(href, "_blank", "noopener");
      return;
    }
    router.push(href);
  };

  return (
    <tr className={className} onClick={onClick}>
      {children}
    </tr>
  );
}
