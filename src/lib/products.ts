/**
 * Produkter ved build: hentes fra vores egen database og får lokale, optimerede fotos pr. farve.
 * Kan databasen ikke nås, vises hoodien stadig (uden køb), så siden aldrig står tom.
 */
import type { CatalogEntry } from "./cart";
import { fetchCatalog, type CatalogProduct } from "./catalog";
import { focusCrop, getLocalColorPics, normalizeKey, type Pic } from "./images";
import { formatMoney } from "./money";

export interface Variant {
  id: string;
  title: string;
  available: boolean;
  amount: string;
  price: string;
  size: string;
  color: string;
}

export interface ColorGroup {
  /** Visningsnavn, fx "Hvid". Tom streng når produktet ikke har farver. */
  color: string;
  /** URL-/DOM-nøgle, fx "hvid" */
  key: string;
  /** CSS-farve til farveprikken */
  swatch: string;
  pics: Pic[];
  variants: Variant[];
  available: boolean;
}

export interface Product {
  id: string;
  handle: string;
  name: string;
  subName: string;
  price: string;
  priceAmount: string;
  currencyCode: string;
  description: string;
  colorGroups: ColorGroup[];
  sizes: string[];
  hasColors: boolean;
  hasVariants: boolean;
  available: boolean;
  /** true for Bølgen-hoodien, som har egne fotos og kendte specifikationer */
  isSignature: boolean;
}

/** Størrelser sorteres i tøjrækkefølge; ukendte størrelser kommer til sidst */
const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL"];
/** Rækkefølge på forsiden og i farvevælgeren */
const COLOR_ORDER = ["hvid", "sort"];

const SWATCHES: Record<string, string> = {
  hvid: "#f1ede4",
  sort: "#0a0b0c",
  bla: "#3d7df2",
  navy: "#14213d",
  gra: "#8a8b88",
  sand: "#cdbfa6",
};

function swatchFor(color: string): string {
  return SWATCHES[normalizeKey(color).replace(/å/g, "a")] ?? "#8a8b88";
}

function isSignatureProduct(handle: string, name: string): boolean {
  return normalizeKey(handle).includes("bolgen") || normalizeKey(name).includes("bolgen");
}

function sortColors<T extends { key: string }>(groups: T[]): T[] {
  const rank = (key: string) => {
    const i = COLOR_ORDER.indexOf(key);
    return i === -1 ? COLOR_ORDER.length : i;
  };
  return [...groups].sort((a, b) => rank(a.key) - rank(b.key));
}

function sizeRank(size: string): number {
  const i = SIZE_ORDER.indexOf(size.toUpperCase());
  return i === -1 ? SIZE_ORDER.length : i;
}

async function toProduct(p: CatalogProduct): Promise<Product> {
  const isSignature = isSignatureProduct(p.handle, p.name);

  const variants: Variant[] = p.variants.map((v) => {
    const amount = String(v.priceOre / 100);
    return {
      id: v.id,
      title: [v.color, v.size].filter(Boolean).join(" / "),
      available: v.available,
      amount,
      price: formatMoney(amount, "DKK"),
      size: v.size,
      color: v.color,
    };
  });

  const bySize = (a: Variant, b: Variant) => sizeRank(a.size) - sizeRank(b.size) || a.size.localeCompare(b.size);
  const sizes = [...new Set([...variants].sort(bySize).map((v) => v.size).filter(Boolean))];
  const colors = [...new Set(variants.map((v) => v.color))];

  const colorGroups: ColorGroup[] = await Promise.all(
    colors.map(async (color) => {
      const own = variants.filter((v) => v.color === color).sort(bySize);
      return {
        color,
        key: color ? normalizeKey(color) : "default",
        swatch: swatchFor(color),
        // Fotos ligger i src/assets/collection/<farve>/
        pics: color ? await getLocalColorPics(color, p.name) : [],
        variants: own,
        available: own.some((v) => v.available),
      };
    })
  );

  const priceAmount = variants[0]?.amount ?? "0";

  return {
    id: p.id,
    handle: p.handle,
    name: p.name,
    subName: p.subName,
    price: formatMoney(priceAmount, "DKK"),
    priceAmount,
    currencyCode: "DKK",
    description: p.description.trim(),
    // En farve uden fotos kan ikke vises og udelades
    colorGroups: sortColors(colorGroups.filter((g) => g.pics.length > 0)),
    sizes,
    hasColors: colors.filter(Boolean).length > 1,
    hasVariants: variants.length > 0,
    available: variants.some((v) => v.available),
    isSignature,
  };
}

