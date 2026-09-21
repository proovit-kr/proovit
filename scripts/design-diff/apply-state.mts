/*
  참가 신청 대조용 dev DB 상태 스위치.

    node --env-file=.env.development.local --import tsx scripts/design-diff/apply-state.mts save
    node --env-file=.env.development.local --import tsx scripts/design-diff/apply-state.mts form
    node --env-file=.env.development.local --import tsx scripts/design-diff/apply-state.mts done
    node --env-file=.env.development.local --import tsx scripts/design-diff/apply-state.mts restore

  `form`·`done`은 **마지막 줄에 세션 토큰 하나만** 찍는다(consent-session.mts와
  같은 약속). `apply.mjs`가 그 줄을 받아 쿠키로 심는다.

  시안은 상태 바 버튼으로 `data-state`를 바꾸지만 우리는 **시즌 페이즈와 참가
  기록**이 그 둘을 만든다(page.tsx).
    ① 작성      모집 중(`resolveLandingCta(season).kind === "APPLY"`)이고
                 로그인한 계정에 이 시즌 참가 기록이 **없다**
    ② 신청 완료  같은 모집 중이되 그 계정에 참가 기록이 **있다**

  ②의 요약 카드 값은 시안 목업 그대로 만든다(팀명 「리틀포션」·아이디어
  「1인 카페 레시피 구독」). 그래야 상자 값만이 아니라 글자까지 대조된다.

  ⚠️ **아무것도 지우지 않는다 — 내가 만든 것만 지운다.**
  다른 계정의 참가를 모집 상태로 되돌리거나 지우는 대신 **대조 전용 계정**을
  따로 두고 그 계정의 팀·참가만 만들고 치운다. 시드 팀·수연의 개발용 계정은
  건드리지 않는다.

  ⚠️ **`consents`는 append-only 로그다**(노션 DEV3, 스키마 주석).
  `consents.entry_id`가 `Restrict`라 참가에 달린 동의 행을 먼저 지우지 않으면
  참가가 안 지워진다. `restore`가 지우는 것은 정확히 이 둘뿐이다.
    · `userId = 대조 전용 계정` **이면서** `entryId = 이 스크립트가 만든 참가`인 동의 행
    · 그 참가와, 그 참가가 매달린 1인 팀(팀원 행 포함)
  계정 단위 동의(`entryId: null`)는 **남긴다** — 그건 「이미 가입해 쓰고 있는
  회원」이라는 이 계정의 성격이고, 지우면 다음 실행이 동의 모달에 막힌다.

  ⚠️ **`restore`를 빠뜨리면 다음 사람이 픽스처를 정본으로 착각한다**
  (season-state.mts와 같은 경고). 페이즈를 모집 중으로 옮겼으면 되돌린다.
  `apply.mjs`는 중간에 죽어도 되돌리도록 `finally`에서 부른다.

  ⚠️ **반드시 .env.development.local로 돌린다.** `.env`는 운영 DB다
  (consent-session.mts와 같은 가드).
*/
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ConsentType, MemberRole, SeasonPhase } from "../../src/generated/prisma/enums";
import {
  ACCOUNT_PRIVACY_CONSENT_VERSION,
  ACCOUNT_TERMS_CONSENT_VERSION,
  EVIDENCE_CONSENT_VERSION,
  METRICS_CONSENT_VERSION,
} from "../../src/content/consent";
import { loadAccountConsentNeed } from "../../src/lib/account-consent";
import { checkDevSandbox, setSandboxPhase } from "../../src/lib/dev-sandbox";
import { prisma } from "../../src/lib/prisma";
import { resolveLandingCta } from "../../src/lib/season";

const check = checkDevSandbox();
if (!check.ok) throw new Error(`[apply-state] ${check.reason}`);

const DIR = join(tmpdir(), "proovit-design-diff");
mkdirSync(DIR, { recursive: true });
const SNAP = join(DIR, "apply-state.json");

/* 대조 전용 계정. 수연·윤서의 실제 계정은 쓰지 않는다 */
const EMAIL = "apply-diff@example.com";
/* 시안 목업 값(2124~2127행) */
const TEAM_NAME = "리틀포션";
const IDEA_TITLE = "1인 카페 레시피 구독";

const SLUG = process.env.SEASON_SLUG ?? "season-1";
const season = await prisma.season.findUniqueOrThrow({
  where: { slug: SLUG },
  select: { id: true, phase: true, featureFlags: true },
});

/** 화면 로그는 stderr로 보낸다 — stdout의 마지막 줄은 세션 토큰 자리다 */
const log = (line: string) => console.error(line);

/**
 * 대조 전용 계정. 없으면 만들고, 계정 동의가 비었으면 채운다.
 *
 * ⚠️ 계정 동의가 없으면 `ConsentGate`가 **모든 화면 위에** 모달을 띄워
 * 참가 신청 화면을 덮는다(dev-sandbox.ts의 같은 주석). ②를 재려고 왔는데
 * 모달을 재게 되는 자리라 여기서 막는다.
 */
async function ensureUser(): Promise<string> {
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    /* 온보딩이 끝난 계정이어야 신청 화면이 바로 열린다 */
    update: {},
    create: {
      email: EMAIL,
      name: "대조용",
      nickname: "대조용",
      onboardedAt: new Date(),
      oauthAccounts: {
        create: { provider: "google", providerAccountId: "apply-diff" },
      },
    },
    select: { id: true },
  });

  const need = await loadAccountConsentNeed(user.id);
  if (need.needed) {
    await prisma.consent.createMany({
      data: [
        {
          userId: user.id,
          entryId: null,
          type: ConsentType.terms,
          granted: true,
          version: ACCOUNT_TERMS_CONSENT_VERSION,
        },
        {
          userId: user.id,
          entryId: null,
          type: ConsentType.privacy,
          granted: true,
          version: ACCOUNT_PRIVACY_CONSENT_VERSION,
        },
      ],
    });
    log("  계정 동의를 채웠다(동의 모달이 화면을 덮지 않게)");
  }
  return user.id;
}

