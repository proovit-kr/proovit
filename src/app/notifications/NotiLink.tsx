"use client";

import Link from "next/link";
import { type MouseEvent, type ReactNode, useTransition } from "react";

import { openNotification } from "./actions";

/*
  링크가 있는 알림 행 — 누르면 읽음으로 두고 그리로 간다.

  ⚠️ **읽음 처리와 이동은 서버 액션 하나로 한다**(`openNotification`의 redirect).
  예전엔 `<a>`로 읽음+리다이렉트 라우트를 거쳤는데, 문서째 떠나면 뒤로가기에서
  브라우저가 떠나기 전 문서를 bfcache로 되살려 읽은 알림이 안 읽음으로 보였다
  (2026-09-23 수연 지적). 이동을 `Link`에 맡기고 액션을 따로 보내도 안 된다 —
  액션 쪽 설명.

  `Link`로 두는 것은 주소를 보이고 새 탭(⌘·Ctrl·Shift·가운데 클릭)을 살리려는
  것이다. 새 탭은 브라우저에 맡긴다 — 그 알림은 안 읽은 채 남는다.
  이미 읽은 행은 그냥 `Link`다.
*/
export function NotiLink({
  id,
  href,
  unread,
  className,
  children,
}: {
  id: string;
  href: string;
  unread: boolean;
  className: string;
  children: ReactNode;
}) {
  const [, startTransition] = useTransition();

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!unread) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    startTransition(() => openNotification(id));
  };

  return (
    <Link className={className} href={href} onClick={onClick}>
      {children}
    </Link>
  );
}
