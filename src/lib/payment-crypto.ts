import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/*
  결제 조회키의 암호화 저장. **서버 전용이다** — `server-only` 표식은 안 붙인다.
  대조 상태 스크립트(tsx)가 dev-sandbox를 거쳐 이 파일을 읽는데 그 모듈이 Next
  밖에서는 없다. 클라이언트에서 부르면 `node:crypto`가 없어 번들이 깨지므로 그것이
  울타리다.

  스키마의 `readonly_key_enc`·`webhook_secret_enc`가 전제하는 「암호화」가 이것이다.
  2026-08-15에는 이 키가 없어 조회키를 아예 안 받았는데(dc9ab65, 내 판단), 시안
  ver4(09-10)가 조회 전용 키를 받으므로 받되 평문을 남기지 않는다.

  AES-256-GCM. 키는 `PAYMENT_KEY_SECRET`에서 HKDF로 뽑고, 없으면 `AUTH_SECRET`에서
  뽑는다(동의 IP 해시의 `CONSENT_IP_SALT ?? AUTH_SECRET`와 같은 전례). 나중에
  `PAYMENT_KEY_SECRET`을 따로 두면 그때부터 새 값은 그 키로 잠기고, 옛 값은
  못 푼다 — 회전이 필요하면 푼 뒤 다시 잠그는 스크립트가 따라와야 한다.

  저장 모양: `v1.<iv>.<tag>.<암호문>` (각각 base64url). `v1`은 나중에 키·방식을
  바꿀 때 옛 값을 구별하려고 둔다.
*/

const INFO = "proovit/payment-key/v1";

function keyOf(): Buffer {
  const secret = process.env.PAYMENT_KEY_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("[payment-crypto] PAYMENT_KEY_SECRET(또는 AUTH_SECRET)이 없다");
  }
  return Buffer.from(hkdfSync("sha256", secret, "", INFO, 32));
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyOf(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, tag, ct].map((v) => (typeof v === "string" ? v : v.toString("base64url"))).join(".");
}

/** 못 풀면 null — 키가 바뀌었거나 값이 깨진 것. 화면은 「다시 등록」으로 안내한다 */
export function decryptSecret(stored: string): string | null {
  const [v, iv, tag, ct] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !ct) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyOf(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ct, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
