/*
  온보딩 화면을 다시 보기 위해 onboarded_at을 비운다. **개발용이다.**

  이 화면은 한 번 마치면 다시 안 뜨는 게 정상이라(로그인마다 뜨면 안 된다)
  UI를 고칠 때마다 값을 되돌려야 볼 수 있다.

  ⚠️ 반드시 dev 브랜치에서만 돌린다. .env.development.local이 dev를 가리키므로
  아래처럼 그 파일을 실어서 부른다:

    set -a; source .env.development.local; set +a; npx tsx scripts/reset-onboarding.ts

  운영(.env)으로 돌리면 실제 사용자를 온보딩 미완 상태로 되돌린다.
*/
// 생성 위치가 src/generated/prisma라 @prisma/client로는 안 잡힌다.
// 어댑터 설정까지 끝난 싱글턴을 그대로 쓴다 (seed.ts와 같은 방식).
import { prisma } from "../src/lib/prisma";

/*
  운영 브랜치를 실수로 건드리지 않게 한 번 더 막는다.

  ⚠️ 브랜치 ID(br-rapid-king-azsa2r0t)가 아니라 **엔드포인트 호스트**로 검사한다.
  Neon은 둘을 다른 이름으로 부르고 접속 주소에 들어가는 건 엔드포인트 쪽이다.
  브랜치 ID로 검사하면 dev에서도 항상 막힌다(실제로 그랬다).
*/
const DEV_ENDPOINT = "ep-floral-truth-azjbh0bs";
const host = new URL(process.env.DATABASE_URL ?? "").host;
if (!host.startsWith(DEV_ENDPOINT)) {
  console.error(`중단: dev 브랜치가 아니다 (host=${host})`);
  console.error("set -a; source .env.development.local; set +a 로 실어서 부를 것");
  process.exit(1);
}

// tsx가 cjs로 변환해서 최상위 await을 못 쓴다 — main()으로 감싼다.
async function main() {
  const result = await prisma.user.updateMany({ data: { onboardedAt: null } });
  console.log(`onboarded_at을 비웠다 — ${result.count}건 (host=${host})`);
  await prisma.$disconnect();
}

void main();
