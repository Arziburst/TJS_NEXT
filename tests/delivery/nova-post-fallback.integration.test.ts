// The fallback path against the local stack: without NOVA_POST_API_KEY the estimate is the zone flat rate of
// nova_post_zone_rates (TBD rows from the migration), read under RLS as a visitor and converted with the
// stack's money tables. Skipped when no local stack is configured.
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { localStack } from "../catalog/local-stack";

vi.mock("server-only", () => ({}));

const stack = localStack();

describe.skipIf(!stack)("Nova Post fallback on the local stack", async () => {
  if (!stack) return;
  vi.stubEnv("NOVA_POST_API_KEY", "");
  const { getNovaPostClient } = await import("@/lib/delivery/nova-post/config");
  const { parcelForOrder } = await import("@/lib/delivery/nova-post/parcel");
  const { estimateDelivery } = await import("@/lib/delivery/nova-post/quote");
  const { readZoneRates } = await import("@/lib/delivery/nova-post/zone-rates");
  const { readMoneyTables } = await import("@/lib/money/store");
  const { priceIn } = await import("@/lib/money/format");

  const service = createClient<Database>(stack.url, stack.serviceRoleKey, { auth: { persistSession: false } });

  afterAll(async () => {
    await service.from("nova_post_zone_rates").update({ amount_minor: null, currency: null }).eq("zone", "B");
    vi.unstubAllEnvs();
  });

  it("has no client while the API key is unset", () => {
    expect(getNovaPostClient()).toBeNull();
  });

  it("reads every zone as TBD until the owner sets the amounts", async () => {
    expect(await readZoneRates()).toEqual({ A: null, B: null, C: null });
  });

  it.each([
    ["PL", "A", "PLN"],
    ["DE", "A", "EUR"],
    ["FR", "A", "EUR"],
    ["CH", "C", "CHF"],
  ] as const)("estimates %s by the zone %s flat rate, shown as TBD", async (country, zone, currency) => {
    const tables = await readMoneyTables();
    const destination = { kind: "address", city: "City", postCode: "10115", street: "Street", building: "1" } as const;
    const estimate = await estimateDelivery(
      { country, destination, currency },
      { client: getNovaPostClient(), parcel: parcelForOrder(), zoneRates: readZoneRates, tables },
    );
    expect(estimate).toEqual({ source: "flatRate", zone, price: { state: "tbd" }, reason: "notConfigured" });
  });

  it("converts a flat rate once one is set, like a product price", async () => {
    // a test amount, removed after the suite; the real amounts are the owner's
    const { error } = await service.from("nova_post_zone_rates").update({ amount_minor: 1500, currency: "USD" }).eq("zone", "B");
    expect(error).toBeNull();
    const tables = await readMoneyTables();
    const destination = { kind: "address", city: "Wien", postCode: "1010", street: "Graben", building: "1" } as const;
    const estimate = await estimateDelivery(
      { country: "AT", destination, currency: "EUR" },
      { client: getNovaPostClient(), parcel: parcelForOrder(), zoneRates: readZoneRates, tables },
    );
    expect(estimate).toEqual({
      source: "flatRate",
      zone: "B",
      price: { state: "amount", money: priceIn(1500, "EUR", tables) },
      reason: "notConfigured",
    });
  });
});
