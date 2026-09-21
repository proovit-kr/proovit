"use client";

import { Button } from "@/components/Button";
import { Toast, useToast } from "@/components/Toast";

/*
  시안 h16의 「쓰기 시도」 버튼 — 누르면 안내 토스트만 뜬다(시안 `#roDemo`).
  종료된 시즌에는 고칠 수 있는 것이 없다는 사실을 이 자리에서 말한다.
*/
export function ReadonlyDemo({
  label,
  toast,
  className,
}: {
  label: string;
  toast: string;
  className?: string;
}) {
  const { message, show } = useToast();
  return (
    <>
      <Button variant="outline" className={className} onClick={() => show(toast)}>
        {label}
      </Button>
      <Toast message={message} />
    </>
  );
}
