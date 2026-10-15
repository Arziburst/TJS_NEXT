import { notFound } from "next/navigation";

// an error route like Next's own /_not-found, which is excluded from instant validation too:
// it never renders a page, so there is no navigation UI to validate
export const instant = false;

// unknown paths under a valid locale render the localized [locale]/not-found.tsx
export default function CatchAllPage() {
  notFound();
}
