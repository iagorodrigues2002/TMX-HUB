// src/lib/secret-box.ts
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
var key = (secret) => createHash("sha256").update(secret).digest();
function encryptSecret(value, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}
function decryptSecret(value, secret) {
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error("Segredo criptografado inv\xE1lido.");
  const decipher = createDecipheriv("aes-256-gcm", key(secret), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final()
  ]).toString("utf8");
}
export {
  decryptSecret,
  encryptSecret
};
