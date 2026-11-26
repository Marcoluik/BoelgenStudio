/**
 * POST /api/checkout  { items: [{ variantId, quantity }] }  ->  { url }
 *
 * Opretter en Stripe Checkout-session. Pris og navn slås op i databasen;
 * browseren sender kun variant-id og antal, så prisen ikke kan manipuleres.
 */
import type Stripe from "stripe";
import { db, isUuid, json, optionalOre, siteUrl, stripe } from "../lib/clients";

export const config = { path: "/api/checkout" };

const MAX_LINES = 10;
const MAX_QUANTITY = 10;

interface Line {
  variantId: string;
  quantity: number;
}

/** Validerer kurven og lægger dubletter af samme variant sammen. */
function parseLines(body: unknown): Line[] | null {
  const items = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items) || items.length === 0) return null;

  const merged = new Map<string, number>();
  for (const item of items) {
    const { variantId, quantity } = (item ?? {}) as { variantId?: unknown; quantity?: unknown };
    if (!isUuid(variantId)) return null;
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) return null;
    merged.set(variantId.toLowerCase(), (merged.get(variantId.toLowerCase()) ?? 0) + quantity);
  }

  if (merged.size > MAX_LINES) return null;
  const lines = [...merged].map(([variantId, quantity]) => ({ variantId, quantity }));
  return lines.every((l) => l.quantity <= MAX_QUANTITY) ? lines : null;
}

function shippingOptions(subtotalOre: number): Stripe.Checkout.SessionCreateParams.ShippingOption[] | undefined {
  const flat = optionalOre("SHIPPING_FLAT_ORE");
  if (flat === null) return undefined;

  const freeOver = optionalOre("FREE_SHIPPING_OVER_ORE");
  const amount = freeOver !== null && subtotalOre >= freeOver ? 0 : flat;
  return [
    {
      shipping_rate_data: {
        type: "fixed_amount",
        display_name: amount === 0 ? "Gratis fragt" : "Fragt",
        fixed_amount: { amount, currency: "dkk" },
      },
    },
  ];
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const lines = parseLines(await req.json().catch(() => null));
  if (!lines) return json({ error: "invalid_cart" }, 400);

  const sql = db();
  const ids = lines.map((l) => l.variantId);
  const rows = await sql`
    SELECT v.id, v.price_ore, v.stock, v.color, v.size, p.name
    FROM variants v
    JOIN products p ON p.id = v.product_id
    WHERE v.id = ANY(${ids}::uuid[]) AND v.active AND p.active
  `;
  const variants = new Map(rows.map((r) => [String(r.id), r]));

  // Udsolgt eller fjernet siden kunden lagde varen i kurven
  const unavailable = lines
    .filter((l) => (variants.get(l.variantId)?.stock ?? 0) < l.quantity)
    .map((l) => ({ variantId: l.variantId, inStock: Number(variants.get(l.variantId)?.stock ?? 0) }));
  if (unavailable.length > 0) return json({ error: "out_of_stock", unavailable }, 409);

  let subtotal = 0;
  const lineItems = lines.map((l) => {
    const v = variants.get(l.variantId)!;
    const price = Number(v.price_ore);
    subtotal += price * l.quantity;
    const detail = [v.color, v.size].filter(Boolean).join(" / ");
    return {
      quantity: l.quantity,
      price_data: {
        currency: "dkk",
        unit_amount: price,
        product_data: { name: detail ? `${v.name} (${detail})` : String(v.name) },
      },
    };
  });

  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    locale: "da",
    line_items: lineItems,
    shipping_address_collection: { allowed_countries: ["DK"] },
    shipping_options: shippingOptions(subtotal),
    phone_number_collection: { enabled: true },
    // Webhooken læser kurven herfra, når betalingen er gennemført
    metadata: { items: lines.map((l) => `${l.variantId}:${l.quantity}`).join("|") },
    success_url: `${siteUrl()}/tak?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl()}/`,
  });

  if (!session.url) return json({ error: "checkout_unavailable" }, 502);
  return json({ url: session.url });
};
