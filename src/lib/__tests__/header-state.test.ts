/*
  상태별 헤더 판정 — 시안 「헤더 상태별 시안 v1.0」의 조합기(MAP)를 그대로 돌린다.
    1장 조합기 MAP.pub  6유저 × 7시즌 = 42칸 → resolvePublicHeader
    1장 조합기 MAP.app  참가자·탈락·실격 × 7시즌  → resolveDashboardHeader
    4장 A1~A7                                     → resolveAdminHeader
  여기에 시각 표기(D-day·24:00·SLA)를 더한다.

  돌리는 법:  npm test
  DB를 건드리지 않는다 — 판정이 순수 함수라 환경변수도 필요 없다.

  시안의 judge·verify는 우리 phase에 없다(header-state.ts 머리 주석). 공개
  헤더는 stage와 같은 칸(P3=P4, P8)이라 racing 하나로 셋을 대신하고, 참가자
  헤더는 entry.stage와 stages.closes_at으로 D3·D4를 따로 만든다.
*/
import { describe, expect, it } from "vitest";

import { EntryStage, EntryStatus, SeasonPhase, StageKey } from "@/generated/prisma/enums";
import {
  conversionRate,
  currentStage,
  dayDiff,
  fmtDday,
  fmtHoursLeft,
  fmtMD,
  fmtMDHM,
  initialOf,
  nextSeasonLabel,
  resolveAdminHeader,
  resolveDashboardHeader,
  resolvePublicHeader,
  toHeaderSeason,
  toHeaderUser,
  type AdminHeaderInput,
  type DashboardHeaderInput,
  type HeaderSeason,
  type HeaderUser,
  type StageInfo,
} from "@/lib/header-state";

// ── 시각 표기 ─────────────────────────────────────────────────
describe("시각 표기(KST)", () => {
  it("MM.DD와 MM.DD HH:mm", () => {
    expect(fmtMD(new Date("2026-09-28T00:00:00+09:00"))).toBe("09.28");
    expect(fmtMDHM(new Date("2026-10-04T23:59:00+09:00"))).toBe("10.04 23:59");
  });
  it("자정은 전날 24:00으로 적는다(시안 「집계 확정 11.01 24:00」)", () => {
    expect(fmtMDHM(new Date("2026-11-02T00:00:00+09:00"))).toBe("11.01 24:00");
  });
  it("D-day는 달력일 차이다", () => {
    const now = new Date("2026-10-03T10:00:00+09:00");
    expect(dayDiff(now, new Date("2026-10-04T23:59:00+09:00"))).toBe(1);
    expect(fmtDday(now, new Date("2026-10-04T23:59:00+09:00"))).toBe("D-1");
    expect(fmtDday(now, new Date("2026-10-03T23:59:00+09:00"))).toBe("D-day");
    expect(fmtDday(now, new Date("2026-10-02T23:59:00+09:00"))).toBe("지남");
  });
  it("SLA 남은 시간은 시간 단위, 1시간 미만이면 분", () => {
    const now = new Date("2026-10-06T10:00:00+09:00");
    expect(fmtHoursLeft(now, new Date("2026-10-07T17:00:00+09:00"))).toBe("31시간");
    expect(fmtHoursLeft(now, new Date("2026-10-06T10:20:00+09:00"))).toBe("20분");
    expect(fmtHoursLeft(now, new Date("2026-10-06T09:00:00+09:00"))).toBe("지연");
  });
  it("전환율은 소수 첫째 자리, 분모를 모르면 null", () => {
    expect(conversionRate(137, 3262)).toBe(4.2);
    expect(conversionRate(8, 158)).toBe(5.1);
    expect(conversionRate(8, null)).toBeNull();
    expect(conversionRate(8, 0)).toBeNull();
  });

  it("다음 시즌 이름과 아바타 글자", () => {
    expect(nextSeasonLabel("시즌 1")).toBe("시즌 2");
    expect(nextSeasonLabel("PROOVIT 리그")).toBe("다음 시즌");
    expect(initialOf("리틀포션")).toBe("리");
    expect(initialOf("  ")).toBe("?");
  });
});

