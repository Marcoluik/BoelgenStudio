/**
 * GET  /api/admin/orders                          ->  { orders: [...] }
 * POST /api/admin/order  { id, status, tracking? } ->  { order }
 *
 * Ordreliste og statusskift til admin-siden. Kræver login (se admin-auth.ts).
 */
import { requireAdmin } from "../lib/admin-auth";
import { db, isUuid, json } from "../lib/clients";

export const config = { path: ["/api/admin/orders", "/api/admin/order"] };

// Samme værdier som CHECK-reglen på orders.status i schema.sql
const STATUSES = ["paid", "needs_attention", "shipped", "refunded"];
const MAX_TRACKING_LENGTH = 200;

async function listOrders(): Promise<Response> {
  const sql = db();
  const orders = await sql`
    SELECT o.*,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'description', i.description,
              'quantity', i.quantity,
              'unit_price_ore', i.unit_price_ore
            )
            ORDER BY i.description
          )
          FROM order_items i
          WHERE i.order_id = o.id
        ),
        '[]'::json
      ) AS items
    FROM orders o
    ORDER BY o.created_at DESC
    LIMIT 200
  `;
  return json({ orders });
}

async function updateOrder(req: Request): Promise<Response> {
  const body = ((await req.json().catch(() => null)) ?? {}) as {
    id?: unknown;
    status?: unknown;
    tracking?: unknown;
  };

  if (!isUuid(body.id)) return json({ error: "invalid_id" }, 400);
  if (typeof body.status !== "string" || !STATUSES.includes(body.status)) {
    return json({ error: "invalid_status" }, 400);
  }

  // Tomt eller udeladt sporingsnummer betyder "behold det, der står"
  let tracking: string | null = null;
  if (body.tracking !== undefined && body.tracking !== null) {
    if (typeof body.tracking !== "string" || body.tracking.length > MAX_TRACKING_LENGTH) {
      return json({ error: "invalid_tracking" }, 400);
    }
    tracking = body.tracking.trim() || null;
  }

  const sql = db();
  const [order] = await sql`
    UPDATE orders
    SET status = ${body.status}::text,
        shipped_at = CASE
          WHEN ${body.status}::text = 'shipped' THEN now()
          WHEN ${body.status}::text = 'paid' THEN NULL
          ELSE shipped_at
        END,
        tracking = COALESCE(${tracking}::text, tracking)
    WHERE id = ${body.id}::uuid
    RETURNING *
  `;
  if (!order) return json({ error: "not_found" }, 404);
  return json({ order });
}

export default async (req: Request): Promise<Response> => {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { pathname } = new URL(req.url);
  try {
    if (pathname === "/api/admin/orders") {
      return req.method === "GET" ? await listOrders() : json({ error: "method_not_allowed" }, 405);
    }
    return req.method === "POST" ? await updateOrder(req) : json({ error: "method_not_allowed" }, 405);
  } catch (error) {
    console.error("[admin-orders]", error);
    return json({ error: "server_error" }, 500);
  }
};
