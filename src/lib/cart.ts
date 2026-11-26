/**
 * Kurven i browseren. Indholdet (variant-id og antal) bor i localStorage; navn og pris
 * slås op i kataloget, som Cart.astro lægger i siden ved build. Betalingen oprettes
 * først, når kunden går til kassen, og dér slår serveren selv prisen op.
 * Alle ændringer udsender "cart:change" med den nye kurv, så badge og skuffe følger med.
 */

const CART_KEY = "bolgen_cart";
const CART_COUNT_KEY = "bolgen_cart_count";
/** Kurv-id fra den gamle Shopify-kurv; ryddes væk ved første ændring */
const LEGACY_CART_ID_KEY = "bolgen_cart_id";

/** Samme grænser som /api/checkout håndhæver */
const MAX_LINES = 10;
const MAX_QUANTITY = 10;

export interface Money {
  amount: string;
  currencyCode: string;
}

export interface CartLine {
  /** Variant-id; en variant står kun på én linje */
  id: string;
  quantity: number;
  cost: { totalAmount: Money };
  merchandise: {
    id: string;
    title: string;
    selectedOptions: { name: string; value: string }[];
    product: { title: string; handle: string };
    price: Money;
  };
}

export interface Cart {
  totalQuantity: number;
  lines: { edges: { node: CartLine }[] };
  cost: { subtotalAmount: Money };
}

/** Én variant i kataloget, som Cart.astro indlejrer i siden */
export interface CatalogEntry {
  name: string;
  handle: string;
  color: string;
  size: string;
  amount: string;
}

interface StoredLine {
  variantId: string;
  quantity: number;
}

export class CheckoutError extends Error {}

let catalogCache: Record<string, CatalogEntry> | null = null;

function catalog(): Record<string, CatalogEntry> {
  if (!catalogCache) {
    try {
      catalogCache = JSON.parse(document.getElementById("cart-catalog")?.textContent || "{}");
    } catch {
      catalogCache = {};
    }
  }
  return catalogCache ?? {};
}

function readStored(): StoredLine[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (l): l is StoredLine =>
        typeof l?.variantId === "string" && Number.isInteger(l?.quantity) && l.quantity > 0
    );
  } catch {
    return [];
  }
}

/** Kun brugt, når localStorage ikke kan skrives (privat browsing): kurven lever i fanen */
let memory: StoredLine[] | null = null;

function writeStored(lines: StoredLine[]): void {
  memory = lines;
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(lines));
    localStorage.setItem(CART_COUNT_KEY, String(lines.reduce((sum, l) => sum + l.quantity, 0)));
    localStorage.removeItem(LEGACY_CART_ID_KEY);
  } catch {
    /* privat browsing */
  }
}

function stored(): StoredLine[] {
  const fromStorage = readStored();
  return fromStorage.length > 0 || !memory ? fromStorage : memory;
}

function toCart(lines: StoredLine[]): Cart | null {
  const entries = catalog();
  let subtotal = 0;
  let totalQuantity = 0;
  const nodes: CartLine[] = [];

  for (const line of lines) {
    const entry = entries[line.variantId];
    // Varen findes ikke længere i shoppen
    if (!entry) continue;
    const unit = parseFloat(entry.amount);
    const total = unit * line.quantity;
    subtotal += total;
    totalQuantity += line.quantity;
    nodes.push({
      id: line.variantId,
      quantity: line.quantity,
      cost: { totalAmount: { amount: String(total), currencyCode: "DKK" } },
      merchandise: {
        id: line.variantId,
        title: [entry.color, entry.size].filter(Boolean).join(" / "),
        selectedOptions: [
          { name: "Farve", value: entry.color },
          { name: "Størrelse", value: entry.size },
        ],
        product: { title: entry.name, handle: entry.handle },
        price: { amount: entry.amount, currencyCode: "DKK" },
      },
    });
  }

  if (nodes.length === 0) return null;
  return {
    totalQuantity,
    lines: { edges: nodes.map((node) => ({ node })) },
    cost: { subtotalAmount: { amount: String(subtotal), currencyCode: "DKK" } },
  };
}

