import { describe, expect, it } from "vitest";
import { contactLinks } from "./contact-links";

describe("the customer's tap-to-contact links", () => {
  it("calls and emails with what the order holds", () => {
    expect(contactLinks({ phone: "+380501234567", email: "olena@example.test" })).toEqual([
      { kind: "phone", href: "tel:+380501234567", text: "+380501234567" },
      { kind: "email", href: "mailto:olena@example.test", text: "olena@example.test" },
    ]);
  });

  it("never invents a messenger: none without a handle the customer gave", () => {
    const kinds = contactLinks({ phone: "+380501234567", email: "olena@example.test" }).map((link) => link.kind);
    expect(kinds).not.toContain("viber");
    expect(kinds).not.toContain("whatsapp");
    expect(kinds).not.toContain("telegram");
    expect(kinds).not.toContain("instagram");
  });

  it("links the messengers the customer gave", () => {
    const links = contactLinks({
      phone: "+380501234567",
      email: "a@example.test",
      instagram: "@tjs.store",
      telegram: "olena_k",
      viber: "+380 50 123 45 67",
      whatsapp: "+4915112345678",
    });
    expect(links.slice(2)).toEqual([
      { kind: "instagram", href: "https://instagram.com/tjs.store", text: "@tjs.store" },
      { kind: "telegram", href: "https://t.me/olena_k", text: "@olena_k" },
      { kind: "viber", href: "viber://chat?number=%2B380501234567", text: "+380501234567" },
      { kind: "whatsapp", href: "https://wa.me/4915112345678", text: "+4915112345678" },
    ]);
  });

  it("drops a handle that is not one (no injected URL)", () => {
    const links = contactLinks({
      phone: "not a phone",
      email: "a@example.test",
      instagram: "evil.com/x?y=1",
      telegram: "javascript:alert(1)",
      viber: "123",
    });
    expect(links.map((link) => link.kind)).toEqual(["email"]);
  });

  it("keeps an email address intact in its mailto link", () => {
    expect(contactLinks({ phone: "", email: "o+shop@example.test" })[0].href).toBe("mailto:o%2Bshop@example.test");
  });
});
