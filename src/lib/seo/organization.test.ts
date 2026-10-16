import { describe, expect, it } from "vitest";
import { siteJsonLd } from "./organization";

const base = new URL("https://tjs.example");

function graph(data: Record<string, unknown>) {
  const [organization, website] = data["@graph"] as Record<string, unknown>[];
  return { organization, website };
}

describe("siteJsonLd", () => {
  it("describes one Organization for every locale and the locale's WebSite with a search action", () => {
    const data = siteJsonLd({ base, locale: "de", name: "TJS", description: "Schmuck" });
    expect(data["@context"]).toBe("https://schema.org");
    const { organization, website } = graph(data);

    expect(organization).toEqual({
      "@type": "Organization",
      "@id": "https://tjs.example/#organization",
      name: "TJS",
      url: "https://tjs.example/de",
    });
    expect(website).toEqual({
      "@type": "WebSite",
      "@id": "https://tjs.example/de#website",
      url: "https://tjs.example/de",
      name: "TJS",
      description: "Schmuck",
      inLanguage: "de",
      publisher: { "@id": "https://tjs.example/#organization" },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: "https://tjs.example/de/search?q={search_term_string}" },
        "query-input": "required name=search_term_string",
      },
    });
    // the same organization from another locale's home page
    expect(graph(siteJsonLd({ base, locale: "uk", name: "TJS", description: "" })).organization["@id"]).toBe(
      organization["@id"],
    );
  });

  it("states the contacts that are set, and nothing for the ones that are not", () => {
    const { organization } = graph(
      siteJsonLd({
        base,
        locale: "en",
        name: "TJS",
        description: "",
        contacts: { email: "shop@tjs.example", telephone: null, sameAs: ["https://instagram.com/tjs"] },
      }),
    );
    expect(organization.email).toBe("shop@tjs.example");
    expect(organization).not.toHaveProperty("telephone");
    expect(organization.sameAs).toEqual(["https://instagram.com/tjs"]);
    expect(graph(siteJsonLd({ base, locale: "en", name: "TJS", description: "", contacts: { sameAs: [] } })).organization).not.toHaveProperty(
      "sameAs",
    );
  });

  it("never states shipping or return policies: their terms are not decided (TBD)", () => {
    const json = JSON.stringify(siteJsonLd({ base, locale: "en", name: "TJS", description: "", contacts: { email: "a@b.c" } }));
    for (const field of ["hasMerchantReturnPolicy", "shippingDetails", "MerchantReturnPolicy", "OfferShippingDetails"]) {
      expect(json).not.toContain(field);
    }
  });
});
