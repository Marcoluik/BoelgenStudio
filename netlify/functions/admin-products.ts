/**
 * GET  /api/admin/products                                  ->  { products: [...] }
 * POST /api/admin/variant  { id, stock?, price_ore?, active? } ->  { variant }
 *
 * Lager og priser til admin-siden. Kræver login (se admin-auth.ts).
 */
import { requireAdmin } from "../lib/admin-auth";
import { db, isUuid, json } from "../lib/clients";

export const config = { path: ["/api/admin/products", "/api/admin/variant"] };

// Kolonnerne er Postgres "integer"; grænserne fanger også tastefejl
const MAX_STOCK = 1_000_000;
const MAX_PRICE_ORE = 100_000_000;

function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

async function listProducts(): Promise<Response> {
  const sql = db();
  const products = await sql`
    SELECT p.id, p.handle, p.name, p.sub_name, p.active,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', v.id,
              'color', v.color,
              'size', v.size,
              'price_ore', v.price_ore,
              'stock', v.stock,
              'active', v.active
            )
            ORDER BY v.color, v.size
          )
          FROM variants v
          WHERE v.product_id = p.id
        ),
        '[]'::json
      ) AS variants
    FROM products p
    ORDER BY p.name
  `;
  return json({ products });
}

async function updateVariant(req: Request): Promise<Response> {
  const body = ((await req.json().catch(() => null)) ?? {}) as {
    id?: unknown;
    stock?: unknown;
    price_ore?: unknown;
    active?: unknown;
  };

  if (!isUuid(body.id)) return json({ error: "invalid_id" }, 400);

  const { stock, price_ore: priceOre, active } = body;
  if (stock !== undefined && !isInt(stock, 0, MAX_STOCK)) return json({ error: "invalid_stock" }, 400);
  if (priceOre !== undefined && !isInt(priceOre, 1, MAX_PRICE_ORE)) return json({ error: "invalid_price" }, 400);
  if (active !== undefined && typeof active !== "boolean") return json({ error: "invalid_active" }, 400);
  if (stock === undefined && priceOre === undefined && active === undefined) {
    return json({ error: "nothing_to_update" }, 400);
  }

  // NULL = feltet blev ikke sendt, så kolonnen beholder sin værdi
  const sql = db();
  const [variant] = await sql`
    UPDATE variants
    SET stock = COALESCE(${stock ?? null}::integer, stock),
        price_ore = COALESCE(${priceOre ?? null}::integer, price_ore),
        active = COALESCE(${active ?? null}::boolean, active)
    WHERE id = ${body.id}::uuid
    RETURNING id, color, size, price_ore, stock, active
  `;
  if (!variant) return json({ error: "not_found" }, 404);
  return json({ variant });
}

export default async (req: Request): Promise<Response> => {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { pathname } = new URL(req.url);
  try {
    if (pathname === "/api/admin/products") {
      return req.method === "GET" ? await listProducts() : json({ error: "method_not_allowed" }, 405);
    }
    return req.method === "POST" ? await updateVariant(req) : json({ error: "method_not_allowed" }, 405);
  } catch (error) {
    console.error("[admin-products]", error);
    return json({ error: "server_error" }, 500);
  }
};