// ── 축 ──────────────────────────────────────────────────────
describe("축 변환", () => {
  it("phase → 시안 시즌 축", () => {
    expect(toHeaderSeason(SeasonPhase.pre_apply)).toBe("pre");
    expect(toHeaderSeason(SeasonPhase.recruiting)).toBe("recruit");
    expect(toHeaderSeason(SeasonPhase.racing)).toBe("stage");
    expect(toHeaderSeason(SeasonPhase.awarded)).toBe("done");
    expect(toHeaderSeason(SeasonPhase.archived)).toBe("arch");
  });
  it("유저 축은 역할 → 참가 상태 순서다", () => {
    expect(toHeaderUser({ user: null, entry: null })).toBe("guest");
    expect(toHeaderUser({ user: { roles: [] }, entry: null })).toBe("member");
    expect(toHeaderUser({ user: { roles: ["admin"] }, entry: { status: EntryStatus.active } })).toBe("admin");
    expect(toHeaderUser({ user: { roles: [] }, entry: { status: EntryStatus.active } })).toBe("entrant");
    expect(toHeaderUser({ user: { roles: [] }, entry: { status: EntryStatus.eliminated } })).toBe("elim");
    expect(toHeaderUser({ user: { roles: [] }, entry: { status: EntryStatus.withdrawn } })).toBe("elim");
    expect(toHeaderUser({ user: { roles: [] }, entry: { status: EntryStatus.disqualified } })).toBe("dq");
  });
});

// ── 공개 헤더 — 시안 MAP.pub 42칸 ────────────────────────────
const SEASONS: HeaderSeason[] = ["pre", "recruit", "stage", "done", "arch"];
const PUB: Record<HeaderUser, string[]> = {
  guest: ["P1", "P2", "P3", "P5", "P6"],
  member: ["P1", "P7", "P8", "P5", "P6"],
  entrant: ["P1", "P9", "P9", "P9", "P9"],
  elim: ["P1", "P7", "P10", "P10", "P6"],
  dq: ["P1", "P7", "P10", "P10", "P6"],
  admin: ["P11", "P11", "P11", "P11", "P11"],
};

function pub(kind: HeaderSeason, user: HeaderUser, extra: { unread?: number; s4Started?: boolean } = {}) {
  return resolvePublicHeader({
    season: {
      kind,
      slug: "season-1",
      title: "시즌 1",
      flags: { notifications: true },
      s4Started: extra.s4Started ?? true,
    },
    user: user === "guest" ? null : { kind: user, initial: "김", unread: extra.unread ?? 0 },
  });
}

