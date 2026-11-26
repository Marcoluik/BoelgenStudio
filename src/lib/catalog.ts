/**
 * Produktkataloget fra vores egen database (Neon). Kører kun ved build og i dev,
 * aldrig i browseren: DATABASE_URL er hemmelig og må ikke have PUBLIC_-præfiks.
 */
import { neon } from "@neondatabase/serverless";

export interface CatalogVariant {
  id: string;
  color: string;
  size: string;
  priceOre: number;
  available: boolean;
}

export interface CatalogProduct {
  id: string;
  handle: string;
  name: string;
  subName: string;
  description: string;
  variants: CatalogVariant[];
}

function databaseUrl(): string {
  // Netlify giver miljøvariabler via process.env; lokalt læser Astro dem fra .env
  const url = process.env.DATABASE_URL ?? import.meta.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL er ikke sat");
  return url;
}

export async function fetchCatalog(): Promise<CatalogProduct[]> {
  const sql = neon(databaseUrl());
  const rows = await sql`
    SELECT p.id AS product_id, p.handle, p.name, p.sub_name, p.description,
           v.id AS variant_id, v.color, v.size, v.price_ore, v.stock
    FROM products p
    JOIN variants v ON v.product_id = p.id AND v.active
    WHERE p.active
    ORDER BY p.created_at DESC, v.color, v.size
  `;

  const products = new Map<string, CatalogProduct>();
  for (const row of rows) {
    let product = products.get(row.product_id);
    if (!product) {
      product = {
        id: row.product_id,
        handle: row.handle,
        name: row.name,
        subName: row.sub_name,
        description: row.description,
        variants: [],
      };
      products.set(row.product_id, product);
    }
    product.variants.push({
      id: row.variant_id,
      color: row.color,
      size: row.size,
      priceOre: Number(row.price_ore),
      available: Number(row.stock) > 0,
    });
  }
  return [...products.values()];
}
