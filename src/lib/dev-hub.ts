import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { devToolsEnabled } from "@/lib/dev-env";

/*
  개발 바가 마지막으로 누른 허브 판 — `dev-clock.ts`와 같은 자리, 같은 이유로
  파일이다(쿠키는 랜딩 정적 렌더를 끄고, DB에는 개발용 칸을 안 둔다).

  **왜 있나.** 시안 h9(시즌 아카이브)와 h16(종료 후 쓰기 시도)은 DB 상태가
  같다 — 갈리는 것은 「방금 쓰려고 했다」는 사건뿐이다. 제품에서는 막힌 쓰기가
  허브로 돌려보내며 `?readonly=1`을 붙여 그 사건을 전하고, 개발 바는 그 사건을
  만들 수 없으니 여기에 「h16을 눌렀다」를 남긴다(2026-09-21 수연 지시 —
  「개발 바에서 종료 후 쓰기 시도 칩 선택이 안 돼」).

  ⚠️ 운영에서는 파일을 아예 안 읽는다.
*/

const FILE = join(tmpdir(), "proovit-design-diff", "dev-hub.json");
const dev = devToolsEnabled;

/** 마지막으로 누른 판. 안 눌렀으면 null */
export function devHubKey(): string | null {
  if (!dev) return null;
  try {
    const raw = JSON.parse(readFileSync(FILE, "utf8")) as { key?: string };
    return raw.key ?? null;
  } catch {
    return null;
  }
}

export function setDevHubKey(key: string | null): void {
  if (!dev) throw new Error("[dev-hub] 개발 빌드에서만 씁니다.");
  if (!key) {
    try {
      rmSync(FILE);
    } catch {
      /* 원래 없었으면 할 일이 없다 */
    }
    return;
  }
  mkdirSync(join(tmpdir(), "proovit-design-diff"), { recursive: true });
  writeFileSync(FILE, JSON.stringify({ key }, null, 2));
}
