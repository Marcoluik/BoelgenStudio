/**
 * Client-side cart state and persistence.
 * Cart ID is stored in localStorage; cart data is fetched from Shopify.
 */

const CART_ID_KEY = "bolgen_cart_id";

export function getCartId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CART_ID_KEY);
}

export function setCartId(id: string | null): void {
  if (typeof window === "undefined") return;
  if (id) {
    localStorage.setItem(CART_ID_KEY, id);
  } else {
    localStorage.removeItem(CART_ID_KEY);
  }
}

export function dispatchCartUpdated(count: number): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("cart-updated", { detail: { lineCount: count, itemCount: count } })
  );
}
