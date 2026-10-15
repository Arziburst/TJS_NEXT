import { describe, expect, it } from "vitest";
import { countryOptions } from "@/components/delivery/nova-post/country-options";
import {
  DELIVERY_COUNTRIES,
  EU_MEMBER_STATES,
  hasDivisions,
  isDeliveryCountry,
  NETWORK_COUNTRIES,
  zoneOf,
} from "@/lib/delivery/nova-post/countries";

// docs/decisions.md D2: markets are Ukraine + EU + Switzerland, no UK; abroad that is the EU-27 and CH
describe("delivery countries (D2)", () => {
  it("are the 27 EU member states and Switzerland", () => {
    expect(EU_MEMBER_STATES).toHaveLength(27);
    expect(new Set(EU_MEMBER_STATES).size).toBe(27);
    expect([...DELIVERY_COUNTRIES].sort()).toEqual([...EU_MEMBER_STATES, "CH"].sort());
  });

  it("never offer the UK", () => {
    for (const uk of ["GB", "UK", "gb"]) expect(isDeliveryCountry(uk)).toBe(false);
    expect(DELIVERY_COUNTRIES).not.toContain("GB");
    expect(countryOptions("en").map((option) => option.code)).not.toContain("GB");
  });

  it("include Switzerland, not Ukraine (domestic is Nova Poshta, #22)", () => {
    expect(isDeliveryCountry("CH")).toBe(true);
    expect(isDeliveryCountry("UA")).toBe(false);
  });

  it("name every country in the visitor's locale, sorted that locale's way", () => {
    const de = countryOptions("de");
    expect(de).toHaveLength(28);
    expect(de.find((option) => option.code === "CH")?.label).toBe("Schweiz");
    expect(de.find((option) => option.code === "DE")?.label).toBe("Deutschland");
    const labels = de.map((option) => option.label);
    expect(labels).toEqual([...labels].sort(new Intl.Collator("de").compare));
  });
});

describe("delivery zones", () => {
  it("put the Nova Post network countries in A, the rest of the EU in B and Switzerland in C", () => {
    expect(NETWORK_COUNTRIES.every((country) => zoneOf(country) === "A")).toBe(true);
    expect(["PL", "DE", "FR", "CZ", "IT", "ES"].map((c) => zoneOf(c as never))).toEqual(["A", "A", "A", "A", "A", "A"]);
    expect(["AT", "BE", "PT", "SE", "IE", "BG"].map((c) => zoneOf(c as never))).toEqual(["B", "B", "B", "B", "B", "B"]);
    expect(zoneOf("CH")).toBe("C");
  });

  it("offer branches, lockers and pick-up points only in the network", () => {
    expect(hasDivisions("PL")).toBe(true);
    expect(hasDivisions("AT")).toBe(false);
    expect(hasDivisions("CH")).toBe(false);
  });
});
