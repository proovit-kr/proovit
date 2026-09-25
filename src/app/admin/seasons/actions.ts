"use server";

import { revalidatePath } from "next/cache";

import { SeasonPhase } from "@/generated/prisma/enums";
import { canAccess, getSessionUser, loadAccessContext } from "@/lib/access";
import { parseKstInput } from "@/lib/admin";
import {
  addTrack,
  setPhaseSchedule,
  setSeasonFlag,
  setSeasonPhase,
  setStageDates,
} from "@/lib/admin-store";
import { prisma } from "@/lib/prisma";
import { SCHEDULE_PHASES } from "@/lib/season-phase";

/*
  시즌 관리의 쓰기 다섯 — `op` 하나로 가른다.

    stages    스테이지 일정 다섯 줄
    flag      기능 플래그 하나
    track     트랙 추가
    schedule  페이즈 일정(크론이 읽는 `season_schedules`). racing 행은 개막
              (`seasons.starts_at`)도 같이 옮긴다(admin-store `setPhaseSchedule`)
    phase     페이즈 수동 전환(예외 경로 — 정본은 크론, ADR-010)

  전부 사유가 필수이고 감사 로그와 한 트랜잭션이다(admin-store.ts).

  ⚠️ **페이즈·플래그 하나가 화면 서른 개의 열림/닫힘을 바꾼다.** `/apply`가 열리고
  리더보드가 공개되고 제출이 잠긴다. 운영 화면만 새로 그리면 관전자는 옛 화면을
  계속 보므로 레이아웃째 다시 그린다.
*/

export type SeasonActionState = { message?: string; done?: number };

/** 기능 플래그 중 시안에 스위치가 있는 셋 — 폼 문자열을 그대로 믿지 않는다 */
const FLAG_KEYS = ["leaderboard", "testerAssignments", "credits"];

const HM = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
});

/** KST의 해와 「HH:MM」 */
function kstParts(d: Date): { year: number; hm: string } {
  const p = Object.fromEntries(HM.formatToParts(d).map((x) => [x.type, x.value]));
  return { year: Number(p.year), hm: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
}

/*
  「10.12」을 날짜로. 시각은 원래 값을 따른다 — 시작은 00:00, 마감은 23:59가 기본이고,
  마감이 다음 날 00:00이던 스테이지(마지막 스테이지의 「24:00」)는 화면에 전날로
  적혀 있으므로 하루를 더한다.
*/
function toDate(md: string, year: number, hm: string, midnightIsNextDay: boolean): Date | null {
  const m = /^(\d{1,2})\.(\d{1,2})$/.exec(md.trim());
  if (!m) return null;
  const d = new Date(`${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}T${hm}:00+09:00`);
  if (Number.isNaN(d.getTime())) return null;
  return midnightIsNextDay && hm === "00:00" ? new Date(d.getTime() + 86_400_000) : d;
}

export async function saveSeason(
  _prev: SeasonActionState,
  formData: FormData,
): Promise<SeasonActionState> {
  const user = await getSessionUser();
  if (!user) return { message: "로그인이 풀렸습니다." };

  const permission = canAccess("adminSeasons", await loadAccessContext());
  if (!permission.ok) return { message: permission.message };

  const op = String(formData.get("op") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!seasonId) return { message: "잘못된 요청입니다." };

  let result: { ok: true } | { ok: false; message: string };

  if (op === "stages") {
    let rows: { stageKey: string; opens: string; closes: string }[];
    try {
      rows = JSON.parse(String(formData.get("stages") ?? "[]"));
    } catch {
      return { message: "잘못된 요청입니다." };
    }
    const current = await prisma.stage.findMany({
      where: { seasonId },
      select: { stageKey: true, opensAt: true, closesAt: true },
    });
    const year =
      kstParts(current.find((c) => c.opensAt)?.opensAt ?? new Date()).year;
    const stages = [];
    for (const r of rows) {
      const cur = current.find((c) => c.stageKey === r.stageKey);
      if (!cur) return { message: "잘못된 요청입니다." };
      const opensAt = toDate(r.opens, year, cur.opensAt ? kstParts(cur.opensAt).hm : "00:00", false);
      const closesAt = toDate(r.closes, year, cur.closesAt ? kstParts(cur.closesAt).hm : "23:59", true);
      if (!opensAt || !closesAt) {
        return { message: `${r.stageKey} 날짜는 「10.12」처럼 적어 주세요.` };
      }
      stages.push({ stageKey: r.stageKey, opensAt, closesAt });
    }
    result = await setStageDates({ seasonId, stages, reason, actorId: user.id });
  } else if (op === "flag") {
    const key = String(formData.get("key") ?? "");
    if (!FLAG_KEYS.includes(key)) {
      return { message: "잘못된 요청입니다." };
    }
    result = await setSeasonFlag({
      seasonId, key, on: formData.get("on") === "1", reason, actorId: user.id,
    });
  } else if (op === "track") {
    result = await addTrack({
      seasonId, name: String(formData.get("name") ?? ""), reason, actorId: user.id,
    });
  } else if (op === "schedule") {
    let raw: unknown;
    try {
      raw = JSON.parse(String(formData.get("schedule") ?? "[]"));
    } catch {
      return { message: "잘못된 요청입니다." };
    }
    if (!Array.isArray(raw)) return { message: "잘못된 요청입니다." };
    const rows: { phase: SeasonPhase; startsAt: Date | null }[] = [];
    for (const r of raw as { phase?: unknown; at?: unknown }[]) {
      const phase = SCHEDULE_PHASES.find((p) => p === r?.phase);
      if (!phase || rows.some((x) => x.phase === phase)) {
        return { message: "잘못된 요청입니다." };
      }
      const at = String(r.at ?? "").trim();
      const startsAt = at ? parseKstInput(at) : null;
      if (at && !startsAt) {
        return { message: `${phase} 시각은 「2026-10-28 00:00」처럼 적어 주세요.` };
      }
      rows.push({ phase, startsAt });
    }
    result = await setPhaseSchedule({ seasonId, rows, reason, actorId: user.id });
  } else if (op === "phase") {
    const raw = String(formData.get("phase") ?? "");
    const phase = (Object.values(SeasonPhase) as string[]).includes(raw)
      ? (raw as SeasonPhase)
      : null;
    if (!phase) return { message: "잘못된 요청입니다." };
    result = await setSeasonPhase({ seasonId, phase, reason, actorId: user.id });
  } else {
    return { message: "잘못된 요청입니다." };
  }

  if (!result.ok) return { message: result.message };
  revalidatePath("/", "layout");
  return { done: Date.now() };
}
