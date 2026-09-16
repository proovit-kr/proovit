"use client";

import { useRouter } from "next/navigation";

import { STRIP_COOKIE } from "@/lib/header-state";

import styles from "./DashboardTop.module.css";

/*
  탈락 스트립의 닫기. 시안 D7 노트 — 「첫 진입 시 1회 노출 후 닫을 수 있음」.

  ✅ **쿠키로 확정**(2026-09-16 수연 결정). 시안 규칙표는 「닫힘 여부는 서버에
  저장」이라고 적었지만, entries에 칸을 더하면 마이그레이션이 따라오고(운영 DB에
  잘못 실린 전력이 있다, AGENTS.md 「DB」) 스트립 하나가 질 위험이 아니다.
  손해는 다른 기기에서 한 번 더 보이는 것뿐이다.

  (그래도 옮겨야 할 날이 오면 header-read.ts의 `STRIP_COOKIE` 읽는 줄 하나만
  바꾸면 된다 — 판정은 `stripDismissed` 불리언 하나만 받는다.)
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
