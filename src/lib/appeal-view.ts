import type { ClausePart } from "@/components/Clauses";
import {
  APPEAL_BUSINESS_DAYS,
  RESPONSE_BUSINESS_DAYS,
  addBusinessDays,
  endOfSeoulDay,
} from "@/lib/appeal";

/*
  소명 — 시안 ver4 `#scr-appeal` 두 판(`.sb[data-pane]`)의 계산.

    ① ap-write  소명 대상 고르기 · 사유 · 증빙 · 접수 기한 상자 · 접수 버튼
    ② ap-sent   접수 시각 · 회신 기한 · 상태, 회신이 오면 운영진 회신 카드

  화면(app/dashboard/appeal)은 여기서 만든 값을 그릴 뿐이고, DB를 읽는 것은
  `appeal-store.ts`다. 여기는 순수 함수라 테스트가 돈다.

  **판은 접수 기록이 있는가다.** 하나라도 접수했으면 ②이고 그 기록(들)을 최신
  순으로 보인다 — 시안에 「접수됐는데 또 쓰는」 판이 없다(내가 정함, 2026-09-23,
  수연 확인 대기). 소명 대상이 하나도 없어도 ①을 그린다(고르개가 비고 버튼이
  잠긴다).

  소명 대상 셋 — 시안의 「실격 처분 (10.22 통지)」·「지표 제재 (-214 보정)」에
  1차 게이트 미통과(심사 결과 ③의 「판정에 이의신청하기」가 여기로 온다)를 더했다.
    sanction    제재(경고·주간 무효·실격·시상 취소). 운영진이 정한 소명 기한이
                있으면(`appeal_deadline_at`) 그것이 접수 기한이다
    abuse_flag  어뷰징 플래그 — 보정된 방문 수가 있으면 그 수를 이름에 적는다
    judgment    게이트 판정(fail)
  접수 기한은 통지 후 5영업일의 **그날 끝**(허브 h12·심사 결과 ③과 같은 규칙).
*/

export type AppealPane = "write" | "sent";

export type AppealTargetKind = "sanction" | "abuse_flag" | "judgment";

/** DB에서 읽은 소명 대상 한 줄 — 이름을 짓는 데 필요한 것만 */
export type AppealTargetRow = {
  kind: AppealTargetKind;
  id: string;
  /** 통지 시각 — 제재는 적용(없으면 결정), 플래그는 생성, 판정은 판정 시각 */
  noticeAt: Date;
  /** 운영진이 박아 둔 소명 기한(제재만). 있으면 계산값보다 앞선다 */
  deadlineAt?: Date | null;
  /** 제재 종류 — `SanctionStage`의 값 */
  sanctionStage?: string;
  /** 주간 무효의 주차 */
  week?: number | null;
  /** 플래그가 보정한 방문 수(음수) */
  adjusted?: number | null;
  /** 판정의 게이트 — `StageKey`의 값 */
  stageKey?: string;
  /** 이미 접수했는가 */
  appealed: boolean;
};

export type AppealTarget = {
  /** 폼 값 — 「종류:id」 */
  value: string;
  label: string;
  noticeAt: Date;
  /** 접수 기한 */
  appealBy: Date;
  appealed: boolean;
};

export type AppealRecord = {
  id: string;
  submittedAt: Date;
  responseDueAt: Date | null;
  responseText: string | null;
  respondedAt: Date | null;
  corrected: boolean;
};

export type AppealView = {
  pane: AppealPane;
  targets: AppealTarget[];
  /** 최신 순 */
  appeals: AppealRecord[];
};

export const targetValue = (kind: AppealTargetKind, id: string) => `${kind}:${id}`;

const KINDS: readonly AppealTargetKind[] = ["sanction", "abuse_flag", "judgment"];

/** 폼 값을 되돌린다. 모양이 아니면 null */
export function parseTargetValue(value: string): { kind: AppealTargetKind; id: string } | null {
  const at = value.indexOf(":");
  if (at < 0) return null;
  const kind = value.slice(0, at);
  const id = value.slice(at + 1);
  if (!KINDS.includes(kind as AppealTargetKind) || !id) return null;
  return { kind: kind as AppealTargetKind, id };
}

/** 접수 기한 — 운영진이 정한 것이 있으면 그것, 없으면 통지 후 5영업일의 그날 끝 */
export function appealDeadline(row: Pick<AppealTargetRow, "noticeAt" | "deadlineAt">): Date {
  return row.deadlineAt ?? endOfSeoulDay(addBusinessDays(row.noticeAt, APPEAL_BUSINESS_DAYS));
}

/** 회신 기한 — 접수 후 5영업일의 그날 끝 */
export function responseDeadline(submittedAt: Date): Date {
  return endOfSeoulDay(addBusinessDays(submittedAt, RESPONSE_BUSINESS_DAYS));
}

export function buildAppealView(args: {
  targets: AppealTargetRow[];
  appeals: AppealRecord[];
  label: (row: AppealTargetRow) => string;
}): AppealView {
  const appeals = [...args.appeals].sort(
    (a, b) => b.submittedAt.getTime() - a.submittedAt.getTime(),
  );
  const targets = [...args.targets]
    .sort((a, b) => b.noticeAt.getTime() - a.noticeAt.getTime())
    .map((row) => ({
      value: targetValue(row.kind, row.id),
      label: args.label(row),
      noticeAt: row.noticeAt,
      appealBy: appealDeadline(row),
      appealed: row.appealed,
    }));
  return { pane: appeals.length ? "sent" : "write", targets, appeals };
}

/**
 * 운영진 회신의 강조 — `**제재를 해제**`를 강조 조각으로. 시안 ②의 회신은
 * 결론 한 구절을 청록 굵은 글씨로 세운다(`<b style="color:var(--teal)">`).
 * 회신은 운영진이 쓰는 글이라 표시를 글 안에 둔다(내가 정함, 2026-09-23,
 * 수연 확인 대기). 짝이 안 맞는 `**`는 글자 그대로 둔다.
 */
export function emphasisParts(
  text: string,
  em: (text: string, key: number) => ClausePart,
): ClausePart[] {
  const out: ClausePart[] = [];
  const re = /\*\*([^*\n]+?)\*\*/g;
  let last = 0;
  let key = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(em(m[1], key++));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** 강조 표시를 뗀 맨 글 — 글자 수 검사·검색용 */
export const plainText = (text: string) => text.replace(/\*\*([^*\n]+?)\*\*/g, "$1");
