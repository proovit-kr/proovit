/*
  결제 연동 대조용 dev DB 상태 스위치 — 시안 세 판(none · ok · inq)과 시안에 없는 pending.

    node --env-file=.env.development.local --import tsx scripts/design-diff/payment-state.mts save
    node --env-file=.env.development.local --import tsx scripts/design-diff/payment-state.mts ok
    node --env-file=.env.development.local --import tsx scripts/design-diff/payment-state.mts restore

  판 이름은 상태를 만든 뒤 **세션 토큰 한 줄**을 찍는다 — `payment.mjs`가 그것을
  쿠키로 심어 그 팀의 결제 연동 화면을 연다(measurement-state.mts와 같은 방식).

  판을 만드는 것은 개발 바의 「결제 연동」 줄과 같은 함수(`setSandboxPayment`)다.

  ⚠️ **반드시 .env.development.local로 돌린다.** `.env`는 운영 DB다.
*/
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  ChargeType,
  IntegrationStatus,
  PaymentProvider,
} from "../../src/generated/prisma/enums";
import {
  checkDevSandbox,
  setSandboxInquiries,
  setSandboxPayment,
  setSandboxRevenue,
} from "../../src/lib/dev-sandbox";
import { prisma } from "../../src/lib/prisma";

const check = checkDevSandbox();
if (!check.ok) throw new Error(`[payment-state] ${check.reason}`);

const DIR = join(tmpdir(), "proovit-design-diff");
mkdirSync(DIR, { recursive: true });
const SNAP = join(DIR, "payment-state.json");

const SLUG = process.env.HUB_SLUG ?? "season-1";
/* 시안 목업의 팀. 주소도 little-potion.proovit.kr라 ③의 문의 수단 주소까지 같다 */
const TEAM = process.env.HUB_TEAM ?? "리틀포션";

const season = await prisma.season.findUniqueOrThrow({
  where: { slug: SLUG },
  select: { id: true },
});
const entry = await prisma.entry.findFirstOrThrow({
  where: { seasonId: season.id, team: { name: TEAM } },
  select: {
    id: true,
    teamId: true,
    chargeType: true,
    inquiryUrl: true,
    integration: {
      select: {
        provider: true,
        merchantId: true,
        status: true,
        verifiedAt: true,
        lastTestedAt: true,
      },
    },
  },
});

const leader = (
  await prisma.teamMember.findFirst({
    where: { teamId: entry.teamId, role: "leader" },
    select: { userId: true },
  })
)?.userId;
if (!leader) throw new Error(`[payment-state] ${TEAM} 팀장을 못 찾았다`);

type Snap = {
  entryId: string;
  chargeType: ChargeType;
  inquiryUrl: string | null;
  integration: {
    provider: PaymentProvider;
    merchantId: string | null;
    status: IntegrationStatus;
    verifiedAt: string | null;
    lastTestedAt: string | null;
  } | null;
};

const PANES = ["none", "pending", "ok", "inq"] as const;
type Pane = (typeof PANES)[number];
const mode = process.argv[2];

if (mode === "save") {
  if (existsSync(SNAP)) {
    throw new Error(
      `[payment-state] 아직 되돌리지 않은 상태가 있다(${SNAP}). 먼저 restore한다.`,
    );
  }
  const snap: Snap = {
    entryId: entry.id,
    chargeType: entry.chargeType,
    inquiryUrl: entry.inquiryUrl,
    integration: entry.integration
      ? {
          provider: entry.integration.provider,
          merchantId: entry.integration.merchantId,
          status: entry.integration.status,
          verifiedAt: entry.integration.verifiedAt?.toISOString() ?? null,
          lastTestedAt: entry.integration.lastTestedAt?.toISOString() ?? null,
        }
      : null,
  };
  writeFileSync(SNAP, JSON.stringify(snap, null, 2));
  console.log(`저장 → ${SNAP}`);
  console.log(
    `  ${TEAM}: ${entry.chargeType}, ${entry.integration ? entry.integration.status : "연동 행 없음"}`,
  );
} else if ((PANES as readonly string[]).includes(mode)) {
  await setSandboxPayment({ entryId: entry.id, pane: mode as Pane });
  const token = crypto.randomUUID();
  await prisma.session.create({
    data: {
      sessionToken: token,
      userId: leader,
      expires: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  console.error(`${mode}: ${TEAM}`);
  console.log(token);
} else if (mode === "restore") {
  const snap = JSON.parse(readFileSync(SNAP, "utf8")) as Snap;
  /* ②가 심은 거래 행·③이 심은 리드 행은 모두 지운다 — 원래 dev DB에는 없던 것이다 */
  await setSandboxRevenue(snap.entryId, false);
  await setSandboxInquiries(snap.entryId, false);
  await prisma.entry.update({
    where: { id: snap.entryId },
    data: { chargeType: snap.chargeType, inquiryUrl: snap.inquiryUrl },
  });
  if (snap.integration) {
    const data = {
      provider: snap.integration.provider,
      merchantId: snap.integration.merchantId,
      status: snap.integration.status,
      verifiedAt: snap.integration.verifiedAt ? new Date(snap.integration.verifiedAt) : null,
      lastTestedAt: snap.integration.lastTestedAt
        ? new Date(snap.integration.lastTestedAt)
        : null,
    };
    await prisma.paymentIntegration.upsert({
      where: { entryId: snap.entryId },
      create: { entryId: snap.entryId, ...data },
      update: data,
    });
  } else {
    /* 원래 행이 없던 팀이다 — 판을 만들며 생긴 행을 지운다 */
    await prisma.paymentIntegration.deleteMany({ where: { entryId: snap.entryId } });
  }
  rmSync(SNAP, { force: true });
  console.log(
    `되돌림: ${snap.chargeType}, ${snap.integration ? snap.integration.status : "연동 행 없음"}`,
  );
} else {
  throw new Error("save · none · pending · ok · inq · restore 중 하나를 준다");
}

await prisma.$disconnect();
