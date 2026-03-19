import type { ShopifyProduct } from "./shopify";

export interface UnifiedVariant {
  id: string;
  title: string;
  availableForSale: boolean;
  quantityAvailable?: number | null;
  price: string;
  size?: string;
  color?: string;
}

export interface ColorGroup {
  color: string;
  mainImage: string;
  backImage: string;
  gallery: string[];
  variants: UnifiedVariant[];
}

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
  variants: UnifiedVariant[];
  /** When product has Color option: groups variants by color with per-color images */
  colorGroups: ColorGroup[];
  /** Option values: colors (if any), sizes */
  colors: string[];
  sizes: string[];
}

function matchesOptionName(optionName: string, names: string[]): boolean {
  const normalized = optionName.toLowerCase();
  return names.some((name) => normalized === name.toLowerCase());
}

function getSelectedOptionValue(
  selectedOptions: { name: string; value: string }[] | undefined,
  names: string[]
): string | undefined {
  return selectedOptions?.find((option) => matchesOptionName(option.name, names))?.value;
}

function getOptionIndex(options: { name: string; values: string[] }[] | undefined, names: string[]): number {
  if (!options) return -1;
  const i = options.findIndex((option) => matchesOptionName(option.name, names));
  return i >= 0 ? i : -1;
}

function formatMoneyAmount(amount: string): string {
  return amount
    .replace(/(\.\d*?[1-9])0+$/u, "$1")
    .replace(/\.0+$/u, "")
    .replace(/\.$/u, "");
}

export function shopifyToUnified(p: ShopifyProduct): UnifiedProduct {
  const colorOptionNames = ["Color", "Colour", "Farve"];
  const sizeOptionNames = ["Size", "Størrelse"];
  const images = p.images?.edges?.map((e) => e.node.url) ?? [];
  const feat = p.featuredImage?.url ?? images[0] ?? "/collectionimg/wfront.jpg";
  const mainImage = feat;
  const backImage = images[1] ?? images[0] ?? mainImage;
  const gallery = images.slice(2, 6);
  const firstVariant = p.variants?.edges?.[0]?.node;
  const priceAmount = firstVariant?.price?.amount ?? "0";
  const currencyCode = firstVariant?.price?.currencyCode ?? "DKK";

  const [name, ...subParts] = (p.title ?? "").split("—").map((s) => s.trim());
  const subName = subParts.join(" — ");

  const options = p.options ?? [];
  const colorIdx = getOptionIndex(options, colorOptionNames);
  const sizeIdx = getOptionIndex(options, sizeOptionNames);

  const colors: string[] = colorIdx >= 0 ? (options[colorIdx]?.values ?? []) : [];
  const sizes: string[] = sizeIdx >= 0 ? (options[sizeIdx]?.values ?? []) : [];

  const rawVariants =
    p.variants?.edges?.map((e) => {
      const node = e.node;
      const parts = node.title.split("/").map((s) => s.trim());
      const color =
        getSelectedOptionValue(node.selectedOptions, colorOptionNames) ??
        (colorIdx >= 0 ? parts[colorIdx] : undefined);
      const size =
        getSelectedOptionValue(node.selectedOptions, sizeOptionNames) ??
        (sizeIdx >= 0 ? parts[sizeIdx] ?? parts[0] : node.title);
      return {
        id: node.id,
        title: node.title,
        availableForSale: node.availableForSale,
        quantityAvailable: node.quantityAvailable ?? undefined,
        price: `${formatMoneyAmount(node.price.amount)} ${node.price.currencyCode}`,
        size,
        color,
        variantImage: node.image?.url,
      };
    }) ?? [];

  const variants: UnifiedVariant[] = rawVariants.map(({ variantImage: _, ...v }) => v);

  // Build color groups: each color gets its images (from first variant with image, or product images)
  const colorGroups: ColorGroup[] = [];

  if (colors.length > 0) {
    for (const color of colors) {
      const colorVariants = rawVariants.filter((v) => v.color === color);
      const withImage = colorVariants.find((v) => v.variantImage);
      const imgUrl = withImage?.variantImage;
      // Shopify often associates images with variants; product.images may be ordered by color
      const colorImages = images.filter((url) => url);
      const firstForColor = colorVariants[0];
      const main = imgUrl ?? (color === colors[0] ? mainImage : colorImages[colors.indexOf(color)] ?? mainImage);
      const back = imgUrl ?? backImage;
      const gal = gallery;
      colorGroups.push({
        color,
        mainImage: main,
        backImage: back,
        gallery: gal,
        variants: colorVariants.map(({ variantImage: _, ...v }) => v),
      });
    }
    // If we have color groups but no variant images, use product images for first color
    if (colorGroups.length > 0 && !rawVariants.some((v) => v.variantImage)) {
      colorGroups[0].mainImage = mainImage;
      colorGroups[0].backImage = backImage;
      colorGroups[0].gallery = gallery;
    }
  } else {
    // No color option: single group with product images
    colorGroups.push({
      color: "Default",
      mainImage,
      backImage,
      gallery,
      variants,
    });
  }

  return {
    id: p.id,
    handle: p.handle,
    name: name || p.title,
    subName,
    price: `${formatMoneyAmount(priceAmount)} ${currencyCode}`,
    priceAmount: formatMoneyAmount(priceAmount),
    currencyCode,
    description: (p.description ?? "").replace(/<[^>]*>/g, "").trim(),
    mainImage,
    backImage,
    gallery,
    variants,
    colorGroups,
    colors,
    sizes,
  };
}
