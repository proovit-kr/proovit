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
  HUB_PLANS,
  setSandboxCurrentStage,
  setSandboxHub,
  setSandboxMeasurement,
  setSandboxPace,
  setSandboxPayment,
  setSandboxPhase,
  setSandboxStage,
  setSandboxStatus,
  setSandboxSubmit,
  setSandboxTeam,
  setSandboxTeamSize,
  setMetricsFixture,
  type HubKey,
  type MetricsFixture,
  type SubmitPane,
} from "@/lib/dev-sandbox";
import type { PaymentPane } from "@/lib/payment";
import { getSessionUser } from "@/lib/access";
import { loginAsTestAccount, logout } from "@/lib/dev-session";
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

/**
 * 허브 한 판 — 시안 `#hubSel`의 한 줄. 진도·페이즈·온보딩·집계·「오늘」을
 * 한꺼번에 옮긴다(표는 `dev-sandbox.ts`의 `HUB_PLANS`).
 */
export async function devSetHub(formData: FormData): Promise<void> {
  guard();

  const entryId = String(formData.get("entryId") ?? "");
  const key = String(formData.get("key") ?? "") as HubKey;
  if (!entryId || !HUB_PLANS[key]) {
    throw new Error("[dev] entryId·key가 잘못됐습니다.");
  }

  /* 팀장(제출물의 `submitted_by`)은 보관을 푼 뒤 저쪽이 직접 찾는다 */
  await setSandboxHub({ key, entryId });
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

/** 팀원 수 1인·2인 — 팀 관리 화면의 두 판을 보는 줄 */
export async function devSetTeamSize(formData: FormData): Promise<void> {
  guard();

  const teamId = String(formData.get("teamId") ?? "");
  const raw = String(formData.get("size") ?? "");
  if (!teamId || (raw !== "1" && raw !== "2")) {
    throw new Error("[dev] teamId·size가 잘못됐습니다.");
  }
  await setSandboxTeamSize({ teamId, size: raw === "1" ? 1 : 2 });
  refresh();
}

/** 측정 연동 세 판(시안 ①②③) — 검증 대기·검증됨·실패 */
export async function devSetMeasurement(formData: FormData): Promise<void> {
  guard();

  const entryId = String(formData.get("entryId") ?? "");
  const raw = String(formData.get("state") ?? "");
  if (!entryId || !["wait", "ok", "fail"].includes(raw)) {
    throw new Error("[dev] entryId·state가 잘못됐습니다.");
  }
  await setSandboxMeasurement({ entryId, state: raw as "wait" | "ok" | "fail" });
  refresh();
}

export async function devSetPayment(formData: FormData): Promise<void> {
  guard();

  const entryId = String(formData.get("entryId") ?? "");
  const raw = String(formData.get("pane") ?? "");
  if (!entryId || !["none", "pending", "ok", "inq"].includes(raw)) {
    throw new Error("[dev] entryId·pane가 잘못됐습니다.");
  }
  await setSandboxPayment({ entryId, pane: raw as PaymentPane });
  refresh();
}

/** 스테이지 제출 화면의 판 — 시안 목업 제출물을 심는다(`setSandboxSubmit`) */
export async function devSetSubmit(formData: FormData): Promise<void> {
  guard();

  const entryId = String(formData.get("entryId") ?? "");
  const raw = String(formData.get("pane") ?? "");
  if (!entryId || !["s3", "s4"].includes(raw)) {
    throw new Error("[dev] entryId·pane가 잘못됐습니다.");
  }
  await setSandboxSubmit({ entryId, pane: raw as SubmitPane });
  refresh();
}

/*
  레이스 중 지금 스테이지를 고른다 — 가정한 「오늘」을 그 주차로 옮기고,
  **내 팀 진도도 그 주차에 맞춘다**(2026-09-21 수연 지시).

  둘이 따로 놀던 때는 s1 주차를 골라도 진도가 s3이면 화면이 s3 그대로였다.
  화면을 보려고 누르는 줄이라 「그 주차를 지나는 팀」이 되는 편이 쓸모 있다.

  ⚠️ 진도를 옮기는 것은 **로그인한 사람의 팀 하나**다. 다른 팀은 그대로 둔다 —
  리더보드·참가작 화면이 여러 진도가 섞인 모습을 그려야 한다.
*/
export async function devSetCurrentStage(formData: FormData): Promise<void> {
  guard();

  const seasonId = String(formData.get("seasonId") ?? "");
  const stage = toEnum(StageKey, formData.get("stage"));
  if (!seasonId || !stage) throw new Error("[dev] seasonId·stage가 잘못됐습니다.");

  await setSandboxCurrentStage({ seasonId, stage });

  const user = await getSessionUser();
  if (user) {
    /* 팀장인 팀만 옮긴다 — 제출물의 `submitted_by`가 팀장이어야 한다 */
    const mine = await prisma.entry.findFirst({
      where: {
        seasonId,
        team: { members: { some: { userId: user.id, role: "leader" } } },
      },
      select: { id: true },
    });
    if (mine) {
      await setSandboxPace({ entryId: mine.id, stage });
    }
  }
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

/*
  로그인 ↔ 비로그인. 공개 화면이 관전자에게 어떻게 보이는지 보려고 매번
  로그아웃했다가 소셜 로그인을 다시 타는 일을 없앤다.

  세션은 **만들지 않는다** — 쿠키를 빼 뒀다 돌려놓을 뿐이다(dev-session.ts).
  그래서 처음 한 번은 평소대로 로그인해야 하고, 그 뒤부터 이 줄로 오간다.
*/
export async function devSetAuth(formData: FormData): Promise<void> {
  guard();

  const raw = String(formData.get("on") ?? "");
  if (raw !== "1" && raw !== "0") throw new Error("[dev] on이 잘못됐습니다.");

  if (raw === "1") await loginAsTestAccount();
  else await logout();
  /*
    ⚠️ **이 액션만 화면을 다시 부른다**(DevBarClient의 `AuthPick`).
    서버 액션이 같은 요청 안에서 다시 그리는데 그 렌더가 읽는 `cookies()`는
    바꾸기 전의 것이라, 여기서 끝내면 비로그인으로 바꿔 놓고도 바에 내 닉네임이
    그대로 찍힌다 — 바에 찍힌 값과 화면이 어긋나는 순간 도구가 함정이 된다.

    `redirect()`로 해결하려다 되돌렸다. 리다이렉트를 걸면 여기서 쓴 쿠키가
    아예 반영되지 않는다(2026-09-21 확인).

    그래서 `refresh()`도 부르지 않는다 — 어차피 화면을 통째로 다시 부르므로
    할 일이 겹치는데, `revalidatePath("/", "layout")`가 레이아웃 전체를 다시
    그리느라 dev에서 버튼 한 번에 20초가 걸렸다(2026-09-21 측정).
  */
}
