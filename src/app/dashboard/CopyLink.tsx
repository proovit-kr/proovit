"use client";

import { useState } from "react";

import { Button } from "@/components/Button";
import { Toast, useToast } from "@/components/Toast";

/*
  홍보 링크 복사 — 시안 h6의 「홍보 링크 복사」.

  주소를 한 번 더 적지 않는다. 참가팀의 주소는 측정 연동이 정한 것 하나뿐이라
  서버가 그것을 넘겨준다.

  ⚠️ `navigator.clipboard`는 https와 localhost에서만 있다. 없을 때 말없이
  아무 일도 안 일어나면 버튼이 고장난 것처럼 보이므로, 그 사실을 토스트로
  알린다 — 주소는 화면 어디에도 없어서 손으로 복사할 수도 없다.
*/
export function CopyLink({
  url,
  label,
  className,
}: {
  url: string;
  label: string;
  className?: string;
}) {
  const { message, show } = useToast();
  const [busy, setBusy] = useState(false);

  async function copy() {
    setBusy(true);
    try {
      await navigator.clipboard.writeText(url);
      show("홍보 링크를 복사했어요");
    } catch {
      show(`복사하지 못했어요. 주소는 ${url} 예요`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="primary"
        className={className}
        onClick={copy}
        disabled={busy}
      >
        {label}
      </Button>
      <Toast message={message} />
    </>
  );
}
