/**
 * Client-side cart operations. Call from product page and Cart component.
 */
import { getCartId, setCartId, dispatchCartUpdated } from "./cart-store";
import {
  createCart,
  addToCart,
  fetchCart,
  type ShopifyCart,
} from "./shopify";

export async function addVariantToCart(
  variantId: string,
  quantity: number
): Promise<ShopifyCart> {
  const cartId = getCartId();

  let cart: ShopifyCart;
  if (cartId) {
    cart = await addToCart(cartId, variantId, quantity);
  } else {
    cart = await createCart(variantId, quantity);
    setCartId(cart.id);
  }

  const totalQty = cart.lines?.edges?.reduce((sum, e) => sum + (e.node.quantity ?? 0), 0) ?? 0;
  dispatchCartUpdated(totalQty);
  return cart;
}

export async function getCart(): Promise<ShopifyCart | null> {
  const cartId = getCartId();
  if (!cartId) return null;
  try {
    return await fetchCart(cartId);
  } catch {
    setCartId(null);
    return null;
  }
}
