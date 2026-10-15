import http from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test, type Page } from "@playwright/test";

/*
 * Cumulative layout shift while a page loads, without input (D22: desktop CLS counts for search ranking).
 * Measured twice per page: as served, and with its streamed parts held back so the static shell paints
 * first with every Suspense placeholder (the state a slow network or a cold server shows, #57).
 */

// a good CLS is below 0.1; the shell must not move at all (#57)
const MAX_CLS = 0.01;
// Seeded products (supabase/seed.sql) with photos from npm run seed:images (e2e/global-setup.ts).
const PAGES = ["/de/shop", "/uk/shop", "/de/product/korallen-tropfenohrringe"];
// React streams each resolved Suspense boundary after the static shell as <div hidden id="S:n">
const STREAMED = Buffer.from('<div hidden id="S:');
const HOLD_MS = 1_500;

/** A proxy to `target` that sends each HTML document's static shell at once and its streamed rest late. */
async function startStreamDelayProxy(target: URL) {
  // documents whose streamed parts were held back: none means the page did not stream and proved nothing
  let heldDocuments = 0;
  const server = http.createServer((req, res) => {
    // uncompressed, so the proxy can find where the streamed parts begin
    const headers = { ...req.headers };
    delete headers["accept-encoding"];
    const upstream = http.request(
      { host: target.hostname, port: target.port, path: req.url, method: req.method, headers },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers);
        if (!String(response.headers["content-type"]).startsWith("text/html")) {
          response.pipe(res);
          return;
        }
        // shell: before the first streamed part; held: waiting; rest: passing the remainder through
        let mode: "shell" | "held" | "rest" = "shell";
        let pending = Buffer.alloc(0);
        const held: Buffer[] = [];
        let ended = false;
        response.on("data", (chunk: Buffer) => {
          if (mode === "rest") {
            res.write(chunk);
          } else if (mode === "held") {
            held.push(chunk);
          } else {
            pending = Buffer.concat([pending, chunk]);
            const at = pending.indexOf(STREAMED);
            if (at < 0) {
              // keep a tail that may be the start of the marker
              const safe = Math.max(0, pending.length - STREAMED.length + 1);
              res.write(pending.subarray(0, safe));
              pending = pending.subarray(safe);
              return;
            }
            res.write(pending.subarray(0, at));
            held.push(pending.subarray(at));
            mode = "held";
            heldDocuments++;
            setTimeout(() => {
              for (const part of held) res.write(part);
              mode = "rest";
              if (ended) res.end();
            }, HOLD_MS);
          }
        });
        response.on("end", () => {
          ended = true;
          if (mode === "shell") res.end(pending);
          else if (mode === "rest") res.end();
        });
      },
    );
    upstream.on("error", () => res.destroy());
    req.pipe(upstream);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    heldDocuments: () => heldDocuments,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

type Shift = { value: number; sources: string[] };

async function observeLayoutShifts(page: Page) {
  await page.addInitScript(() => {
    const shifts: { value: number; sources: string[] }[] = [];
    (window as unknown as { __layoutShifts: typeof shifts }).__layoutShifts = shifts;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as {
        value: number;
        hadRecentInput: boolean;
        sources: { node: Node | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[];
      }[]) {
        if (entry.hadRecentInput) continue;
        shifts.push({
          value: entry.value,
          sources: entry.sources.map(({ node, previousRect: a, currentRect: b }) => {
            const name = node instanceof Element ? `${node.tagName.toLowerCase()}.${node.className}` : node?.nodeName;
            return `${name}: ${a.x},${a.y} ${a.width}x${a.height} → ${b.x},${b.y} ${b.width}x${b.height}`;
          }),
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

// every shift until the page has loaded, its fonts and above-the-fold images are in and two frames passed
async function layoutShiftsAfterLoad(page: Page, url: string): Promise<Shift[]> {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForLoadState("networkidle");
  return page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return (window as unknown as { __layoutShifts: Shift[] }).__layoutShifts;
  });
}

function expectStable(shifts: Shift[]) {
  const cls = shifts.reduce((sum, shift) => sum + shift.value, 0);
  expect(cls, `layout shifts:\n${shifts.map((s) => `${s.value.toFixed(4)} ${s.sources.join(" | ")}`).join("\n")}`).toBeLessThan(
    MAX_CLS,
  );
}

test.describe("layout shift while loading", () => {
  for (const path of PAGES) {
    test(`${path} as served`, async ({ page }) => {
      await observeLayoutShifts(page);
      expectStable(await layoutShiftsAfterLoad(page, path));
    });

    test(`${path} with its streamed parts arriving late`, async ({ page, baseURL }) => {
      const proxy = await startStreamDelayProxy(new URL(baseURL!));
      try {
        await observeLayoutShifts(page);
        const shifts = await layoutShiftsAfterLoad(page, proxy.url + path);
        expect(proxy.heldDocuments(), "the page streams parts after its static shell").toBeGreaterThan(0);
        expectStable(shifts);
      } finally {
        await proxy.close();
      }
    });
  }
});
