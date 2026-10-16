import { describe, expect, it } from "vitest";
import { firstLoadScripts, gzipSize, overBudget } from "../../e2e/client-js";

describe("firstLoadScripts", () => {
  it("collects the script tags and the chunks the inline payload names, once each", () => {
    const html = [
      '<script src="/_next/static/chunks/a1.js" async=""></script>',
      '<script src="/_next/static/chunks/b2.js" async=""></script>',
      '<script>(globalThis["TURBOPACK"] || []).push({"otherChunks":["static/chunks/a1.js","static/chunks/c3.js"]})</script>',
      '<script>self.__next_f.push([1,"5:I[123,[\\"static/chunks/d~4.js\\"],\\"Menu\\"]"])</script>',
    ].join("");
    expect(firstLoadScripts(html)).toEqual([
      "/_next/static/chunks/a1.js",
      "/_next/static/chunks/b2.js",
      "/_next/static/chunks/c3.js",
      "/_next/static/chunks/d~4.js",
    ]);
  });

  it("leaves out the nomodule polyfills, also where the payload names them", () => {
    const html =
      '<script src="/_next/static/chunks/poly.js" noModule=""></script><script src="/_next/static/chunks/main.js" async=""></script>' +
      '<script>x("static/chunks/poly.js")</script>';
    expect(firstLoadScripts(html)).toEqual(["/_next/static/chunks/main.js"]);
  });
});

describe("overBudget", () => {
  const budgets = { home: 180, shop: 190 };

  it("passes routes at or under their budget", () => {
    expect(overBudget([{ route: "home", kilobytes: 180 }, { route: "shop", kilobytes: 120.4 }], budgets)).toEqual([]);
  });

  it("fails a route that grows past its budget", () => {
    expect(overBudget([{ route: "home", kilobytes: 180.1 }, { route: "shop", kilobytes: 150 }], budgets)).toEqual([
      "home: 180.1 KB of first-load JS, budget 180 KB",
    ]);
  });

  it("measures the gzip transfer size, not the raw size", () => {
    const body = Buffer.from("x".repeat(10_000));
    expect(gzipSize(body)).toBeLessThan(body.length / 10);
  });
});