describe("공개 헤더 — 조합기 MAP.pub", () => {
  for (const user of Object.keys(PUB) as HeaderUser[]) {
    it(`${user}`, () => {
      SEASONS.forEach((season, i) => {
        expect(pub(season, user).variant, `${user}/${season}`).toBe(PUB[user][i]);
      });
    });
  }

  it("내비는 시즌만 본다 — 리그 소개는 없고, 리더보드는 s4 시작일부터", () => {
    expect(pub("pre", "guest").nav).toEqual([]);
    expect(pub("recruit", "guest").nav).toEqual([]);
    expect(pub("stage", "guest", { s4Started: false }).nav).toEqual([]);
    expect(pub("stage", "guest").nav.map((n) => n.label)).toEqual(["리더보드"]);
    expect(pub("done", "guest").nav.map((n) => n.label)).toEqual(["리더보드"]);
    expect(pub("arch", "guest").nav.map((n) => n.label)).toEqual(["리더보드"]);
    /* 운영자도 시즌을 따른다 — P11 프레임은 우측 액션만 고정이다 */
    expect(pub("pre", "admin").nav).toEqual([]);
  });

  it("「시즌 아카이브」는 화면이 보류라 어느 시즌에도 그리지 않는다(2026-09-16)", () => {
    for (const s of SEASONS) {
      expect(pub(s, "guest").nav.map((n) => n.label)).not.toContain("시즌 아카이브");
    }
  });

  it("CTA — 규칙표 「공개 CTA」", () => {
    expect(pub("pre", "guest").actions.map((a) => a.label)).toEqual(["사전 신청하기"]);
    expect(pub("recruit", "guest").actions[0]).toMatchObject({ label: "참가 신청하기", href: "/apply", variant: "primary" });
    expect(pub("stage", "guest").actions[0]).toMatchObject({ label: "리더보드 보기", short: "리더보드", variant: "outline" });
    expect(pub("done", "guest").actions.map((a) => [a.label, a.variant])).toEqual([
      ["결과 보기", "ghost"],
      ["시즌 2 알림 받기", "primary"],
    ]);
    expect(pub("arch", "guest").actions[0].label).toBe("시즌 2 사전 신청하기");
    expect(pub("stage", "member").actions[0]).toMatchObject({ label: "시즌 2 알림 받기", variant: "outline" });
    expect(pub("stage", "entrant").actions[0]).toMatchObject({ label: "내 대시보드", variant: "outline", href: "/dashboard" });
    expect(pub("stage", "elim").actions[0]).toMatchObject({ label: "내 대시보드", variant: "gray" });
    expect(pub("stage", "admin").actions[0]).toMatchObject({ label: "운영 콘솔", variant: "violet", href: "/admin" });
  });

  it("로그인 링크는 비로그인 모집 중부터", () => {
    expect(pub("pre", "guest").login).toBe(false);
    expect(pub("recruit", "guest").login).toBe(true);
    expect(pub("stage", "guest").login).toBe(true);
    /* P5는 ver4를 따라 켠다 — 종료 후 참가자가 대시보드로 갈 유일한 길이다 */
    expect(pub("done", "guest").login).toBe(true);
    /* 로그인한 사람에게는 아바타가 그 자리를 대신한다 */
    expect(pub("recruit", "member").login).toBe(false);
  });

  it("벨·아바타·ADMIN 태그", () => {
    expect(pub("stage", "member")).toMatchObject({ bell: null, avatar: { initial: "김", admin: false } });
    expect(pub("stage", "entrant").bell).toEqual({ dot: false });
    expect(pub("stage", "entrant", { unread: 2 }).bell).toEqual({ dot: true });
    expect(pub("stage", "elim").bell).toBeNull();
    expect(pub("stage", "admin")).toMatchObject({ adminTag: true, avatar: { initial: "A", admin: true } });
    /* 시안대로 P5·P6에는 아바타가 없다 */
    expect(pub("done", "member").avatar).toBeNull();
  });

  it("인앱 알림이 꺼진 시즌이면 참가자 벨도 없다", () => {
    const m = resolvePublicHeader({
      season: { kind: "stage", slug: "s", title: "시즌 1", flags: { notifications: false }, s4Started: true },
      user: { kind: "entrant", initial: "리", unread: 3 },
    });
    expect(m.bell).toBeNull();
  });

  it("열린 시즌이 없으면 홈 버튼만", () => {
    const m = resolvePublicHeader({ season: null, user: null });
    expect(m.nav).toEqual([]);
    expect(m.actions[0]).toMatchObject({ label: "홈", href: "/" });
  });
});

// ── 참가자 헤더 ──────────────────────────────────────────────
const NOW = new Date("2026-10-14T10:00:00+09:00");
const STAGES: StageInfo[] = [
  { key: StageKey.s1, name: "아이디어 등록", isGate: false, opensAt: new Date("2026-09-28T00:00:00+09:00"), closesAt: new Date("2026-10-04T23:59:00+09:00") },
  { key: StageKey.s2, name: "수요조사", isGate: true, opensAt: new Date("2026-10-05T00:00:00+09:00"), closesAt: new Date("2026-10-11T23:59:00+09:00") },
  { key: StageKey.s3, name: "빌드와 배포", isGate: false, opensAt: new Date("2026-10-12T00:00:00+09:00"), closesAt: new Date("2026-10-18T23:59:00+09:00") },
  { key: StageKey.s4, name: "유저 유입", isGate: false, opensAt: new Date("2026-10-19T00:00:00+09:00"), closesAt: new Date("2026-10-25T23:59:00+09:00") },
  { key: StageKey.s5, name: "트래픽과 매출", isGate: true, opensAt: new Date("2026-10-26T00:00:00+09:00"), closesAt: new Date("2026-11-02T00:00:00+09:00") },
];

function dash(over: Partial<DashboardHeaderInput> & { phase?: SeasonPhase } = {}) {
  const { phase = SeasonPhase.racing, ...rest } = over;
  const input: DashboardHeaderInput = {
    now: NOW,
    season: {
      title: "시즌 1",
      slug: "season-1",
      phase,
      startsAt: new Date("2026-09-28T00:00:00+09:00"),
      endsAt: new Date("2026-11-03T00:00:00+09:00"),
      flags: { notifications: true },
    },
    team: { name: "루틴메이트", members: 2 },
    entry: { stage: EntryStage.s3, status: EntryStatus.active },
    onboardingComplete: true,
    stages: STAGES,
    gateSubmittedAt: null,
    reviewSlaHours: 48,
    finalRank: null,
    elimination: null,
    sanction: null,
    unread: 1,
    initial: "리",
    nextSeason: null,
    stripDismissed: false,
    ...rest,
  };
  return resolveDashboardHeader(input);
}