/**
 * 이 스크립트가 만든 팀·참가를 찾는다.
 *
 * ⚠️ **이름만으로 고르면 남의 팀을 지운다.** dev DB에는 2026-08-14부터 수연의
 * 개인 계정이 팀장인 「리틀포션」이 이미 있다(참가작 「1인 카페 시그니처 레시피
 * 구독」). 시안 목업이 같은 이름을 쓰는 탓에 겹친 것이라, **팀원이 대조 전용
 * 계정 하나뿐인 팀만** 고른다. 이 조건이 둘을 가른다.
 */
async function fixtureEntries(userId: string) {
  return prisma.entry.findMany({
    where: {
      seasonId: season.id,
      team: {
        name: TEAM_NAME,
        members: { some: { userId }, every: { userId } },
      },
    },
    select: { id: true, teamId: true },
  });
}

/**
 * 픽스처를 치운다. 지우는 순서가 곧 위 경고의 내용이다 —
 * 동의 행(이 계정 + 이 참가) → 참가 → 팀(팀원 행은 cascade).
 */
async function clearFixture(userId: string): Promise<void> {
  const entries = await fixtureEntries(userId);
  if (!entries.length) return;
  const entryIds = entries.map((e) => e.id);
  const teamIds = [...new Set(entries.map((e) => e.teamId))];

  const gone = await prisma.consent.deleteMany({
    where: { userId, entryId: { in: entryIds } },
  });
  await prisma.entry.deleteMany({ where: { id: { in: entryIds } } });
  await prisma.team.deleteMany({ where: { id: { in: teamIds } } });
  log(`  픽스처 치움: 참가 ${entryIds.length}건 · 팀 ${teamIds.length}개 · 동의 로그 ${gone.count}행`);
}

/** 시안 ② 그대로의 참가 한 건. 1인 팀이 아니라 팀 참가다(시안에 표기가 없다) */
async function makeEntry(userId: string): Promise<void> {
  const team = await prisma.team.create({
    data: {
      name: TEAM_NAME,
      isSolo: false,
      members: { create: { userId, role: MemberRole.leader } },
    },
    select: { id: true },
  });
  const entry = await prisma.entry.create({
    data: {
      seasonId: season.id,
      teamId: team.id,
      ideaTitle: IDEA_TITLE,
      appliedAt: new Date(),
    },
    select: { id: true },
  });
  /*
    참가에는 참가 동의 2종이 반드시 따라붙는다(apply-store.ts의 트랜잭션).
    동의 없이 참가만 만들면 DB에 존재할 수 없는 모양이 된다.
  */
  await prisma.consent.createMany({
    data: [
      {
        userId,
        entryId: entry.id,
        type: ConsentType.metrics_public,
        granted: true,
        version: METRICS_CONSENT_VERSION,
      },
      {
        userId,
        entryId: entry.id,
        type: ConsentType.evidence,
        granted: true,
        version: EVIDENCE_CONSENT_VERSION,
      },
    ],
  });
  log(`  참가 만듦: ${TEAM_NAME} / ${IDEA_TITLE}`);
}

/** 모집 중으로 옮긴다. 판정은 화면과 같은 함수로 확인한다 */
async function openRecruiting(): Promise<void> {
  await setSandboxPhase({ seasonId: season.id, phase: SeasonPhase.recruiting });
  const after = await prisma.season.findUniqueOrThrow({ where: { id: season.id } });
  const cta = resolveLandingCta(after).kind;
  if (cta !== "APPLY") {
    throw new Error(`모집 중이 아니다: phase=${after.phase}, CTA=${cta}`);
  }
  log(`  페이즈 ${season.phase} → ${after.phase} (CTA ${cta})`);
}

/** 세션 한 시간. 토큰은 stdout 마지막 줄 */
async function issueSession(userId: string): Promise<string> {
  const token = crypto.randomUUID();
  await prisma.session.create({
    data: {
      sessionToken: token,
      userId,
      expires: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return token;
}

const mode = process.argv[2];

if (mode === "save") {
  writeFileSync(
    SNAP,
    JSON.stringify({ phase: season.phase, featureFlags: season.featureFlags }, null, 2),
  );
  log(`저장 → ${SNAP}`);
  log(`  페이즈 ${season.phase}`);
} else if (mode === "form" || mode === "done") {
  const userId = await ensureUser();
  await openRecruiting();
  /* 어느 쪽이든 먼저 비운다 — ②를 재고 ①로 넘어갈 때 기록이 남아 있으면 안 된다 */
  await clearFixture(userId);
  if (mode === "done") await makeEntry(userId);
  log(`${mode}로 바꿈`);
  console.log(await issueSession(userId));
} else if (mode === "restore") {
  const snap = JSON.parse(readFileSync(SNAP, "utf8")) as {
    phase: SeasonPhase;
    featureFlags: unknown;
  };
  /* 되돌릴 때는 계정을 새로 만들지 않는다 — 없으면 픽스처도 없다 */
  const user = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true },
  });
  if (user) await clearFixture(user.id);
  await prisma.season.update({
    where: { id: season.id },
    data: { phase: snap.phase, featureFlags: snap.featureFlags as never },
  });
  log(`되돌림: 페이즈 ${snap.phase}`);
} else {
  throw new Error("save · form · done · restore 중 하나를 준다");
}

await prisma.$disconnect();
