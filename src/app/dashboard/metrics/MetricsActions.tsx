"use client";

import { Button } from "@/components/Button";
import { usePageToast } from "@/components/PageToast";
import { METRICS_EMPTY, METRICS_TOAST } from "@/content/metrics";

/** 시안 ② 「홍보 링크 복사」 — 팀 주소를 클립보드로. 토스트는 화면의 것 하나 */
export function CopyLinkButton({ value }: { value: string }) {
  const show = usePageToast();
  return (
    <Button
      type="button"
      style={{ marginTop: "18px" }}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          show(METRICS_TOAST.copied);
        } catch {
          show(METRICS_TOAST.copyFailed);
        }
      }}
    >
      {METRICS_EMPTY.button}
    </Button>
  );
}
