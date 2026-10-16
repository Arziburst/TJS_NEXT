// The customer's emails (D11, D19): rendered in the order's locale (snapshots in uk and de), every customer value
// escaped, the shop's channels or the visible TBD, the delivery estimate note, and no payment wording.
import { describe, expect, it } from "vitest";
import { renderOrderConfirmation } from "@/emails/order-confirmation";
import { renderOrderStatusChange } from "@/emails/order-status";
import type { ShopContacts } from "@/lib/notifications/contacts";
import { notificationsTranslator } from "@/lib/notifications/texts";
import { berlinCourierOrder, kyivBranchOrder } from "./fixtures";

const siteUrl = new URL("https://shop.example.test");

const contacts: ShopContacts = {
  shopName: null,
  channels: [
    { kind: "phone", href: "tel:+380661234567", text: "+38 (066) 123-45-67" },
    { kind: "instagram", href: "https://www.instagram.com/tjs_shop/", text: "@tjs_shop" },
    { kind: "telegram", href: "https://t.me/tjs_shop" },
    { kind: "email", href: "mailto:hello@example.test", text: "hello@example.test" },
  ],
};

async function confirmation(order = kyivBranchOrder(), shop: ShopContacts | null = contacts) {
  return renderOrderConfirmation(order, { t: await notificationsTranslator(order.locale), contacts: shop, siteUrl });
}

describe("renderOrderConfirmation", () => {
  it("matches the uk snapshot (a Kyiv branch, the shop's channels)", async () => {
    const email = await confirmation();
    expect(email.subject).toBe("Ваш запит на замовлення № 10042 отримано");
    await expect(email.html).toMatchFileSnapshot("__snapshots__/order-confirmation.uk.html");
    await expect(email.text).toMatchFileSnapshot("__snapshots__/order-confirmation.uk.txt");
  });

  it("matches the de snapshot (a courier to Berlin, TBD estimate, no channels yet)", async () => {
    const email = await confirmation(berlinCourierOrder(), null);
    expect(email.subject).toBe("Ihre Bestellanfrage Nr. 10043 ist eingegangen");
    await expect(email.html).toMatchFileSnapshot("__snapshots__/order-confirmation.de.html");
    await expect(email.text).toMatchFileSnapshot("__snapshots__/order-confirmation.de.txt");
  });

  it("is in the order's language", async () => {
    const { html } = await confirmation(berlinCourierOrder(), null);
    expect(html).toContain('<html lang="de"');
    expect(html).toContain("Danke, Jürgen! Ihre Bestellanfrage ist eingegangen.");
  });

  it("escapes every customer value in the HTML part", async () => {
    const { html } = await confirmation();
    expect(html).toContain("Дякуємо, Олена &lt;b&gt;!");
    expect(html).toContain("Сережки «Корали» &lt;i&gt;");
    expect(html).toContain("Брошка Тюльпан &amp; Ко");
    expect(html).not.toContain("<i>");
    expect(html).not.toContain("<b>");
    const { html: berlin } = await confirmation(berlinCourierOrder(), null);
    expect(berlin).toContain("3 &lt;a&gt;");
  });

  it("carries the number, the lines, the total and the delivery estimate with the on-receipt note (D37, D38)", async () => {
    const { text } = await confirmation();
    expect(text).toContain("Номер замовлення: 10042");
    expect(text).toMatch(/Сережки «Корали» <i> × 2: 2\s578\s₴/);
    expect(text).toMatch(/Разом за вироби: 4\s107\s₴/);
    expect(text).toMatch(/Доставка \(орієнтовно\): ≈ 80\s₴/);
    expect(text).toContain("фактичну вартість доставки ви оплачуєте перевізнику під час отримання");
  });

  it("names the size each line was ordered in (#66)", async () => {
    const { text, html } = await confirmation(
      kyivBranchOrder({ lines: [{ title: "Каблучка", titleLocale: "uk", variantLabel: "17,5", quantity: 2, lineMinor: 1_578_00 }] }),
    );
    expect(text).toMatch(/Каблучка \(17,5\) × 2: 1\s578\s₴/);
    expect(html).toContain("Каблучка (17,5)");
  });

  it("lists the shop's channels as links, or the visible TBD line while there are none", async () => {
    const { html, text } = await confirmation();
    expect(html).toContain('<a href="https://www.instagram.com/tjs_shop/"');
    expect(html).toContain('<a href="tel:+380661234567"');
    expect(text).toContain("Telegram: https://t.me/tjs_shop");
    const { html: tbd, text: tbdText } = await confirmation(berlinCourierOrder(), null);
    expect(tbd).toContain("Kontaktkanäle: TBD");
    expect(tbdText).toContain("Kontaktkanäle: TBD");
  });

  it("asks for no payment (storefront mode, D19)", async () => {
    const t = await notificationsTranslator("en");
    const en = renderOrderConfirmation(kyivBranchOrder({ locale: "en" }), { t, contacts, siteUrl });
    for (const part of [en.subject, en.html, en.text]) {
      expect(part).not.toMatch(/payment|buy now|pay now|card|invoice/i);
    }
  });

  it("names the customs notice only for a parcel abroad", async () => {
    expect((await confirmation(berlinCourierOrder(), null)).text).toContain("Einfuhrumsatzsteuer");
    expect((await confirmation()).text).not.toContain("ПДВ");
  });
});

describe("renderOrderStatusChange (for #27)", () => {
  it("matches the en and uk snapshots", async () => {
    for (const [locale, status] of [
      ["en", "in_processing"],
      ["uk", "accepted"],
    ] as const) {
      const order = kyivBranchOrder({ locale });
      const email = renderOrderStatusChange(order, status, { t: await notificationsTranslator(locale), contacts, siteUrl });
      await expect(`${email.subject}\n\n${email.text}`).toMatchFileSnapshot(`__snapshots__/order-status.${locale}.txt`);
      await expect(email.html).toMatchFileSnapshot(`__snapshots__/order-status.${locale}.html`);
    }
  });

  it("names the new status in the customer's language", async () => {
    const order = berlinCourierOrder();
    const email = renderOrderStatusChange(order, "canceled", { t: await notificationsTranslator("de"), contacts: null, siteUrl });
    expect(email.subject).toBe("Bestellung Nr. 10043: Storniert");
    expect(email.html).toContain("Der Status Ihrer Bestellung Nr. 10043 ist jetzt: Storniert.");
  });
});
