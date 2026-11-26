/**
 * Adgangskontrol til admin-endpoints (/api/admin/...).
 *
 *   ADMIN_PASSWORD   kodeord til /admin, mindst 12 tegn. Kun på serveren.
 *
 * Login bytter kodeordet til et token "<udløb>.<hmac>", som browseren sender
 * som "Authorization: Bearer <token>". Nøglen er afledt af kodeordet, så alle
 * tokens bliver ugyldige, når kodeordet skiftes.
 * Er ADMIN_PASSWORD ikke sat (eller for kort), svarer alle admin-endpoints 503.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { json } from "./clients";

const MIN_PASSWORD_LENGTH = 12;
const TOKEN_LIFETIME_MS = 12 * 60 * 60 * 1000;

function adminPassword(): string | null {
  const value = process.env.ADMIN_PASSWORD;
  return value && value.length >= MIN_PASSWORD_LENGTH ? value : null;
}

function notConfigured(): Response {
  return json({ error: "admin_not_configured" }, 503);
}

function sign(expiry: string, password: string): Buffer {
  const key = createHmac("sha256", password).update("bolgen-admin-token-key").digest();
  return createHmac("sha256", key).update(expiry).digest();
}

/** Sammenligner i konstant tid: begge sider hashes først, så længden ikke afsløres. */
function passwordMatches(candidate: string, password: string): boolean {
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(password).digest();
  return timingSafeEqual(a, b);
}

/**
 * Tjekker kodeordet og udsteder et token.
 * Returnerer 503-svaret, hvis admin ikke er sat op, og null ved forkert kodeord.
 */
export function login(candidate: unknown): { token: string; expiresAt: number } | Response | null {
  const password = adminPassword();
  if (!password) return notConfigured();
  if (typeof candidate !== "string" || !passwordMatches(candidate, password)) return null;

  const expiresAt = Date.now() + TOKEN_LIFETIME_MS;
  const expiry = String(expiresAt);
  return { token: `${expiry}.${sign(expiry, password).toString("hex")}`, expiresAt };
}

/** Returnerer null, hvis kaldet er logget ind; ellers det svar, der skal sendes tilbage. */
export function requireAdmin(req: Request): Response | null {
  const password = adminPassword();
  if (!password) return notConfigured();

  const unauthorized = json({ error: "unauthorized" }, 401);
  const match = /^Bearer (\d{1,15})\.([0-9a-f]{64})$/.exec(req.headers.get("authorization") ?? "");
  if (!match) return unauthorized;

  const [, expiry, signature] = match;
  if (!timingSafeEqual(Buffer.from(signature, "hex"), sign(expiry, password))) return unauthorized;
  if (Number(expiry) <= Date.now()) return unauthorized;
  return null;
}
