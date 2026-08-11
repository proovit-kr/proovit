import { handlers } from "@/lib/auth";

/*
  Auth.js의 모든 엔드포인트가 이 한 파일로 들어온다 —
  /api/auth/signin, /callback/:provider, /session, /signout, /csrf.

  Prisma(Neon 드라이버)를 쓰므로 Node 런타임이어야 한다. 엣지로 돌리면
  ws 모듈이 없어 커넥션이 만들어지지 않는다.
*/
export const runtime = "nodejs";

export const { GET, POST } = handlers;
