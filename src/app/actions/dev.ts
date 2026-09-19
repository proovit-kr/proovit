"use server";

import { revalidatePath } from "next/cache";

import {
  EntryStage,
  EntryStatus,
  SeasonPhase,
  StageKey,
} from "@/generated/prisma/enums";
import {
  checkDevSandbox,
  setSandboxCurrentStage,
  setSandboxPhase,
  setSandboxStage,
  setSandboxStatus,
  setSandboxTeam,
  setMetricsFixture,
  type MetricsFixture,
} from "@/lib/dev-sandbox";
import { getSessionUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";

/*
  개발용 상태 토글의 서버 액션.

  ⚠️ 모든 액션이 `checkDevSandbox()`를 **다시** 부른다. 화면이 바를 안 그렸다는
  사실은 아무것도 막지 못한다 — 서버 액션은 그 자체로 호출 가능한 엔드포인트다.
  (dev-sandbox.ts의 쓰기 함수들도 각자 한 번 더 본다. 세 겹이다.)

  ⚠️ 여기 있는 것은 **권한 판정이 아니다.** 운영자 권한을 확인하지 않는 이유는
  이 도구가 애초에 운영 DB에서 안 열리기 때문이다.

  ⚠️ 인자가 **FormData 하나**다. `<form action={fn}>`은 fn을 formData 한 개로
  부른다 — useActionState에 물릴 때만 (prevState, formData) 두 개가 된다.
  처음에 두 개로 써놓고 폼에 직접 걸었더니 formData가 undefined로 들어와
  버튼을 누를 때마다 터졌다. 이 도구는 상태 메시지를 안 쓰므로 한 개가 맞다.

  실패는 던진다. dev 전용이라 오버레이가 이유를 그대로 보여주는 편이,
  아무 일도 안 일어난 것처럼 보이는 것보다 낫다.
*/

/** 화면에서 온 문자열을 enum으로. 목록에 없으면 null */
function toEnum<T extends Record<string, string>>(
  values: T,
  raw: unknown,
): T[keyof T] | null {
  const value = String(raw ?? "");
  return (Object.values(values) as string[]).includes(value)
    ? (value as T[keyof T])
    : null;
}

function guard(): void {
  const check = checkDevSandbox();
  if (!check.ok) throw new Error(`[dev] ${check.reason}`);
}

/*
  바꾼 뒤 **레이아웃까지** 무효화한다. 헤더와 대시보드 내비가 페이즈·참가팀을
  읽어 그리므로(layout.tsx), 페이지만 갱신하면 메뉴가 옛 상태로 남는다.
*/
function refresh(): void {
  revalidatePath("/", "layout");
}

export async function devSetStage(formData: FormData): Promise<void> {
  guard();

  const entryId = String(formData.get("entryId") ?? "");
  const stage = toEnum(EntryStage, formData.get("stage"));
  if (!entryId || !stage) throw new Error("[dev] entryId·stage가 잘못됐습니다.");

  /*
    제출물을 만들 때 `submitted_by`에 넣을 사람이 필요하다. 지금 로그인한
    사람이 아니라 **그 팀의 팀장**이어야 한다 — 남의 팀 제출에 내 이름이 박히면
    제출 분쟁 화면을 검토할 때 화면이 거짓말을 한다.
  */
  const leader = await prisma.entry.findUnique({
    where: { id: entryId },
    select: {
      team: {
        select: {
          members: { where: { role: "leader" }, take: 1, select: { userId: true } },
        },
      },
    },
  });
  const leaderId = leader?.team.members[0]?.userId;
  if (!leaderId) throw new Error("[dev] 그 팀에 팀장이 없습니다.");

  await setSandboxStage({ entryId, stage, userId: leaderId });
  refresh();
}

export async function devSetStatus(formData: FormData): Promise<void> {
  guard();

  const entryId = String(formData.get("entryId") ?? "");
  const status = toEnum(EntryStatus, formData.get("status"));
  if (!entryId || !status) throw new Error("[dev] entryId·status가 잘못됐습니다.");

  await setSandboxStatus({ entryId, status });
  refresh();
}

export async function devSetPhase(formData: FormData): Promise<void> {
  guard();

  const seasonId = String(formData.get("seasonId") ?? "");
  const phase = toEnum(SeasonPhase, formData.get("phase"));
  if (!seasonId || !phase) throw new Error("[dev] seasonId·phase가 잘못됐습니다.");

  await setSandboxPhase({ seasonId, phase });
  refresh();
}

/*
  로그인한 계정의 참가팀 있음·없음. 대상은 폼이 아니라 **세션**에서 읽는다 —
  바가 말하는 「로그인한 계정」과 바뀌는 계정이 어긋날 수 없게.
*/
export async function devSetTeam(formData: FormData): Promise<void> {
  guard();

  const seasonId = String(formData.get("seasonId") ?? "");
  const raw = String(formData.get("on") ?? "");
  if (!seasonId || (raw !== "1" && raw !== "0")) {
    throw new Error("[dev] seasonId·on이 잘못됐습니다.");
  }
  const user = await getSessionUser();
  if (!user) throw new Error("[dev] 로그인한 계정이 없습니다.");

  await setSandboxTeam({ userId: user.id, seasonId, on: raw === "1" });
  refresh();
}

/** 레이스 중 지금 스테이지를 고른다 — 스테이지 날짜를 옮긴다 */
export async function devSetCurrentStage(formData: FormData): Promise<void> {
  guard();

  const seasonId = String(formData.get("seasonId") ?? "");
  const stage = toEnum(StageKey, formData.get("stage"));
  if (!seasonId || !stage) throw new Error("[dev] seasonId·stage가 잘못됐습니다.");

  await setSandboxCurrentStage({ seasonId, stage });
  refresh();
}

/*
  리더보드 세 상태를 만든다 — 집계 전 / 레이스 운영중 / 시즌 종료.
  참가작 상세의 순위·7일 추세, 내 지표의 14일 차트도 같은 데이터를 본다.
*/
export async function devSetMetrics(formData: FormData): Promise<void> {
  guard();

  const seasonId = String(formData.get("seasonId") ?? "");
  const raw = String(formData.get("kind") ?? "");
  const kinds: MetricsFixture[] = ["none", "race", "final"];
  if (!seasonId || !kinds.includes(raw as MetricsFixture)) {
    throw new Error("[dev] seasonId·kind가 잘못됐습니다.");
  }

  await setMetricsFixture({ seasonId, kind: raw as MetricsFixture });
  refresh();
}
