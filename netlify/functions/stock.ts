/**
 * GET /api/stock  ->  { variants: { [variantId]: boolean } }
 *
 * Aktuel lagerstatus pr. variant. Antallet afsløres ikke, kun om varen kan købes.
 */
import { db, json } from "../lib/clients";

export const config = { path: "/api/stock" };

export default async (req: Request): Promise<Response> => {
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const rows = await db()`
    SELECT v.id, (v.stock > 0 AND v.active AND p.active) AS available
    FROM variants v
    JOIN products p ON p.id = v.product_id
  `;

  const variants: Record<string, boolean> = {};
  for (const row of rows) variants[String(row.id)] = Boolean(row.available);

  const response = json({ variants });
  // Kort cache, så en travl side ikke spørger databasen ved hver visning
  response.headers.set("cache-control", "public, max-age=30");
  return response;
};
