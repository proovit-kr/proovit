import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { AwsClient } from "aws4fetch";

import { EVIDENCE_KINDS, kindOfName } from "@/lib/evidence";

/*
  증빙 파일 저장소 — Cloudflare R2(S3 호환). 키 넷이 있으면 R2, 없으면 개발
  서버는 리포의 `.data/evidence/`에 쓴다(gitignore). 운영에서 키가 빠지면 저장소가
  **없는 것**으로 두어 업로드가 안내와 함께 막힌다 — 서버리스 디스크는 요청마다
  사라지므로 거기 쓰는 척하면 안 된다.

  R2를 고른 이유는 06 ARCHITECTURE(무료 10GB, 이그레스 무료). SDK 대신
  aws4fetch(65KB)로 서명만 한다 — @aws-sdk/client-s3는 10MB가 넘고 우리가 쓰는
  건 PUT·GET·DELETE·LIST 넷뿐이다.

  ⚠️ 파일은 **공개 주소가 없다.** 읽기는 `/api/evidence/{key}`가 권한을 본 뒤
    · R2면 5분짜리 서명 주소로 보내고(함수가 10MB를 중계하지 않는다),
    · 로컬이면 파일을 그대로 흘린다.
*/

/** fetch 본문으로 바로 쓸 수 있는 바이트(ArrayBuffer 위의 것) */
export type Bytes = Uint8Array<ArrayBuffer>;

export type EvidenceStorage = {
  mode: "r2" | "local";
  put(key: string, bytes: Bytes, contentType: string): Promise<void>;
  remove(keys: readonly string[]): Promise<void>;
  /** 로컬만. R2는 `signedUrl`로 연다 */
  get(key: string): Promise<{ body: Bytes; contentType: string } | null>;
  /** R2만 */
  signedUrl(key: string, filename: string): Promise<string>;
  list(prefix: string): Promise<string[]>;
};

const SIGNED_URL_TTL = 300;

const contentTypeOf = (key: string) => {
  const kind = kindOfName(key);
  return kind ? EVIDENCE_KINDS[kind] : "application/octet-stream";
};

const decodeXml = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');

function r2Storage(): EvidenceStorage | null {
  const account = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!account || !accessKeyId || !secretAccessKey || !bucket) return null;

  const client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  const base = `https://${account}.r2.cloudflarestorage.com/${bucket}`;
  const urlOf = (key: string) => `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const check = async (res: Response, what: string) => {
    if (!res.ok && res.status !== 404) {
      throw new Error(`[evidence] R2 ${what} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    return res;
  };

  return {
    mode: "r2",
    async put(key, bytes, contentType) {
      await check(
        await client.fetch(urlOf(key), {
          method: "PUT",
          body: bytes,
          headers: { "Content-Type": contentType, "Content-Length": String(bytes.byteLength) },
        }),
        "PUT",
      );
    },
    async remove(keys) {
      for (const key of keys) {
        await check(await client.fetch(urlOf(key), { method: "DELETE" }), "DELETE");
      }
    },
    async get() {
      return null;
    },
    async signedUrl(key, filename) {
      const url = new URL(urlOf(key));
      url.searchParams.set("X-Amz-Expires", String(SIGNED_URL_TTL));
      /* 서명에 들어가므로 받는 쪽이 못 바꾼다 — 새 탭에서 인라인으로 연다 */
      url.searchParams.set(
        "response-content-disposition",
        `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
      const signed = await client.sign(new Request(url, { method: "GET" }), {
        aws: { signQuery: true },
      });
      return signed.url;
    },
    async list(prefix) {
      const url = new URL(base);
      url.searchParams.set("list-type", "2");
      url.searchParams.set("prefix", prefix);
      const res = await check(await client.fetch(url.toString(), { method: "GET" }), "LIST");
      const xml = await res.text();
      return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => decodeXml(m[1]));
    },
  };
}

const LOCAL_ROOT = path.join(process.cwd(), ".data", "evidence");

/** 키에 `..`이 없다는 것은 parseEvidenceKey가 보장하지만, 루트 밖으로 못 나가게 한 번 더 */
const localPath = (key: string) => {
  const full = path.join(LOCAL_ROOT, ...key.split("/"));
  if (!full.startsWith(LOCAL_ROOT + path.sep)) {
    throw new Error("[evidence] 키가 루트 밖을 가리킨다");
  }
  return full;
};

function localStorage(): EvidenceStorage {
  return {
    mode: "local",
    async put(key, bytes) {
      const full = localPath(key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, bytes);
    },
    async remove(keys) {
      for (const key of keys) await rm(localPath(key), { force: true });
    },
    async get(key) {
      try {
        /* Buffer는 풀의 조각일 수 있어 제 버퍼로 복사한다 — 개발 전용 경로라 괜찮다 */
        const body = Uint8Array.from(await readFile(localPath(key)));
        return { body, contentType: contentTypeOf(key) };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async signedUrl() {
      throw new Error("[evidence] 로컬 저장소는 서명 주소가 없다");
    },
    async list(prefix) {
      let entries: string[];
      try {
        entries = await readdir(LOCAL_ROOT, { recursive: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
      }
      return entries
        .map((rel) => rel.split(path.sep).join("/"))
        .filter((key) => key.startsWith(prefix) && key.split("/").length === 4);
    },
  };
}

let cached: EvidenceStorage | null | undefined;

/** 저장소. 운영에서 R2 키가 없으면 null — 업로드가 안내와 함께 막힌다 */
export function evidenceStorage(): EvidenceStorage | null {
  if (cached !== undefined) return cached;
  cached = r2Storage() ?? (process.env.NODE_ENV === "production" ? null : localStorage());
  return cached;
}
