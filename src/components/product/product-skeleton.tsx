/*
 * The product page's fallback while its data streams in: the gallery square and the info column's lines.
 * It fills the first screen, so the footer starts below the fold until the product arrives; a product with
 * several photos would otherwise push the visible footer out of view (#57). The heights taken off are the
 * header, main's padding and the footer's margin (9.25rem below 1024px, 11.5rem from 1024px).
 */
export function ProductSkeleton() {
  return (
    <div
      aria-hidden
      className="grid min-h-[calc(100svh-9.25rem)] animate-pulse content-start gap-6 sb:min-h-[calc(100svh-11.5rem)] sb:grid-cols-2 sb:gap-14"
    >
      <div className="aspect-square w-full bg-muted sb:rounded-lg" />
      <div className="flex flex-col gap-5">
        <div className="h-9 w-32 bg-muted" />
        <div className="h-8 w-3/4 bg-muted" />
        <div className="h-7 w-24 bg-muted" />
        <div className="h-20 w-full bg-muted" />
        <div className="h-11 w-48 bg-muted" />
      </div>
    </div>
  );
}
