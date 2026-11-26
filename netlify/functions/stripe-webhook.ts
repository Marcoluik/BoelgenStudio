/**
 * POST /api/stripe-webhook  (kaldes af Stripe, ikke af browseren)
 *
 * Når en betaling er gennemført: gem ordren og tæl lageret ned.
 * Stripe kan levere samme hændelse flere gange, så alt her tåler gentagelser.
 */
import type Stripe from "stripe";
import { db, isUuid, json, stripe, webhookSecret } from "../lib/clients";

export const config = { path: "/api/stripe-webhook" };

interface Item {
  variant_id: string;
  quantity: number;
}

function parseItems(raw: string | undefined): Item[] {
  if (!raw) return [];
  const items: Item[] = [];
  for (const part of raw.split("|")) {
    const [variantId, qty] = part.split(":");
    const quantity = Number(qty);
    if (!isUuid(variantId) || !Number.isInteger(quantity) || quantity < 1) return [];
    items.push({ variant_id: variantId, quantity });
  }
  return items;
}

async function recordOrder(session: Stripe.Checkout.Session): Promise<void> {
  const items = parseItems(session.metadata?.items);
  if (items.length === 0) {
    // Ikke en session fra vores checkout (fx et betalingslink oprettet i Stripe)
    console.warn(`[webhook] Session ${session.id} har ingen kurv i metadata, springes over`);
    return;
  }

  // Adressens placering afhænger af Stripes API-version
  const loose = session as unknown as {
    collected_information?: { shipping_details?: unknown };
    shipping_details?: unknown;
  };
  const shipping =
    loose.collected_information?.shipping_details ??
    loose.shipping_details ??
    session.customer_details?.address ??
    null;

  const paymentIntent =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

  const sql = db();
  // Ét statement = én transaktion. Findes ordren allerede, er new_order tom,
  // og så indsættes ingen linjer og lageret røres ikke.
  const [result] = await sql`
    WITH new_order AS (
      INSERT INTO orders (
        stripe_session_id, stripe_payment_intent, email, customer_name, phone,
        shipping_address, amount_total_ore, currency
      )
      VALUES (
        ${session.id}, ${paymentIntent}, ${session.customer_details?.email ?? null},
        ${session.customer_details?.name ?? null}, ${session.customer_details?.phone ?? null},
        ${JSON.stringify(shipping)}::jsonb, ${session.amount_total ?? 0}, ${session.currency ?? "dkk"}
      )
      ON CONFLICT (stripe_session_id) DO NOTHING
      RETURNING id
    ),
    items AS (
      SELECT x.variant_id, x.quantity
      FROM jsonb_to_recordset(${JSON.stringify(items)}::jsonb) AS x(variant_id uuid, quantity integer)
    ),
    inserted AS (
      INSERT INTO order_items (order_id, variant_id, description, quantity, unit_price_ore)
      SELECT o.id, v.id, concat_ws(' / ', p.name, nullif(v.color, ''), nullif(v.size, '')), i.quantity, v.price_ore
      FROM new_order o
      CROSS JOIN items i
      JOIN variants v ON v.id = i.variant_id
      JOIN products p ON p.id = v.product_id
      RETURNING id
    ),
    decremented AS (
      UPDATE variants v
      SET stock = v.stock - i.quantity
      FROM items i, new_order o
      WHERE v.id = i.variant_id AND v.stock >= i.quantity
      RETURNING v.id
    )
    SELECT
      (SELECT id FROM new_order) AS order_id,
      (SELECT count(*) FROM decremented)::int AS decremented,
      (SELECT count(*) FROM items)::int AS expected
  `;

  if (!result?.order_id) return; // allerede behandlet

  if (result.decremented < result.expected) {
    // Betalt, men mindst én vare var udsolgt i mellemtiden: skal håndteres manuelt
    await sql`UPDATE orders SET status = 'needs_attention' WHERE id = ${result.order_id}`;
    console.warn(`[webhook] Ordre ${result.order_id}: lageret rakte ikke til alle varer`);
  }
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "missing_signature" }, 400);

  // Signaturen beregnes over den rå tekst, så body må ikke parses først
  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(payload, signature, webhookSecret());
  } catch {
    return json({ error: "invalid_signature" }, 400);
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object;
    // Ved forsinkede betalingsmetoder kommer "completed" før pengene; vent på "paid"
    if (session.payment_status === "paid") await recordOrder(session);
  }

  return json({ received: true });
};