describe("참가자 헤더 — 조합기 MAP.app", () => {
  it("모집 중 → D1 (제출 버튼 없음, 개막일)", () => {
    const m = dash({ phase: SeasonPhase.recruiting, entry: { stage: EntryStage.applied, status: EntryStatus.active } });
    expect(m.variant).toBe("D1");
    expect(m.banner).toMatchObject({ tone: "base", stage: "시즌 1, 모집 중", go: null });
    expect(m.banner.time).toEqual([{ text: "개막 09.28" }]);
    expect(m.bell).toEqual({ dot: true, red: false });
  });

  it("레이스 중 온보딩 미완 → D1 모양, s1 마감만 알린다", () => {
    const m = dash({ entry: { stage: EntryStage.applied, status: EntryStatus.active }, onboardingComplete: false });
    expect(m.variant).toBe("D1");
    expect(m.banner.time).toEqual([{ text: "s1 마감 10.04" }]);
  });

  it("스테이지 진행 → D2 기본형", () => {
    const m = dash();
    expect(m.variant).toBe("D2");
    expect(m.banner).toMatchObject({ tone: "base", stage: "s3 빌드와 배포" });
    expect(m.banner.time).toEqual([{ text: "마감 10.18, D-4" }]);
    expect(m.banner.go).toEqual({ label: "제출 바로가기", short: "제출", href: "/dashboard/submit/s3", tone: "lime" });
    expect(m.banner.timeShort).toEqual([{ text: "D-4" }]);
  });

  it("D-1 이하 → D2 긴급형(오렌지, 마감 시각, 지금 제출하기)", () => {
    const m = dash({ now: new Date("2026-10-03T09:00:00+09:00"), entry: { stage: EntryStage.applied, status: EntryStatus.active } });
    expect(m.banner).toMatchObject({ tone: "urgent", stage: "s1 아이디어 등록" });
    expect(m.banner.time).toEqual([{ text: "마감 10.04, D-1 23:59" }]);
    expect(m.banner.timeShort).toEqual([{ text: "D-1 23:59" }]);
    expect(m.banner.go?.label).toBe("지금 제출하기");
  });

  it("게이트 심사 중 → D3 (SLA 남은 시간, 바이올렛)", () => {
    const m = dash({
      now: new Date("2026-10-12T10:00:00+09:00"),
      entry: { stage: EntryStage.s2, status: EntryStatus.active },
      gateSubmittedAt: new Date("2026-10-11T17:00:00+09:00"),
    });
    expect(m.variant).toBe("D3");
    expect(m.banner).toMatchObject({ tone: "judge", live: "violet", stage: "s2 1차 심사 중" });
    expect(m.banner.time).toEqual([{ text: "회신까지 31시간" }]);
    expect(m.banner.go).toEqual({ label: "심사 결과", href: "/dashboard/judgments", tone: "violet" });
  });

  it("게이트 2는 「발표 MM.DD 내」", () => {
    const m = dash({ entry: { stage: EntryStage.s5, status: EntryStatus.active } });
    expect(m.banner).toMatchObject({ stage: "s5 최종 심사 중" });
    expect(m.banner.time).toEqual([{ text: "발표 11.03 내" }]);
  });

  it("s5 창이 열린 s4 팀 → D4 집계 확정 대기(틸, 자동 제출 확인)", () => {
    const m = dash({ now: new Date("2026-10-28T10:00:00+09:00"), entry: { stage: EntryStage.s4, status: EntryStatus.active } });
    expect(m.variant).toBe("D4");
    expect(m.banner).toMatchObject({ tone: "verify", live: "teal", stage: "s5 트래픽과 매출" });
    expect(m.banner.time).toEqual([{ text: "집계 확정 11.01 24:00" }]);
    expect(m.banner.go?.label).toBe("자동 제출 확인");
  });

  it("종료·시상 → D5 (🏆, 최종 순위)", () => {
    const m = dash({ phase: SeasonPhase.awarded, finalRank: 3 });
    expect(m.variant).toBe("D5");
    expect(m.banner.stage).toBe("🏆 시즌 1 종료");
    expect(m.banner.time).toEqual([{ text: "최종 " }, { text: "3", num: true }, { text: "위" }]);
    expect(m.banner.go?.label).toBe("결과 보기");
  });

  it("아카이브 → D6 (자물쇠, 읽기 전용, 벨 없음, 우측 CTA)", () => {
    const m = dash({ phase: SeasonPhase.archived });
    expect(m.variant).toBe("D6");
    expect(m.banner).toMatchObject({ tone: "arch", lock: true, stage: "시즌 1 아카이브", go: null });
    expect(m.bell).toBeNull();
    expect(m.action).toMatchObject({ label: "시즌 2 알림 받기", variant: "outline" });
    const m2 = dash({ phase: SeasonPhase.archived, entry: { stage: EntryStage.s3, status: EntryStatus.eliminated }, nextSeason: { label: "시즌 2", startsAt: null, recruiting: true } });
    expect(m2.variant).toBe("D6");
    expect(m2.action?.label).toBe("시즌 2 참가하기");
  });

  it("다음 시즌 모집 중인 아카이브 → D9 (블루, 직전 성적 칩)", () => {
    const m = dash({
      phase: SeasonPhase.archived,
      finalRank: 3,
      nextSeason: { label: "시즌 2", startsAt: new Date("2027-01-05T00:00:00+09:00"), recruiting: true },
    });
    expect(m.variant).toBe("D9");
    expect(m.team.chip).toEqual([{ text: "시즌 1, " }, { text: "3", num: true }, { text: "위" }]);
    expect(m.banner).toMatchObject({ tone: "next", stage: "시즌 2, 모집 중" });
    expect(m.banner.time).toEqual([{ text: "개막 01.05" }]);
    expect(m.banner.go?.label).toBe("시즌 2 참가 신청");
  });

  it("탈락 → D7 (회색 스트립 닫기 가능, 점선 배너, 벨 없음)", () => {
    const m = dash({ entry: { stage: EntryStage.s2, status: EntryStatus.eliminated } });
    expect(m.variant).toBe("D7");
    expect(m.strip).toMatchObject({ tone: "gray", dismissible: true, link: { label: "안내 보기" } });
    expect(m.banner).toMatchObject({ tone: "elim", stage: "시즌 1 진행 중" });
    expect(m.banner.time).toEqual([{ text: "관전 모드" }]);
    expect(m.banner.go).toMatchObject({ label: "리더보드 보기", tone: "gray" });
    expect(m.bell).toBeNull();
    expect(dash({ entry: { stage: EntryStage.s2, status: EntryStatus.eliminated }, stripDismissed: true }).strip).toBeNull();
    /* 사유를 알면 문구가 시안 예문이 된다 */
    const m2 = dash({ entry: { stage: EntryStage.s2, status: EntryStatus.eliminated }, elimination: { gate: StageKey.s2, submitted: false } });
    expect(m2.strip?.text.map((s) => s.text).join("")).toBe("s2 게이트 미제출로 시즌 1 경쟁에서 제외되었어요. 리더보드와 참가작은 계속 볼 수 있어요.");
    expect(dash({ entry: { stage: EntryStage.s2, status: EntryStatus.eliminated }, elimination: { gate: StageKey.s2, submitted: true } }).strip?.text[0].text).toBe("s2 게이트 미통과로 ");
    /* 게이트 밖에서 떨어졌으면(운영자 수동 탈락) 어느 게이트라고 단정하지 않는다 */
    const m3 = dash({ entry: { stage: EntryStage.s3, status: EntryStatus.eliminated }, elimination: null });
    expect(m3.strip?.text.map((s) => s.text).join("")).toBe("시즌 1 경쟁에서 제외되었어요. 리더보드와 참가작은 계속 볼 수 있어요.");
    expect(m3.strip?.text[0]).toMatchObject({ strong: true });
    /* 자진 포기도 관전 모드다 */
    expect(dash({ entry: { stage: EntryStage.s2, status: EntryStatus.withdrawn } }).variant).toBe("D7");
  });

  it("실격 → D8 (레드 스트립 고정, 소명 D-day, 레드 벨)", () => {
    const m = dash({
      now: new Date("2026-10-26T10:00:00+09:00"),
      entry: { stage: EntryStage.s4, status: EntryStatus.disqualified },
      sanction: { reason: "bot_traffic", appealDeadlineAt: new Date("2026-10-30T23:59:00+09:00"), appealedAt: null },
    });
    expect(m.variant).toBe("D8");
    expect(m.strip).toMatchObject({ tone: "red", live: true, dismissible: false });
    expect(m.strip?.text.map((s) => s.text).join("")).toBe(
      "레이스 지표 어뷰징 판정으로 실격 처리되었어요. 소명은 10.30 23:59까지 가능해요.",
    );
    expect(m.banner).toMatchObject({ tone: "dq", stage: "실격 처리" });
    expect(m.banner.time).toEqual([{ text: "소명 D-4" }]);
    expect(m.banner.go).toEqual({ label: "소명하기", href: "/dashboard/appeal", tone: "red" });
    expect(m.bell).toEqual({ dot: true, red: true });
  });

  it("소명 제출 후에는 「소명 접수됨」 회색, 「검토 중」", () => {
    const m = dash({
      entry: { stage: EntryStage.s4, status: EntryStatus.disqualified },
      sanction: { reason: null, appealDeadlineAt: new Date("2026-10-30T23:59:00+09:00"), appealedAt: new Date("2026-10-27T00:00:00+09:00") },
    });
    expect(m.banner.time).toEqual([{ text: "검토 중" }]);
    expect(m.banner.go).toMatchObject({ label: "소명 접수됨", tone: "gray" });
  });

  it("탈락·실격도 아카이브에서는 D6", () => {
    expect(dash({ phase: SeasonPhase.archived, entry: { stage: EntryStage.s2, status: EntryStatus.eliminated } }).variant).toBe("D6");
    expect(dash({ phase: SeasonPhase.archived, entry: { stage: EntryStage.s2, status: EntryStatus.disqualified } }).variant).toBe("D6");
  });
});

