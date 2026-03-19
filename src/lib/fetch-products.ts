/**
 * Fetches products at build time. Falls back to static products if Shopify fails.
 */
import { getBolgenLocalImageSets } from "./collection-images";
import { fetchProducts } from "./shopify";
import { shopifyToUnified, type UnifiedProduct } from "./product-utils";

function normalizeValue(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function applyLocalImages(products: UnifiedProduct[], localImageSets: Awaited<ReturnType<typeof getBolgenLocalImageSets>>): UnifiedProduct[] {
  if (localImageSets.length === 0) return products;

  return products.map((product, index) => {
    const matchesBolgen =
      normalizeValue(product.handle).includes("bolgen") ||
      normalizeValue(product.name).includes("bolgen");

    if (!matchesBolgen) {
      return product;
    }

    const colorGroups =
      product.colorGroups.length > 0
        ? product.colorGroups
            .map((group) => {
              const localMatch = localImageSets.find(
                (set) => normalizeValue(set.color) === normalizeValue(group.color)
              );

              if (!localMatch) return group;

              return {
                ...group,
                mainImage: localMatch.mainImage,
                backImage: localMatch.backImage,
                gallery: localMatch.gallery,
              };
            })
            .filter((group) => group.mainImage)
        : localImageSets.map((set) => ({
            color: set.color,
            mainImage: set.mainImage,
            backImage: set.backImage,
            gallery: set.gallery,
            variants: [],
          }));

    const firstColorGroup = colorGroups[0];
    if (!firstColorGroup) return product;

    return {
      ...product,
      mainImage: firstColorGroup.mainImage,
      backImage: firstColorGroup.backImage,
      gallery: firstColorGroup.gallery,
      colorGroups,
      colors:
        product.colors.length > 0
          ? product.colors
          : colorGroups.map((group) => group.color),
    };
  });
}

async function getFallbackProducts(): Promise<UnifiedProduct[]> {
  const localImageSets = await getBolgenLocalImageSets();
  const firstColorGroup = localImageSets[0];

  return [
    {
      id: "bolgen-logo-hoodie",
      handle: "bolgen-logo-hoodie",
      name: "Bølgen Logo Hoodie",
      subName: "Tung studie-hoodie",
      price: "599 DKK",
      priceAmount: "599",
      currencyCode: "DKK",
      description:
        "Premium tung hoodie med vores kaligrafi på ryggen og signatur-bølgelogo på håndleddet. Fremstillet for holdbarhed og komfort.",
      mainImage: firstColorGroup?.mainImage ?? "",
      backImage: firstColorGroup?.backImage ?? firstColorGroup?.mainImage ?? "",
      gallery: firstColorGroup?.gallery ?? [],
      variants: [],
      colorGroups: localImageSets.map((set) => ({
        color: set.color,
        mainImage: set.mainImage,
        backImage: set.backImage,
        gallery: set.gallery,
        variants: [],
      })),
      colors: localImageSets.map((set) => set.color),
      sizes: [],
    },
  ].filter((product) => product.mainImage);
}

export async function getProductsAtBuild(): Promise<UnifiedProduct[]> {
  const localImageSets = await getBolgenLocalImageSets();

  try {
    const shopifyProducts = await fetchProducts();
    if (shopifyProducts.length > 0) {
      return applyLocalImages(shopifyProducts.map(shopifyToUnified), localImageSets);
    }
  } catch (e) {
    console.warn("[Shopify] Build-time fetch failed, using fallback:", (e as Error).message);
  }

  return getFallbackProducts();
}
