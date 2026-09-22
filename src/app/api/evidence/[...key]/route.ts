import { loadViewerState } from "@/lib/access";
import { parseEvidenceKey } from "@/lib/evidence";
import { evidenceStorage } from "@/lib/evidence-storage";

/*
  GET /api/evidence/{entryId}/{stageKey}/{slot}/{id}-{name} — 증빙 파일을 연다.

  보는 사람은 **그 팀의 팀원과 운영자**뿐이다. 남의 키는 404 — 403이면 「있는데
  못 본다」가 새어 나간다(api.ts의 규약). 응답은 캐시하지 않는다.

  R2면 5분짜리 서명 주소로 보낸다. 함수가 파일을 중계하지 않는다.
*/

const notFound = () => new Response(null, { status: 404 });

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ key: string[] }> },
) {
  const { key: parts } = await ctx.params;
  const key = parts.map((p) => decodeURIComponent(p)).join("/");
  const parsed = parseEvidenceKey(key);
  if (!parsed) return notFound();

  const viewer = await loadViewerState();
  if (!viewer.user) return new Response(null, { status: 401 });
  const isAdmin = viewer.user.roles.includes("admin");
  if (!isAdmin && viewer.entry?.id !== parsed.entryId) return notFound();

  const storage = evidenceStorage();
  if (!storage) return notFound();

  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (storage.mode === "r2") {
    return new Response(null, {
      status: 302,
      headers: { ...headers, Location: await storage.signedUrl(key, parsed.name) },
    });
  }
  const file = await storage.get(key);
  if (!file) return notFound();
  return new Response(file.body, {
    headers: {
      ...headers,
      "Content-Type": file.contentType,
      "Content-Length": String(file.body.byteLength),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(parsed.name)}`,
    },
  });
}