// ── 운영자 헤더 ──────────────────────────────────────────────
const QUEUES: AdminHeaderInput["queues"] = {
  leads: 137, leadsConversion: null, entries: 24, onboardingIncomplete: 3, stagePending: 8,
  reviewsPending: 18, reviewsSlaUnder12h: 3, metricsPending: 20, abuseFlags: 2, appealsPending: 1, nextSeasonLeads: null,
};

function adm(over: Partial<AdminHeaderInput> & { phase?: SeasonPhase; now?: Date } = {}) {
  const { phase = SeasonPhase.racing, now = NOW, ...rest } = over;
  const input: AdminHeaderInput = {
    now,
    season: { id: "s1", title: "시즌 1", phase, startsAt: new Date("2026-09-28T00:00:00+09:00"), endsAt: new Date("2026-11-03T00:00:00+09:00") },
    seasons: [{ id: "s1", title: "시즌 1", phase }],
    stages: STAGES,
    recruitDeadline: new Date("2026-09-27T23:59:00+09:00"),
    queues: QUEUES,
    nextSeason: null,
    email: "admin@proovit.kr",
    ...rest,
  };
  return resolveAdminHeader(input);
}

/* `.ad-q`는 플렉스라 조각마다 gap이 붙는다 — 보이는 대로 공백 하나로 잇는다 */
const flat = (segs: { text: string }[]) => segs.map((s) => s.text.trim()).join(" ");

