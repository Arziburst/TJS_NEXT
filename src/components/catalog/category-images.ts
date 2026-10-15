import type { StaticImageData } from "next/image";
import type { CategorySlug } from "@/lib/catalog/categories";
import bracelets from "@/assets/categories/bracelets.jpg";
import brooches from "@/assets/categories/brooches.jpg";
import corals from "@/assets/categories/corals.jpg";
import earrings from "@/assets/categories/earrings.jpg";
import necklaces from "@/assets/categories/necklaces.jpg";
import rings from "@/assets/categories/rings.jpg";
import seeAll from "@/assets/categories/see-all.png";

// The shop's own category photos from the legacy home page (TJS_frontend_2 src/assets/images).
export const CATEGORY_IMAGES: Record<CategorySlug, StaticImageData> = {
  earrings,
  necklaces,
  bracelets,
  corals,
  rings,
  brooches,
};

export const SEE_ALL_IMAGE = seeAll;

// next/image's blur placeholder of a static import, as a variable: the user-text lint reads a literal
// `placeholder="…"` attribute as visible text
export const STATIC_BLUR = "blur";
