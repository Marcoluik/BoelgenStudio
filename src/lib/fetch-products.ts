/**
 * Fetches products at build time. Falls back to static products if Shopify fails.
 */
import { fetchProducts } from "./shopify";
import { shopifyToUnified, type UnifiedProduct } from "./product-utils";

const FALLBACK_PRODUCTS: UnifiedProduct[] = [
  {
    id: "bolgen-01",
    handle: "bolgen-01",
    name: "Bølgen 01",
    subName: "Deep Sea Hoodie",
    price: "599 DKK",
    priceAmount: "599",
    currencyCode: "DKK",
    description:
      "Premium heavy-weight hoodie with our caligraphy on the back and signature wave logo on the wrist. Crafted for durability and comfort.",
    mainImage: "/collectionimg/wfront.jpg",
    backImage: "/collectionimg/wback.jpg",
    gallery: [
      "/collectionimg/triowhitefront.jpg",
      "/collectionimg/triowhite.jpg",
      "/collectionimg/triowhite2.jpg",
    ],
    variants: [],
  },
  {
    id: "bolgen-02",
    handle: "bolgen-02",
    name: "Bølgen 02",
    subName: "Arctic Sleeve",
    price: "599 DKK",
    priceAmount: "599",
    currencyCode: "DKK",
    description:
      "Premium heavy-weight hoodie with our caligraphy on the back and signature wave logo on the wrist. Crafted for durability and comfort.",
    mainImage: "/collectionimg/bfront.jpg",
    backImage: "/collectionimg/bback.jpg",
    gallery: ["/collectionimg/_DSC8255.jpg", "/collectionimg/_DSC8260.jpg"],
    variants: [],
  },
];

export async function getProductsAtBuild(): Promise<UnifiedProduct[]> {
  try {
    const shopifyProducts = await fetchProducts();
    if (shopifyProducts.length > 0) {
      return shopifyProducts.map(shopifyToUnified);
    }
  } catch (e) {
    console.warn("[Shopify] Build-time fetch failed, using fallback:", (e as Error).message);
  }
  return FALLBACK_PRODUCTS;
}
