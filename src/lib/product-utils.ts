import type { ShopifyProduct } from "./shopify";

export interface UnifiedProduct {
  id: string;
  handle: string;
  name: string;
  subName: string;
  price: string;
  priceAmount: string;
  currencyCode: string;
  description: string;
  mainImage: string;
  backImage: string;
  gallery: string[];
  variants: { id: string; title: string; availableForSale: boolean; price: string }[];
}

export function shopifyToUnified(p: ShopifyProduct): UnifiedProduct {
  const images = p.images?.edges?.map((e) => e.node.url) ?? [];
  const feat = p.featuredImage?.url ?? images[0] ?? "/collectionimg/wfront.jpg";
  const mainImage = feat;
  const backImage = images[1] ?? images[0] ?? mainImage;
  const gallery = images.slice(2, 6);
  const firstVariant = p.variants?.edges?.[0]?.node;
  const priceAmount = firstVariant?.price?.amount ?? "0";
  const currencyCode = firstVariant?.price?.currencyCode ?? "DKK";

  const [name, ...subParts] = (p.title ?? "").split("—").map((s) => s.trim());
  const subName = subParts.join(" — ") || p.title || "";

  const variants =
    p.variants?.edges?.map((e) => ({
      id: e.node.id,
      title: e.node.title,
      availableForSale: e.node.availableForSale,
      price: `${e.node.price.amount} ${e.node.price.currencyCode}`,
    })) ?? [];

  return {
    id: p.id,
    handle: p.handle,
    name: name || p.title,
    subName: subName || "",
    price: `${priceAmount} ${currencyCode}`,
    priceAmount,
    currencyCode,
    description: (p.description ?? "").replace(/<[^>]*>/g, "").trim(),
    mainImage,
    backImage,
    gallery,
    variants,
  };
}
