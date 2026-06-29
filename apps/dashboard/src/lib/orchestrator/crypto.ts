import crypto from "node:crypto";

export function randomToken(length: number) {
  return crypto
    .randomBytes(Math.ceil(length * 0.75))
    .toString("base64url")
    .slice(0, length);
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function encryptSecret(secret: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptSecret(encryptedSecret: string) {
  const [version, iv, tag, encrypted] = encryptedSecret.split(":");

  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("Unsupported encrypted secret format");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    secretKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function secretKey() {
  const source =
    process.env.ORCHESTRATOR_APP_SECRET_KEY ??
    process.env.BETTER_AUTH_SECRET ??
    "development-only-change-me";
  return crypto.createHash("sha256").update(source).digest();
}
