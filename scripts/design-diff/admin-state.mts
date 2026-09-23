/*
  운영자 화면 대조용 dev DB 상태 스위치 — `admin.mjs`가 부른다.

    node --env-file=.env.development.local --import tsx scripts/design-diff/admin-state.mts save
    node --env-file=.env.development.local --import tsx scripts/design-diff/admin-state.mts dash
    node --env-file=.env.development.local --import tsx scripts/design-diff/admin-state.mts metrics:q
    node --env-file=.env.development.local --import tsx scripts/design-diff/admin-state.mts restore

  판 이름은 그 화면의 시안 목업과 같은 모양의 행을 심은 뒤 **운영자 세션 토큰
  한 줄**을 찍는다. 심은 행은 id를 떠 둔 파일(`admin-state.json`)에 적어 두고
  `restore`가 그것만 지운다 — 원래 있던 행은 건드리지 않는다.

  심는 일 자체는 개발 바 「운영 콘솔」 줄과 같은 함수(`setSandboxAdmin`)가 한다.

  ⚠️ **반드시 .env.development.local로 돌린다.** `.env`는 운영 DB다.
*/
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkDevSandbox } from "../../src/lib/dev-sandbox";
import {
  clearSandboxAdmin,
  setSandboxAdmin,
  type AdminFixture,
} from "../../src/lib/dev-admin-fixture";
import { prisma } from "../../src/lib/prisma";

const check = checkDevSandbox();
if (!check.ok) throw new Error(`[admin-state] ${check.reason}`);

const DIR = join(tmpdir(), "proovit-design-diff");
mkdirSync(DIR, { recursive: true });
const SNAP = join(DIR, "admin-state.json");

const cmd = process.argv[2];

async function adminSession(): Promise<string> {
  const admin = await prisma.userRole.findFirst({
    where: { role: { key: "admin" } },
    select: { userId: true },
  });
  if (!admin) throw new Error("[admin-state] dev DB에 운영자 계정이 없다");
  const token = crypto.randomUUID();
  await prisma.session.create({
    data: { sessionToken: token, userId: admin.userId, expires: new Date(Date.now() + 3_600_000) },
  });
  return token;
}

if (cmd === "save") {
  if (existsSync(SNAP)) {
    throw new Error(`[admin-state] ${SNAP}이 남아 있다 — 지난 대조가 restore를 안 했다. 먼저 restore`);
  }
  writeFileSync(SNAP, JSON.stringify({ fixtures: [] }));
  console.log("admin-state: 떠 둠");
} else if (cmd === "restore") {
  if (!existsSync(SNAP)) {
    console.log("admin-state: 되돌릴 것 없음");
  } else {
    const snap = JSON.parse(readFileSync(SNAP, "utf8")) as { fixtures: AdminFixture[] };
    for (const f of snap.fixtures.reverse()) await clearSandboxAdmin(f);
    rmSync(SNAP);
    console.log(`admin-state: 되돌림(심은 판 ${snap.fixtures.length}개 걷음)`);
  }
} else if (cmd) {
  if (!existsSync(SNAP)) throw new Error("[admin-state] save 먼저");
  const snap = JSON.parse(readFileSync(SNAP, "utf8")) as { fixtures: AdminFixture[] };
  const fixture = await setSandboxAdmin({ screen: cmd });
  snap.fixtures.push(fixture);
  writeFileSync(SNAP, JSON.stringify(snap));
  console.log(await adminSession());
} else {
  throw new Error("save · <화면>[:판] · restore");
}

await prisma.$disconnect();
