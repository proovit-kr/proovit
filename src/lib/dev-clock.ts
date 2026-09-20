import { readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/*
  개발용 시계 — 「오늘」을 옮긴다.

  **왜 있나.** dev DB의 시즌은 10.12에 시작한다(수연의 임시 일정). 오늘은 그보다
  앞이라 어느 스테이지에도 안 들고, 그래서 「진행 중」 배지·D-day·리더보드 진행
  표시가 전부 빈다. 전에는 반대로 **일정을 지금 쪽으로 끌어와** 그 화면들을
  만들었는데, 그러면 볼 때마다 시즌 날짜가 달라져 수연이 세 번 걸렸다
  (2026-09-21). 이제는 **일정이 정본이고 오늘이 움직인다.**

  개발 바에서 스테이지 s2를 누르면 「오늘은 10.19」로 가정한다 — 일정은 그대로다.

  ⚠️ **파일에 둔다.** 쿠키는 못 쓴다 — 랜딩이 정적 렌더라 쿠키를 한 번 읽으면
  그게 통째로 꺼진다([[root-layout-no-cookies]]와 같은 사정). DB에 두자면 운영
  스키마에 개발용 칸이 생긴다. 파일이면 스키마도 안 건드리고 **동기**라
  `new Date()` 자리를 그대로 바꿔 끼울 수 있다(서버 컴포넌트가 async로 번지지 않는다).

  ⚠️ **운영에서는 파일을 아예 안 읽는다.** production 빌드이면 곧바로 지금을
  돌려준다. 이 모듈이 `dev-sandbox.ts`를 부르지 않는 것은 순환 참조를 피하려는
  것이다 — 쓰는 쪽(`setDevToday`를 부르는 자리)이 이미 `assertSandbox()`를 지난다.
*/

const FILE = join(tmpdir(), "proovit-design-diff", "dev-now.json");

const dev = process.env.NODE_ENV !== "production";

/** 가정한 오늘. 안 정했으면 null */
export function devToday(): Date | null {
  if (!dev) return null;
  try {
    const raw = JSON.parse(readFileSync(FILE, "utf8")) as { at?: string };
    if (!raw.at) return null;
    const at = new Date(raw.at);
    return Number.isNaN(at.getTime()) ? null : at;
  } catch {
    /* 파일이 없으면 안 정한 것이다 */
    return null;
  }
}

/**
 * 시각 판정의 「지금」. **판정에만 쓴다** — 무언가 일어난 때를 적는
 * 타임스탬프(`submittedAt`·`appliedAt` 등)는 진짜 지금이어야 한다.
 */
export function devNow(): Date {
  return devToday() ?? new Date();
}

/** 가정한 오늘을 정한다. `null`이면 진짜 오늘로 되돌린다 */
export function setDevToday(at: Date | null): void {
  if (!dev) throw new Error("[dev-clock] 개발 빌드에서만 씁니다.");
  if (!at) {
    try {
      rmSync(FILE);
    } catch {
      /* 원래 없었으면 할 일이 없다 */
    }
    return;
  }
  mkdirSync(join(tmpdir(), "proovit-design-diff"), { recursive: true });
  writeFileSync(FILE, JSON.stringify({ at: at.toISOString() }, null, 2));
}
