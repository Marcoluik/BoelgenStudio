/**
 * Billeder til build: lokale fotos i src/assets/collection optimeres af Astro (WebP + srcset),
 * Shopify-billeder skaleres via CDN'ens ?width= parameter.
 */
import type { ImageMetadata } from "astro";
import { getImage } from "astro:assets";

export interface Pic {
  src: string;
  srcset: string;
  width: number;
  height: number;
  alt: string;
  /** Filnavn uden endelse, fx "front" */
  name: string;
  /** Hvor motivet sidder (i % af billedet) og hvor tæt der beskæres på produktkort */
  focus?: { x: number; y: number; zoom: number; lift?: number };
}

const WIDTHS = [480, 800, 1200, 1800];

const modules = import.meta.glob<{ default: ImageMetadata }>(
  "../assets/collection/**/*.{jpg,jpeg,png,webp}",
  { eager: true }
);

/** Rækkefølge i produktgalleriet */
const PRODUCT_ORDER = ["front", "back", "kaligrafi", "wrist", "trio"];

const ALT_BY_NAME: Record<string, string> = {
  front: "set forfra",
  back: "set bagfra med kaligrafi på ryggen",
  kaligrafi: "nærbillede af den broderede kaligrafi",
  wrist: "bølgelogo ved håndleddet",
  trio: "båret af tre venner",
};

/** Fotos hvor hoodien fylder lidt i billedet: zoom ind på motivet, når billedet bruges som produktkort */
const FOCUS: Record<string, { x: number; y: number; zoom: number; lift?: number }> = {
  "hvid/front": { x: 35, y: 64, zoom: 1.8 },
  "hvid/back": { x: 39, y: 62, zoom: 1.8 },
  // lift: den sorte hoodie står mod en sort nat, så billedet lysnes en anelse
  "sort/front": { x: 47, y: 62, zoom: 1.8, lift: 1.3 },
  "sort/back": { x: 47, y: 62, zoom: 1.4 },
};

/**
 * Inline-style der beskærer et foto omkring motivet: billedet gøres bredere end sin boks og
 * forskydes, så fokuspunktet lander midt i boksen. Zoom hæves automatisk, hvis boksen ellers
 * ikke ville være dækket helt. boxRatio = boksens højde / bredde.
 */
export function focusCrop(pic: Pic, scale = 1, boxRatio = 1.25, anchorY = 0.56): string {
  const f = pic.focus;
  if (!f) return "";
  const fx = f.x / 100;
  const fy = f.y / 100;
  const r = pic.height / pic.width;
  const minZoom = Math.max(
    0.5 / fx,
    0.5 / (1 - fx),
    (anchorY * boxRatio) / (fy * r),
    ((1 - anchorY) * boxRatio) / ((1 - fy) * r)
  );
  const zoom = Math.max(f.zoom * scale, minZoom * 1.02);
  return [
    "position: absolute",
    "left: 50%",
    `top: ${anchorY * 100}%`,
    `width: ${(zoom * 100).toFixed(1)}%`,
    "max-width: none",
    "height: auto",
    `transform: translate(-${f.x}%, -${f.y}%)`,
    f.lift ? `filter: brightness(${f.lift})` : "",
  ]
    .filter(Boolean)
    .join("; ") + ";";
}

function baseName(path: string): string {
  return (path.split("/").pop() ?? "").replace(/\.[^.]+$/, "").toLowerCase();
}

export function normalizeKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/ø/gi, "o")
    .toLowerCase();
}

async function toPic(meta: ImageMetadata, alt: string, path = ""): Promise<Pic> {
  const name = baseName(path);
  const folder = path.split("/").slice(-2, -1)[0] ?? "";
  const widths = WIDTHS.filter((w) => w < meta.width);
  if (widths.length === 0) widths.push(meta.width);
  const img = await getImage({ src: meta, widths, format: "webp", quality: 72 });
  return {
    src: img.src,
    srcset: img.srcSet.attribute,
    width: meta.width,
    height: meta.height,
    alt,
    name,
    focus: FOCUS[`${folder}/${name}`],
  };
}

function entriesIn(folder: string): [string, ImageMetadata][] {
  const marker = `/collection/${folder}/`;
  return Object.entries(modules)
    .filter(([path]) => path.includes(marker))
    .map(([path, mod]) => [path, mod.default] as [string, ImageMetadata])
    .sort(([a], [b]) => a.localeCompare(b, "da"));
}

/** Lokale produktfotos for en farve, fx "Hvid" -> src/assets/collection/hvid */
export async function getLocalColorPics(color: string, productName: string): Promise<Pic[]> {
  const entries = entriesIn(normalizeKey(color)).sort(([a], [b]) => {
    const ai = PRODUCT_ORDER.indexOf(baseName(a));
    const bi = PRODUCT_ORDER.indexOf(baseName(b));
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return Promise.all(
    entries.map(([path, meta]) => {
      const detail = ALT_BY_NAME[baseName(path)];
      return toPic(meta, `${productName} i ${color.toLowerCase()}${detail ? `, ${detail}` : ""}`, path);
    })
  );
}

export async function getStudioPics(): Promise<Pic[]> {
  return Promise.all(
    entriesIn("studio").map(([path, meta]) => toPic(meta, "Bølgen Studio, fra havnen i København", path))
  );
}

/** Enkelt billede, fx "sort/kaligrafi.jpg" */
export async function getPicByPath(relative: string, alt: string): Promise<Pic | null> {
  const hit = Object.entries(modules).find(([path]) => path.endsWith(`/collection/${relative}`));
  return hit ? toPic(hit[1].default, alt, hit[0]) : null;
}

/** Shopify CDN: byg srcset ud fra ?width= */
export function shopifyPic(url: string, alt: string): Pic {
  const withWidth = (w: number) => {
    try {
      const u = new URL(url);
      u.searchParams.set("width", String(w));
      return u.toString();
    } catch {
      return url;
    }
  };
  return {
    src: withWidth(1200),
    srcset: WIDTHS.map((w) => `${withWidth(w)} ${w}w`).join(", "),
    width: 1200,
    height: 1500,
    alt,
    name: "",
  };
}