describe("운영자 헤더 — A1~A7", () => {
  it("A1 모집 전 — 리드 수. 전환율은 값이 있을 때만", () => {
    const m = adm({ phase: SeasonPhase.pre_apply });
    expect(m.variant).toBe("A1");
    expect(m.badge).toEqual({ tone: "blue", label: "모집 전" });
    expect(flat(m.queues[0].segs)).toBe("사전 신청 리드 137 명");
    const m2 = adm({ phase: SeasonPhase.pre_apply, queues: { ...QUEUES, leadsConversion: 4.2 } });
    expect(flat(m2.queues[0].segs)).toBe("사전 신청 리드 137 명 전환율 4.2%");
  });

  it("A2 모집 중 — 신청 팀 수와 목표, 온보딩 미완료는 오렌지로 우측", () => {
    const m = adm({ phase: SeasonPhase.recruiting });
    expect(m.variant).toBe("A2");
    expect(m.badge).toEqual({ tone: "lime", label: "모집 중" });
    expect(flat(m.queues[0].segs)).toBe("신청 24 팀 목표 20~40 마감 09.27");
    expect(m.queues[1]).toMatchObject({ tone: "w" });
    expect(flat(m.queues[1].segs)).toBe("온보딩 미완료 3 팀");
  });

  it("A3 스테이지 진행 — 지금 스테이지 배지에 도트, 대기열 1개", () => {
    const m = adm();
    expect(m.variant).toBe("A3");
    expect(m.badge).toEqual({ tone: "lime", live: "lime", label: "s3 빌드와 배포" });
    expect(m.queues).toHaveLength(1);
    expect(m.queues[0].tone).toBe("t");
    expect(flat(m.queues[0].segs)).toBe("배포 URL 검증 대기 8 건");
  });

  it("A4 게이트 심사 중 — 게이트 창이 닫히고 판정이 남았을 때", () => {
    const m = adm({ now: new Date("2026-10-12T10:00:00+09:00"), stages: STAGES.slice(0, 2) });
    expect(m.variant).toBe("A4");
    expect(m.badge).toEqual({ tone: "violet", live: "violet", label: "게이트 1 심사 중" });
    expect(flat(m.queues[0].segs)).toBe("심사 대기 18 건");
    expect(m.queues[1]).toMatchObject({ tone: "r" });
    expect(flat(m.queues[1].segs)).toBe("SLA 12시간 미만 3 건");
  });

  it("A5 집계 확정 — s5 창이 열려 있는 동안(참가자 D4와 같은 구간)", () => {
    const m = adm({ now: new Date("2026-10-28T10:00:00+09:00") });
    expect(m.variant).toBe("A5");
    expect(flat(m.queues[0].segs)).toBe("지표 검토 대기 20 팀 확정 11.01 24:00");
  });

  it("A5 집계 확정 — s5 창이 닫히고 판정 대기가 없을 때", () => {
    const m = adm({
      now: new Date("2026-11-02T10:00:00+09:00"),
      queues: { ...QUEUES, reviewsPending: 0 },
    });
    expect(m.variant).toBe("A5");
    expect(m.badge).toEqual({ tone: "teal", label: "집계 확정 중" });
    expect(flat(m.queues[0].segs)).toBe("지표 검토 대기 20 팀 확정 11.01 24:00");
    expect(flat(m.queues[1].segs)).toBe("어뷰징 플래그 2 건");
  });

  it("A6 종료 — 시상 발표일, 소명 검토", () => {
    const m = adm({ phase: SeasonPhase.awarded });
    expect(m.variant).toBe("A6");
    expect(m.badge.label).toBe("🏆 시즌 종료");
    expect(flat(m.queues[0].segs)).toBe("시상 발표 11.03 최종 순위 확정됨");
    expect(flat(m.queues[1].segs)).toBe("소명 검토 1 건");
    /* 소명 0건이면 대기열 자리가 빈다(A6 노트) */
    expect(adm({ phase: SeasonPhase.awarded, queues: { ...QUEUES, appealsPending: 0 } }).queues).toHaveLength(1);
  });

  it("A7 아카이브 — 셀렉트에 두 시즌, 다음 시즌 리드", () => {
    const m = adm({
      phase: SeasonPhase.archived,
      seasons: [
        { id: "s2", title: "시즌 2", phase: SeasonPhase.draft },
        { id: "s1", title: "시즌 1", phase: SeasonPhase.archived },
      ],
      nextSeason: { title: "시즌 2", startsAt: new Date("2027-01-05T00:00:00+09:00") },
      queues: { ...QUEUES, nextSeasonLeads: 41 },
    });
    expect(m.variant).toBe("A7");
    expect(m.seasons.map((s) => s.label)).toEqual(["시즌 2 (준비 중)", "시즌 1 (아카이브)"]);
    expect(m.seasons.find((s) => s.selected)?.label).toBe("시즌 2 (준비 중)");
    expect(m.badge).toEqual({ tone: "gray", label: "준비 중" });
    expect(flat(m.queues[0].segs)).toBe("시즌 2 사전 신청 41 명 개막 01.05");
  });

  it("지금 스테이지는 창이 열린 것 중 마지막이다", () => {
    expect(currentStage(STAGES, new Date("2026-10-20T00:00:00+09:00"))?.key).toBe("s4");
    expect(currentStage(STAGES, new Date("2026-09-01T00:00:00+09:00"))?.key).toBe("s1");
  });
});
