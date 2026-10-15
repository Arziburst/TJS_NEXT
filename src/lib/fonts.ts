import { Cormorant_Garamond, Inter, Playfair_Display, Raleway } from "next/font/google";

/*
 * Display face: a free stand-in for the legacy "TT Ricordi Allegria" (trial licence, not shipped).
 * The owner picks one candidate; switch with DISPLAY_FONT, then delete the other loader.
 * Both candidates have Cyrillic (uk) and Latin Extended (cs / pl / ro) glyphs.
 */
export const DISPLAY_FONT: "A" | "B" = "A";

// `subsets` picks only what is preloaded: the latin-ext and cyrillic faces stay in the CSS and load on
// demand (unicode-range), so a page no longer preloads ~380 KB of fonts ahead of its LCP image (#53)
export const raleway = Raleway({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-raleway",
  display: "swap",
});

// only inputs and selects use Inter: not preloaded, so pages without a form never fetch it
export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: false,
});

// not preloaded while two candidates exist: only the selected face is ever requested
export const displayCandidateA = Cormorant_Garamond({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-display-face",
  display: "swap",
  preload: false,
});

export const displayCandidateB = Playfair_Display({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-display-face",
  display: "swap",
  preload: false,
});

export const displayFont = DISPLAY_FONT === "A" ? displayCandidateA : displayCandidateB;

export const fontVariables = [raleway.variable, inter.variable, displayFont.variable].join(" ");
