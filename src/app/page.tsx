import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">TJS</h1>
      <p className="text-muted-foreground max-w-prose text-base sm:text-lg">
        Placeholder home page. The storefront is built in the next tasks.
      </p>
      <Button variant="outline" disabled>
        Coming soon
      </Button>
    </main>
  );
}
