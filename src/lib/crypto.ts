import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function key() {
  const k = Buffer.from(process.env.ENCRYPTION_KEY ?? "", "base64");
  if (k.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64 encoded");
  return k;
}

export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decrypt(enc: string) {
  const [iv, tag, data] = enc.split(".").map((s) => Buffer.from(s, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function randomKey(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Session cookie: "<expiresAtMs>.<hmac>"
const SESSION_DAYS = 30;

function sign(value: string) {
  return createHmac("sha256", process.env.SESSION_SECRET ?? "").update(value).digest("base64url");
}

export function createSessionToken() {
  const expires = String(Date.now() + SESSION_DAYS * 86_400_000);
  return `${expires}.${sign(expires)}`;
}

export function verifySessionToken(token: string | undefined) {
  if (!token || !process.env.SESSION_SECRET) return false;
  const [expires, mac] = token.split(".");
  if (!expires || !mac || !safeEqual(mac, sign(expires))) return false;
  return Number(expires) > Date.now();
}

export const SESSION_COOKIE = "adprofit_session";
export const SESSION_MAX_AGE = SESSION_DAYS * 86_400;
