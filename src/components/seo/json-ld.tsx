import { serializeJsonLd } from "@/lib/seo/product";

/** Structured data for search engines, serialized so no text inside can close the script element. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
