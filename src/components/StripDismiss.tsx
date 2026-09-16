"use client";

import { useRouter } from "next/navigation";

import { STRIP_COOKIE } from "@/lib/header-state";

import styles from "./DashboardTop.module.css";

/*
  탈락 스트립의 닫기. 시안 D7 노트 — 「첫 진입 시 1회 노출 후 닫을 수 있음」.

  ⚠️ 규칙표는 닫힘 여부를 **서버에 저장**하라고 한다. 지금은 쿠키다 —
  entries에 칸을 더하면 마이그레이션이 따라오는데(운영 DB에 잘못 실린 전력이
  있다, AGENTS.md 「DB」) 스트립 하나로 그 위험을 지는 것보다 브라우저에
  남기는 쪽을 골랐다. 다른 기기에서 한 번 더 보이는 것이 손해의 전부다.
  서버 저장으로 옮기면 header-read.ts의 `STRIP_COOKIE` 읽기만 바꾸면 된다.
*/
export function StripDismiss({ entryId }: { entryId: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={styles.close}
      aria-label="안내 닫기"
      onClick={() => {
        document.cookie = `${STRIP_COOKIE}=${encodeURIComponent(entryId)}; path=/dashboard; max-age=${60 * 60 * 24 * 90}; samesite=lax`;
        router.refresh();
      }}
    >
      ×
    </button>
  );
}
