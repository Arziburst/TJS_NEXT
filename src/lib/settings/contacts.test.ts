import { describe, expect, it } from "vitest";
import {
  contactFormValues,
  normalizeInstagram,
  normalizeTelegram,
  normalizeViber,
  normalizeWhatsApp,
  parseContactsForm,
  shopContacts,
} from "./contacts";

describe("contact normalization", () => {
  it("reads an Instagram handle from a handle or a profile link", () => {
    for (const text of ["trend_jewelry_store08", "@trend_jewelry_store08", "instagram.com/trend_jewelry_store08", "https://www.instagram.com/trend_jewelry_store08/?igsh=abc"]) {
      expect(normalizeInstagram(text), text).toBe("trend_jewelry_store08");
    }
    expect(normalizeInstagram("https://evil.example/trend")).toBeNull();
    expect(normalizeInstagram("https://instagram.com/p/abc")).toBeNull();
    expect(normalizeInstagram("has space")).toBeNull();
  });

  it("turns a Telegram name or link into a t.me link", () => {
    for (const text of ["tjs_shop", "@tjs_shop", "t.me/tjs_shop", "https://t.me/tjs_shop", "https://telegram.me/tjs_shop"]) {
      expect(normalizeTelegram(text), text).toBe("https://t.me/tjs_shop");
    }
    expect(normalizeTelegram("https://t.me/+AbCdEf123")).toBe("https://t.me/+AbCdEf123");
    expect(normalizeTelegram("tjs")).toBeNull();
    expect(normalizeTelegram("https://evil.example/tjs_shop")).toBeNull();
    expect(normalizeTelegram("javascript:alert(1)")).toBeNull();
  });

  it("turns a phone number or a chat link into a Viber chat link", () => {
    expect(normalizeViber("+38 (066) 123-45-67")).toBe("viber://chat?number=%2B380661234567");
    expect(normalizeViber("viber://chat?number=%2B380661234567")).toBe("viber://chat?number=%2B380661234567");
    expect(normalizeViber("viber://chat?number=+380661234567")).toBe("viber://chat?number=%2B380661234567");
    expect(normalizeViber("https://invite.viber.com/?g2=AQBabc")).toBe("https://invite.viber.com/?g2=AQBabc");
    expect(normalizeViber("viber://forward?text=x")).toBeNull();
    expect(normalizeViber("https://viber.example/chat")).toBeNull();
  });

  it("turns a phone number or a chat link into a WhatsApp link", () => {
    expect(normalizeWhatsApp("+380 66 123 45 67")).toBe("https://wa.me/380661234567");
    expect(normalizeWhatsApp("wa.me/380661234567")).toBe("https://wa.me/380661234567");
    expect(normalizeWhatsApp("https://api.whatsapp.com/send?phone=380661234567&text=hi")).toBe("https://wa.me/380661234567");
    expect(normalizeWhatsApp("https://chat.whatsapp.com/AbCdEfGhIj12")).toBe("https://chat.whatsapp.com/AbCdEfGhIj12");
    expect(normalizeWhatsApp("123")).toBeNull();
    expect(normalizeWhatsApp("https://evil.example/380661234567")).toBeNull();
  });
});

describe("parseContactsForm", () => {
  it("normalizes every field and clears empty ones", () => {
    const parsed = parseContactsForm({
      shopName: "  Trend   Jewelry Store ",
      instagram: "@trend_jewelry_store08",
      email: "shop@example.com",
      phone: "+38 (066)  830 10 29",
      telegram: "@tjs_shop",
      viber: "",
      whatsapp: "  ",
      telegramChatId: "-1001234567890",
    });
    expect(parsed).toEqual({
      ok: true,
      row: {
        shop_name: "Trend Jewelry Store",
        instagram_handle: "trend_jewelry_store08",
        email: "shop@example.com",
        phone: "+38 (066) 830 10 29",
        telegram_url: "https://t.me/tjs_shop",
        viber_url: null,
        whatsapp_url: null,
        telegram_chat_id: "-1001234567890",
      },
    });
  });

  it("reports each invalid field", () => {
    expect(
      parseContactsForm({ email: "nope", phone: "call me", telegramChatId: "@group", instagram: "x".repeat(301), shopName: "s".repeat(101) }),
    ).toEqual({
      ok: false,
      fields: { email: "invalid", phone: "invalid", telegramChatId: "invalid", instagram: "tooLong", shopName: "tooLong" },
    });
    expect(parseContactsForm({ email: "a?cc=evil@x.example@y.com" })).toEqual({ ok: false, fields: { email: "invalid" } });
  });

  it("round-trips through the form values", () => {
    const parsed = parseContactsForm({ instagram: "tjs", viber: "+380661234567", email: "a@b.cd" });
    if (!parsed.ok) throw new Error("expected ok");
    expect(parseContactsForm(contactFormValues(parsed.row))).toEqual(parsed);
  });
});

describe("shopContacts", () => {
  it("lists only the configured channels, in display order, with their links", () => {
    expect(
      shopContacts({
        shop_name: null,
        instagram_handle: "tjs",
        email: "shop@example.com",
        phone: "+38 (066) 830 10 29",
        telegram_url: null,
        viber_url: null,
        whatsapp_url: "https://wa.me/380668301029",
        telegram_chat_id: null,
      } as never),
    ).toEqual({
      shopName: null,
      channels: [
        { kind: "phone", href: "tel:+380668301029", text: "+38 (066) 830 10 29" },
        { kind: "instagram", href: "https://www.instagram.com/tjs/", text: "@tjs" },
        { kind: "whatsapp", href: "https://wa.me/380668301029" },
        { kind: "email", href: "mailto:shop@example.com", text: "shop@example.com" },
      ],
    });
  });
});
