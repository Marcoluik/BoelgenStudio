import { readdir } from "node:fs/promises";
import path from "node:path";

const PUBLIC_DIR = path.resolve("public");
const COLLECTION_DIR = path.join(PUBLIC_DIR, "collectionimg");
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const PRODUCT_IMAGE_ORDER = ["front", "trio", "kaligrafi", "wrist", "back"];

function isImageFile(fileName: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

function toPublicUrl(filePath: string): string {
  return `/${path.relative(PUBLIC_DIR, filePath).split(path.sep).join("/")}`;
}

function orderByPreferredName(imageUrls: string[]): string[] {
  return [...imageUrls].sort((a, b) => {
    const aName = path.basename(a, path.extname(a)).toLowerCase();
    const bName = path.basename(b, path.extname(b)).toLowerCase();
    const aIndex = PRODUCT_IMAGE_ORDER.findIndex((name) => aName.includes(name));
    const bIndex = PRODUCT_IMAGE_ORDER.findIndex((name) => bName.includes(name));
    const safeAIndex = aIndex === -1 ? PRODUCT_IMAGE_ORDER.length : aIndex;
    const safeBIndex = bIndex === -1 ? PRODUCT_IMAGE_ORDER.length : bIndex;

    if (safeAIndex !== safeBIndex) {
      return safeAIndex - safeBIndex;
    }

    return a.localeCompare(b, "da");
  });
}

async function getImageUrlsRecursive(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
          return getImageUrlsRecursive(entryPath);
        }

        return isImageFile(entry.name) ? [toPublicUrl(entryPath)] : [];
      })
    );

    return nested.flat();
  } catch {
    return [];
  }
}

function pickImage(imageUrls: string[], keyword: string, fallbackIndex = 0): string {
  return (
    imageUrls.find((url) =>
      path.basename(url, path.extname(url)).toLowerCase().includes(keyword.toLowerCase())
    ) ??
    imageUrls[fallbackIndex] ??
    ""
  );
}

export interface LocalColorImageSet {
  color: string;
  mainImage: string;
  backImage: string;
  gallery: string[];
}

async function getLocalColorImageSet(folderName: string, color: string): Promise<LocalColorImageSet> {
  const folderPath = path.join(COLLECTION_DIR, folderName);
  const imageUrls = orderByPreferredName(await getImageUrlsRecursive(folderPath));
  const mainImage = pickImage(imageUrls, "front");
  const backImage = pickImage(imageUrls, "back", imageUrls.length - 1);
  const gallery = imageUrls.filter((url) => url !== mainImage && url !== backImage);

  return {
    color,
    mainImage,
    backImage,
    gallery,
  };
}

export async function getBolgenLocalImageSets(): Promise<LocalColorImageSet[]> {
  const [whiteSet, blackSet] = await Promise.all([
    getLocalColorImageSet("BølgenHvid", "Hvid"),
    getLocalColorImageSet("BølgenSort", "Sort"),
  ]);

  return [whiteSet, blackSet].filter((set) => set.mainImage);
}

export async function getAllCollectionImageUrls(): Promise<string[]> {
  const imageUrls = await getImageUrlsRecursive(COLLECTION_DIR);
  return orderByPreferredName(imageUrls);
}