async function getFallbackProducts(): Promise<Product[]> {
  const name = "Bølgen Logo Hoodie";
  const colorGroups = (
    await Promise.all(
      ["Hvid", "Sort"].map(async (color) => ({
        color,
        key: normalizeKey(color),
        swatch: swatchFor(color),
        pics: await getLocalColorPics(color, name),
        variants: [] as Variant[],
        available: false,
      }))
    )
  ).filter((g) => g.pics.length > 0);

  if (colorGroups.length === 0) return [];

  return [
    {
      id: "bolgen-logo-hoodie",
      handle: "bolgen-logo-hoodie",
      name,
      subName: "",
      price: formatMoney("599", "DKK"),
      priceAmount: "599",
      currencyCode: "DKK",
      description:
        "Hoodien er designet ud fra behovet for en varm, funktionel og stilren trøje – perfekt til livet ved havet, når det danske vejr viser sig fra sin barske side.",
      colorGroups,
      sizes: [],
      hasColors: colorGroups.length > 1,
      hasVariants: false,
      available: false,
      isSignature: true,
    },
  ];
}

let cache: { at: number; value: Promise<Product[]> } | null = null;
// I dev genbruges svaret kort, så hver sidevisning ikke rammer databasen; i build hentes der én gang.
const CACHE_MS = import.meta.env.DEV ? 30_000 : Number.POSITIVE_INFINITY;

async function load(): Promise<Product[]> {
  try {
    const catalog = await fetchCatalog();
    const products = (await Promise.all(catalog.map(toProduct))).filter((p) => p.colorGroups.length > 0);
    if (products.length > 0) return products;
  } catch (e) {
    console.warn("[katalog] Kunne ikke hente produkter, bruger fallback:", (e as Error).message);
  }
  return getFallbackProducts();
}

export function getProducts(): Promise<Product[]> {
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    cache = { at: Date.now(), value: load() };
  }
  return cache.value;
}

/** Første sætning som manchet, resten som brødtekst. */
export function splitDescription(description: string): { lead: string; rest: string[] } {
  const sentences = description.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g)?.map((s) => s.trim()) ?? [];
  if (sentences.length <= 1) return { lead: description, rest: [] };

  const [lead, ...others] = sentences;
  // Saml resten i afsnit på to sætninger, så det ikke bliver en mur af tekst
  const rest: string[] = [];
  for (let i = 0; i < others.length; i += 2) {
    rest.push(others.slice(i, i + 2).join(" "));
  }
  return { lead, rest };
}

/** Lille kort til kurven: "handle|farvenøgle" -> miniaturebillede */
export function buildThumbMap(products: Product[]): Record<string, { src: string; style: string }> {
  const map: Record<string, { src: string; style: string }> = {};
  for (const product of products) {
    for (const group of product.colorGroups) {
      const pic = group.pics[0];
      if (!pic) continue;
      const smallest = pic.srcset.split(",")[0]?.trim().split(" ")[0] ?? pic.src;
      // Samme beskæring som produktkortet, så hoodien kan ses i det lille format
      map[`${product.handle}|${group.key}`] = { src: smallest, style: focusCrop(pic, 0.85) };
    }
  }
  return map;
}

/** Kurvens opslagsværk: variant-id -> navn, farve, størrelse og pris */
export function buildCartCatalog(products: Product[]): Record<string, CatalogEntry> {
  const map: Record<string, CatalogEntry> = {};
  for (const product of products) {
    for (const group of product.colorGroups) {
      for (const variant of group.variants) {
        map[variant.id] = {
          name: product.name,
          handle: product.handle,
          color: variant.color,
          size: variant.size,
          amount: variant.amount,
        };
      }
    }
  }
  return map;
}
