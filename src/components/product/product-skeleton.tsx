// The product page's fallback while its data streams in: the gallery square and the info column's lines.
export function ProductSkeleton() {
  return (
    <div aria-hidden className="grid animate-pulse gap-6 sb:grid-cols-2 sb:gap-14">
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
