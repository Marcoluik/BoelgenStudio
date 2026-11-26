/**
 * Fælles klienter til serverfunktionerne. Alle nøgler læses fra miljøvariabler
 * på serveren og må aldrig have PUBLIC_-præfiks:
 *
 *   DATABASE_URL            Postgres-forbindelse (Neon)
 *   STRIPE_SECRET_KEY       sk_test_... / sk_live_...
 *   STRIPE_WEBHOOK_SECRET   whsec_... (fra webhook-endpointet i Stripe)
 *   SHIPPING_FLAT_ORE       valgfri: fast fragtpris i øre
 *   FREE_SHIPPING_OVER_ORE  valgfri: gratis fragt fra dette beløb i øre
 */
import { neon } from "@neondatabase/serverless";
import Stripe from "stripe";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Miljøvariablen ${name} mangler`);
  return value;
}

export function db() {
  return neon(required("DATABASE_URL"));
}

export function stripe(): Stripe {
  return new Stripe(required("STRIPE_SECRET_KEY"));
}

export function webhookSecret(): string {
  return required("STRIPE_WEBHOOK_SECRET");
}

/** Heltal i øre fra en valgfri miljøvariabel; null hvis den ikke er sat eller er ugyldig. */
export function optionalOre(name: string): number | null {
  const raw = process.env[name];
  if (!raw) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
