import { notFound } from "next/navigation";

// unknown paths under a valid locale render the localized [locale]/not-found.tsx
export default function CatchAllPage() {
  notFound();
}