let current: Cart | null = null;
let loaded = false;

function commit(lines: StoredLine[]): Cart | null {
  // Gem kun linjer, der stadig findes i kataloget
  const known = lines.filter((l) => catalog()[l.variantId]);
  writeStored(known);
  current = toCart(known);
  loaded = true;
  window.dispatchEvent(new CustomEvent("cart:change", { detail: current }));
  return current;
}

export function getCachedCart(): Cart | null {
  return current;
}

export function onCartChange(callback: (cart: Cart | null) => void): void {
  window.addEventListener("cart:change", (e) => callback((e as CustomEvent<Cart | null>).detail));
}

/** Læser kurven én gang pr. sidevisning (eller igen med force). */
export function loadCart(force = false): Promise<Cart | null> {
  if (loaded && !force) return Promise.resolve(current);
  return Promise.resolve(commit(stored()));
}

export async function addLine(variantId: string, quantity = 1): Promise<Cart | null> {
  if (!catalog()[variantId]) throw new Error("Ukendt variant");
  const lines = stored();
  const existing = lines.find((l) => l.variantId === variantId);
  if (existing) existing.quantity = Math.min(existing.quantity + quantity, MAX_QUANTITY);
  else if (lines.length >= MAX_LINES) throw new Error("Kurven er fuld");
  else lines.push({ variantId, quantity: Math.min(quantity, MAX_QUANTITY) });
  return commit(lines);
}

export async function setLineQuantity(lineId: string, quantity: number): Promise<Cart | null> {
  const lines = stored();
  if (quantity < 1) return commit(lines.filter((l) => l.variantId !== lineId));
  const line = lines.find((l) => l.variantId === lineId);
  if (line) line.quantity = Math.min(quantity, MAX_QUANTITY);
  return commit(lines);
}

export async function removeLine(lineId: string): Promise<Cart | null> {
  return commit(stored().filter((l) => l.variantId !== lineId));
}

export function clearCart(): Cart | null {
  return commit([]);
}

/**
 * Opretter betalingen og returnerer adressen på Stripes betalingsside.
 * Er noget udsolgt i mellemtiden, rettes kurven til, og der kastes en CheckoutError
 * med en besked, der kan vises til kunden.
 */
export async function startCheckout(): Promise<string> {
  const lines = stored();
  if (lines.length === 0) throw new CheckoutError("Kurven er tom.");

  let response: Response;
  try {
    response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: lines }),
    });
  } catch {
    throw new CheckoutError("Kassen kunne ikke åbnes. Tjek din forbindelse, og prøv igen.");
  }
  const body = await response.json().catch(() => null);

  if (response.status === 409 && Array.isArray(body?.unavailable)) {
    const inStock = new Map<string, number>(
      body.unavailable.map((u: { variantId: string; inStock: number }) => [u.variantId, Number(u.inStock) || 0])
    );
    commit(
      lines
        .map((l) => (inStock.has(l.variantId) ? { ...l, quantity: Math.min(l.quantity, inStock.get(l.variantId)!) } : l))
        .filter((l) => l.quantity > 0)
    );
    throw new CheckoutError("Noget i kurven blev udsolgt imens. Vi har rettet kurven til.");
  }

  if (!response.ok || typeof body?.url !== "string") {
    throw new CheckoutError("Kassen kunne ikke åbnes. Prøv igen, eller skriv til os.");
  }
  return body.url;
}

export function openCart(): void {
  window.dispatchEvent(new Event("cart:open"));
}

export function toast(message: string, tone: "info" | "error" = "info"): void {
  window.dispatchEvent(new CustomEvent("toast", { detail: { message, tone } }));
}

// Kurven ændret i en anden fane: følg med
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === CART_KEY && loaded) commit(readStored());
  });
}
