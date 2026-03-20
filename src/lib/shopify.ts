/**
 * Shopify Storefront API client
 * Uses the public Storefront Access Token (safe for client-side).
 * The private Admin token (shpat_xxx) should NEVER be used here.
 */

const STOREFRONT_API_VERSION = "2024-01";

export interface ShopifyConfig {
  storeDomain: string;
  storefrontToken: string;
}

function getConfig(): ShopifyConfig {
  const storeDomain =
    import.meta.env.PUBLIC_SHOPIFY_STORE_DOMAIN || "boelgenstudio.myshopify.com";
  const storefrontToken =
    import.meta.env.PUBLIC_SHOPIFY_STOREFRONT_TOKEN || "";

  if (!storefrontToken) {
    console.warn(
      "[Shopify] PUBLIC_SHOPIFY_STOREFRONT_TOKEN not set. Add it to .env"
    );
  }

  return {
    storeDomain: storeDomain.replace(/^https?:\/\//, "").replace(/\/$/, ""),
    storefrontToken,
  };
}

/**
 * Rewrites `cart.checkoutUrl` onto a Shopify-served host when it points at
 * `/cart/c/*` or `/checkouts/*`.
 *
 * For this project the simplest production setup is:
 * - `bolgenstudio.com` -> Netlify (Astro storefront)
 * - `boelgenstudio.myshopify.com` -> Shopify checkout + Storefront API origin
 *
 * Shopify redirects checkout URLs to the shop's primary domain, so checkout must
 * land on a hostname that Shopify serves. If the same hostname is owned by
 * Netlify, checkout becomes 404 or redirect-loops.
 *
 * Immediate fix: keep `PUBLIC_SHOPIFY_STORE_DOMAIN=boelgenstudio.myshopify.com`,
 * make that Shopify domain the shop's Primary domain, and do not set
 * `PUBLIC_SHOPIFY_CHECKOUT_ORIGIN`.
 *
 * Optional later: if you want a branded checkout domain, set
 * `PUBLIC_SHOPIFY_CHECKOUT_ORIGIN=https://shop.bolgenstudio.com` after that
 * subdomain is connected in Shopify and serving valid SSL.
 */
export function resolveHostedCheckoutUrl(checkoutUrl: string): string {
  const trimmed = checkoutUrl.trim();
  if (!trimmed) return "";

  const withScheme = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
  if (!/^https?:\/\//i.test(withScheme)) return trimmed;

  const envOrigin = import.meta.env.PUBLIC_SHOPIFY_CHECKOUT_ORIGIN;
  const explicitOrigin =
    typeof envOrigin === "string" && envOrigin.length > 0
      ? envOrigin.replace(/\/$/, "")
      : "";

  const { storeDomain } = getConfig();
  const shopifyOrigin =
    explicitOrigin || (storeDomain ? `https://${storeDomain}` : "");

  if (!shopifyOrigin) return trimmed;

  try {
    const u = new URL(withScheme);
    const isHostedCheckoutPath =
      u.pathname.includes("/cart/c/") || u.pathname.includes("/checkouts/");
    if (!isHostedCheckoutPath) return trimmed;

    const base = new URL(shopifyOrigin);
    return `${base.origin}${u.pathname}${u.search}`;
  } catch {
    return trimmed;
  }
}

const FETCH_TIMEOUT_MS = 8000;

export async function shopifyFetch<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const { storeDomain, storefrontToken } = getConfig();

  const url = `https://${storeDomain}/api/${STOREFRONT_API_VERSION}/graphql.json`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": storefrontToken,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Shopify API error ${response.status}: ${text}`);
    }

    const json = await response.json();
    if (json.errors) {
      throw new Error(
        json.errors.map((e: { message: string }) => e.message).join(", ")
      );
    }
    return json.data as T;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ─── Product types ─────────────────────────────────────────────────────────

export interface ShopifyProduct {
  id: string;
  handle: string;
  title: string;
  description: string;
  featuredImage?: { url: string; altText?: string };
  images: { edges: { node: { url: string; altText?: string } }[] };
  variants: {
    edges: {
      node: {
        id: string;
        title: string;
        availableForSale: boolean;
        quantityAvailable?: number | null;
        price: { amount: string; currencyCode: string };
        image?: { url: string; altText?: string };
        selectedOptions?: { name: string; value: string }[];
      };
    }[];
  };
  options?: { name: string; values: string[] }[];
}

export interface ShopifyCartLine {
  id: string;
  quantity: number;
  merchandise: {
    id: string;
    title: string;
    product: { title: string; handle: string };
    price: { amount: string; currencyCode: string };
    image?: { url: string; altText?: string };
  };
}

export interface ShopifyCart {
  id: string;
  checkoutUrl: string;
  lines: { edges: { node: ShopifyCartLine }[] };
  cost: {
    subtotalAmount: { amount: string; currencyCode: string };
  };
}

// ─── Queries ───────────────────────────────────────────────────────────────

const PRODUCTS_QUERY = `
  query getProducts($first: Int!) {
    products(first: $first, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          handle
          title
          description
          featuredImage { url altText }
          images(first: 10) {
            edges { node { url altText } }
          }
          variants(first: 20) {
            edges {
              node {
                id
                title
                availableForSale
                price { amount currencyCode }
                image { url altText }
                selectedOptions { name value }
              }
            }
          }
          options(first: 5) { name values }
        }
      }
    }
  }
`;

const PRODUCT_BY_HANDLE_QUERY = `
  query getProduct($handle: String!) {
    product(handle: $handle) {
      id
      handle
      title
      description
      featuredImage { url altText }
      images(first: 10) {
        edges { node { url altText } }
      }
      variants(first: 20) {
        edges {
          node {
            id
            title
            availableForSale
            price { amount currencyCode }
            image { url altText }
            selectedOptions { name value }
          }
        }
      }
      options(first: 5) { name values }
    }
  }
`;

const CART_QUERY = `
  query getCart($cartId: ID!) {
    cart(id: $cartId) {
      id
      checkoutUrl
      lines(first: 50) {
        edges {
          node {
            id
            quantity
            merchandise {
              ... on ProductVariant {
                id
                title
                product { title handle }
                price { amount currencyCode }
                image { url altText }
              }
            }
          }
        }
      }
      cost { subtotalAmount { amount currencyCode } }
    }
  }
`;

// ─── Mutations ─────────────────────────────────────────────────────────────

const CART_CREATE_MUTATION = `
  mutation cartCreate($input: CartInput!) {
    cartCreate(input: $input) {
      cart { id checkoutUrl }
      userErrors { field message }
    }
  }
`;

const CART_LINES_ADD_MUTATION = `
  mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart { id checkoutUrl
        lines(first: 50) {
          edges {
            node {
              id quantity
              merchandise {
                ... on ProductVariant {
                  id title
                  product { title handle }
                  price { amount currencyCode }
                  image { url altText }
                }
              }
            }
          }
        }
        cost { subtotalAmount { amount currencyCode } }
      }
      userErrors { field message }
    }
  }
`;

const CART_LINES_UPDATE_MUTATION = `
  mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart { id checkoutUrl
        lines(first: 50) {
          edges {
            node {
              id quantity
              merchandise {
                ... on ProductVariant {
                  id title
                  product { title handle }
                  price { amount currencyCode }
                  image { url altText }
                }
              }
            }
          }
        }
        cost { subtotalAmount { amount currencyCode } }
      }
      userErrors { field message }
    }
  }
`;

const CART_LINES_REMOVE_MUTATION = `
  mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      cart { id checkoutUrl
        lines(first: 50) {
          edges {
            node {
              id quantity
              merchandise {
                ... on ProductVariant {
                  id title
                  product { title handle }
                  price { amount currencyCode }
                  image { url altText }
                }
              }
            }
          }
        }
        cost { subtotalAmount { amount currencyCode } }
      }
      userErrors { field message }
    }
  }
`;

// ─── API functions ────────────────────────────────────────────────────────

export async function fetchProducts(first = 50): Promise<ShopifyProduct[]> {
  const data = await shopifyFetch<{
    products: { edges: { node: ShopifyProduct }[] };
  }>(PRODUCTS_QUERY, { first });
  return (data.products?.edges ?? []).map((e) => e.node);
}

export async function fetchProductByHandle(
  handle: string
): Promise<ShopifyProduct | null> {
  const data = await shopifyFetch<{ product: ShopifyProduct | null }>(
    PRODUCT_BY_HANDLE_QUERY,
    { handle }
  );
  return data.product;
}

export async function fetchCart(cartId: string): Promise<ShopifyCart | null> {
  const data = await shopifyFetch<{ cart: ShopifyCart | null }>(CART_QUERY, {
    cartId,
  });
  return data.cart;
}

export async function createCart(variantId: string, quantity: number): Promise<ShopifyCart> {
  const data = await shopifyFetch<{
    cartCreate: {
      cart: ShopifyCart | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(CART_CREATE_MUTATION, {
    input: {
      lines: [{ merchandiseId: variantId, quantity }],
    },
  });

  const { cart, userErrors } = data.cartCreate;
  if (userErrors?.length) {
    throw new Error(userErrors.map((e) => e.message).join(", "));
  }
  if (!cart) {
    throw new Error("Failed to create cart");
  }
  return cart;
}

export async function addToCart(
  cartId: string,
  variantId: string,
  quantity: number
): Promise<ShopifyCart> {
  const data = await shopifyFetch<{
    cartLinesAdd: {
      cart: ShopifyCart | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(CART_LINES_ADD_MUTATION, {
    cartId,
    lines: [{ merchandiseId: variantId, quantity }],
  });

  const { cart, userErrors } = data.cartLinesAdd;
  if (userErrors?.length) {
    throw new Error(userErrors.map((e) => e.message).join(", "));
  }
  if (!cart) {
    throw new Error("Failed to add to cart");
  }
  return cart;
}

export async function updateCartLine(
  cartId: string,
  lineId: string,
  quantity: number
): Promise<ShopifyCart> {
  const data = await shopifyFetch<{
    cartLinesUpdate: {
      cart: ShopifyCart | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(CART_LINES_UPDATE_MUTATION, {
    cartId,
    lines: [{ id: lineId, quantity }],
  });

  const { cart, userErrors } = data.cartLinesUpdate;
  if (userErrors?.length) {
    throw new Error(userErrors.map((e) => e.message).join(", "));
  }
  if (!cart) {
    throw new Error("Failed to update cart");
  }
  return cart;
}

export async function removeCartLine(
  cartId: string,
  lineId: string
): Promise<ShopifyCart> {
  const data = await shopifyFetch<{
    cartLinesRemove: {
      cart: ShopifyCart | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(CART_LINES_REMOVE_MUTATION, {
    cartId,
    lineIds: [lineId],
  });

  const { cart, userErrors } = data.cartLinesRemove;
  if (userErrors?.length) {
    throw new Error(userErrors.map((e) => e.message).join(", "));
  }
  if (!cart) {
    throw new Error("Failed to remove from cart");
  }
  return cart;
}
