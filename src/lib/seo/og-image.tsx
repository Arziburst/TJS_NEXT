import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cacheLife } from "next/cache";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { CATEGORY_SLUGS, type CategorySlug } from "@/lib/catalog/categories";
import { FAILED_READ_LIFE } from "@/lib/failed-read";
import { OG_IMAGE_SIZE } from "./open-graph";

/*
 * The share images (og:image, also used by X's large card): 1200 × 630 PNG on the shop's beige, set in the
 * shop's body face (Raleway, OFL: ./og-fonts), which carries Cyrillic, Latin Extended (cs, pl, ro) and the
 * currency signs; next/og's own font is Latin only. Not the display face: the image renderer (satori) ignores
 * the offsets of Cormorant's composite glyphs and draws every accent of á, č, ł … beside its letter.
 */

const FONTS_DIR = join(process.cwd(), "src/lib/seo/og-fonts");
const CATEGORY_PHOTOS_DIR = join(process.cwd(), "src/assets/categories");

// the design tokens of src/app/globals.css (satori reads no CSS variables)
const BEIGE = "#f4f0eb";
const BROWN = "#635a59";
const CORAL_TEXT = "#b93b27";
const HAIRLINE = "#e2dad1";

// read once at module scope: no request data, and an uncached read inside a prerendered image route is refused
const FONTS = [
  { name: "Raleway", data: await readFile(join(FONTS_DIR, "Raleway-Medium.ttf")), weight: 500 as const, style: "normal" as const },
];

async function toDataUrl(image: Buffer, width: number, height: number): Promise<string> {
  // satori decodes PNG and JPEG only (no WebP, no AVIF): every photo is re-encoded as a JPEG of the drawn size
  const jpeg = await sharp(image).rotate().resize(width, height, { fit: "cover" }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

/** A product photo as the share image draws it (630 × 630), or null when it cannot be read. */
export async function productPhoto(url: string): Promise<string | null> {
  "use cache";
  try {
    // no-store: never Next's implicit build-time fetch cache (docs/standards.md §3); this entry is the cache
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const photo = await toDataUrl(Buffer.from(await response.arrayBuffer()), OG_IMAGE_SIZE.height, OG_IMAGE_SIZE.height);
    // a photo is never overwritten (a changed one gets a new storage path): its URL names its pixels
    cacheLife("max");
    return photo;
  } catch (error) {
    console.error("og image: product photo unavailable", error);
    cacheLife(FAILED_READ_LIFE);
    return null;
  }
}

/** A category's own photo (src/assets/categories), square, `size` pixels wide. */
export async function categoryPhoto(slug: CategorySlug, size: number): Promise<string> {
  "use cache";
  // a file of the build: it changes only with a deploy
  cacheLife("max");
  return toDataUrl(await readFile(join(CATEGORY_PHOTOS_DIR, `${slug}.jpg`)), size, size);
}

/** The six category photos as a grid: the art of the pages about the whole shop (home, listing). */
export async function allCategoriesArt(): Promise<ShareImageInput["art"]> {
  const cell = 180;
  return { kind: "grid", photos: await Promise.all(CATEGORY_SLUGS.map((slug) => categoryPhoto(slug, cell))), cell };
}

export type ShareImageInput = {
  brand: string;
  title: string;
  /** A line under the title (the shop's description, a product's price …). */
  subtitle?: string | null;
  /** The price, drawn in the accent colour. */
  price?: string | null;
  /** Photos as data URLs: one filling the right side (bleed), or square tiles of `cell` pixels (grid). */
  art: { kind: "bleed"; photo: string } | { kind: "grid"; photos: readonly string[]; cell: number } | null;
};

const PADDING = 64;
const GAP = 12;
// Raleway's widest lower-case glyphs, as a share of the font size: a word of n letters fits n × this × size
const GLYPH_WIDTH = 0.6;
const GRID_COLUMNS = 3;

function gridWidth(photos: number, cell: number): number {
  const columns = Math.min(photos, GRID_COLUMNS);
  return columns * cell + (columns - 1) * GAP;
}

function artWidth(art: ShareImageInput["art"]): number {
  if (!art) return 0;
  if (art.kind === "bleed") return OG_IMAGE_SIZE.height;
  return gridWidth(art.photos.length, art.cell) + PADDING;
}

/**
 * The title's font size: smaller for long titles, and small enough that its longest word fits the line (the
 * renderer breaks lines only at spaces and hyphens).
 */
export function titleFontSize(title: string, width: number): number {
  const bySize = title.length > 60 ? 44 : title.length > 30 ? 52 : 64;
  const longestWord = Math.max(...title.split(/[\s-]+/).map((word) => word.length));
  return Math.max(28, Math.min(bySize, Math.floor(width / (longestWord * GLYPH_WIDTH))));
}

function Art({ art }: { art: ShareImageInput["art"] }) {
  if (!art) return null;
  if (art.kind === "bleed") {
    const side = OG_IMAGE_SIZE.height;
    // eslint-disable-next-line @next/next/no-img-element -- satori draws plain <img>, next/image does not exist here
    return <img src={art.photo} width={side} height={side} alt="" />;
  }
  return (
    <div
      style={{ display: "flex", flexWrap: "wrap", gap: GAP, width: gridWidth(art.photos.length, art.cell), marginRight: PADDING }}
    >
      {art.photos.map((photo, index) => (
        // eslint-disable-next-line @next/next/no-img-element -- see above
        <img key={index} src={photo} width={art.cell} height={art.cell} alt="" style={{ borderRadius: 6 }} />
      ))}
    </div>
  );
}

export async function shareImage({ brand, title, subtitle, price, art }: ShareImageInput): Promise<ImageResponse> {
  const titleSize = titleFontSize(title, OG_IMAGE_SIZE.width - artWidth(art) - 2 * PADDING);
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          background: BEIGE,
          color: BROWN,
          fontFamily: "Raleway",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            flex: 1,
            height: "100%",
            padding: PADDING,
          }}
        >
          <div style={{ display: "flex", fontSize: 28, letterSpacing: 6, textTransform: "uppercase" }}>{brand}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div
              style={{
                display: "flex",
                fontSize: titleSize,
                lineHeight: 1.2,
                // long titles stop after three lines
                maxHeight: titleSize * 1.2 * 3,
                overflow: "hidden",
                wordBreak: "break-word",
              }}
            >
              {title}
            </div>
            {subtitle ? <div style={{ display: "flex", fontSize: 28, lineHeight: 1.4 }}>{subtitle}</div> : null}
            {price ? <div style={{ display: "flex", fontSize: 44, color: CORAL_TEXT }}>{price}</div> : null}
          </div>
          <div style={{ display: "flex", width: 96, height: 4, background: HAIRLINE }} />
        </div>
        <Art art={art} />
      </div>
    ),
    { ...OG_IMAGE_SIZE, fonts: FONTS },
  );
}
