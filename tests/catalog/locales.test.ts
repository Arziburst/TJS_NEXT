import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { locales } from "@/i18n/routing";

// The database domain public.locale and the app's locale list (D3) must name the same locales.
describe("public.locale domain", () => {
  it("matches src/i18n/routing.ts", () => {
    const dir = "supabase/migrations";
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(`${dir}/${f}`, "utf8"))
      .join("\n");
    const definitions = [...sql.matchAll(/create domain public\.locale as text\s+check \(value in \(([^)]*)\)\)/gi)];
    expect(definitions).toHaveLength(1);
    const domainLocales = [...definitions[0]![1]!.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(domainLocales).toEqual([...locales]);
  });
});
