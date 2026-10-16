// The owner's Telegram message (D11, D20): every value from the order is HTML-escaped, the text is the uk
// snapshot, and the bot token never leaves the request URL.
import { describe, expect, it, vi } from "vitest";
import { escapeHtml, truncate } from "@/lib/notifications/escape";
import { renderTelegramOrder, sendTelegram, TELEGRAM_LOCALE, TELEGRAM_MAX_LINES } from "@/lib/notifications/telegram";
import { notificationsTranslator } from "@/lib/notifications/texts";
import { berlinCourierOrder, kyivBranchOrder } from "./fixtures";

const ADMIN_URL = "https://shop.example.test/uk/admin/orders/10042";

async function render(order = kyivBranchOrder()) {
  const t = await notificationsTranslator(TELEGRAM_LOCALE);
  return renderTelegramOrder(order, { t, locale: TELEGRAM_LOCALE, adminUrl: ADMIN_URL });
}

// The tags of a Telegram HTML text, in order: only the ones the template writes may appear
function tags(text: string): string[] {
  return [...text.matchAll(/<\/?([a-z]+)[^>]*>/g)].map((match) => match[1]);
}

describe("escapeHtml", () => {
  it("escapes &, <, > and quotes", () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;");
  });

  it("cuts by code points, never inside a character", () => {
    expect(truncate("Коралі💎💎", 7)).toBe("Коралі…");
    expect(truncate("short", 7)).toBe("short");
  });
});

describe("renderTelegramOrder", () => {
  it("matches the uk snapshot", async () => {
    await expect(await render()).toMatchFileSnapshot("__snapshots__/telegram-order.uk.txt");
  });

  it("escapes <, > and & in the names, the comment, the titles and the destination", async () => {
    const text = await render(
      kyivBranchOrder({
        destination: { kind: "point", place: "Київ <x>", point: "Відділення & <y>" },
      }),
    );
    expect(text).toContain("Олена &lt;b&gt; Коваль &amp; Co");
    expect(text).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; дякую &gt; 1");
    expect(text).toContain("Сережки «Корали» &lt;i&gt;");
    expect(text).toContain("Брошка Тюльпан &amp; Ко");
    expect(text).toContain("Відділення &amp; &lt;y&gt;");
    expect(text).toContain("Київ &lt;x&gt;");
    // no tag but the template's own: bold labels and the two links
    expect(new Set(tags(text))).toEqual(new Set(["b", "a"]));
    expect(text).not.toMatch(/&(?!amp;|lt;|gt;|quot;|#39;)/);
  });

  it("links the phone and the admin order", async () => {
    const text = await render();
    expect(text).toContain('<a href="tel:+380501234567">+380501234567</a>');
    expect(text).toContain(`<a href="${ADMIN_URL}">`);
  });

  it("leaves out an empty comment instead of printing it", async () => {
    const text = await render(kyivBranchOrder({ comment: null }));
    expect(text).not.toContain("Коментар");
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("null");
  });

  it("names a courier address abroad, a TBD estimate and the USD total", async () => {
    const text = await render(berlinCourierOrder());
    expect(text).toContain("Nova Post, кур&#39;єром на адресу");
    expect(text).toContain("Invalidenstr. 1, кв. 3 &lt;a&gt;");
    expect(text).toContain("10115 Berlin");
    expect(text).toContain("Німеччина");
    expect(text).toContain("Оцінка: TBD");
    expect(text).toMatch(/29,90\s€/);
    // the owner's prices are in USD (D4): the goods total in USD next to the customer's currency
    expect(text).toMatch(/29,90\s€<\/b> \(31\s\$\)/);
  });

  it("keeps a long order below Telegram's 4096 characters", async () => {
    const long = "Дуже довга назва виробу & <тег> ".repeat(10);
    const lines = Array.from({ length: 50 }, (_, index) => ({ title: `${index} ${long}`, titleLocale: "uk", quantity: 10, lineMinor: 99_999_00 }));
    const text = await render(kyivBranchOrder({ lines, comment: "к".repeat(1000) }));
    const visible = text.replace(/<[^>]+>/g, "").replace(/&(amp|lt|gt|quot|#39);/g, "_");
    expect(visible.length).toBeLessThan(4096);
    expect(text).toContain(`${TELEGRAM_MAX_LINES}. `);
    expect(text).not.toContain(`${TELEGRAM_MAX_LINES + 1}. `);
    expect(text).toContain(`…і ще ${50 - TELEGRAM_MAX_LINES} рядків`);
  });
});

describe("sendTelegram", () => {
  const config = { token: "123456:SECRET-token", chatId: "-1001234567890", apiBaseUrl: "https://api.telegram.test" };

  it("posts the text with parse_mode HTML to the configured chat", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ ok: true, result: { message_id: 1 } }));
    expect(await sendTelegram(config, "<b>hi</b>", fetchImpl)).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.telegram.test/bot123456:SECRET-token/sendMessage");
    expect(JSON.parse(String(init?.body))).toEqual({
      chat_id: "-1001234567890",
      text: "<b>hi</b>",
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  });

  it("reports Telegram's refusal without the token", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({ ok: false, error_code: 400, description: "Bad Request: can't parse entities (bot123456:SECRET-token)" }, { status: 400 }),
    );
    const result = await sendTelegram(config, "x", fetchImpl);
    expect(result).toEqual({ ok: false, error: "telegram: HTTP 400: Bad Request: can't parse entities (bot<token>)" });
  });

  it("hands on Telegram's retry_after of a 429", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json(
        { ok: false, error_code: 429, description: "Too Many Requests: retry after 35", parameters: { retry_after: 35 } },
        { status: 429 },
      ),
    );
    expect(await sendTelegram(config, "x", fetchImpl)).toEqual({
      ok: false,
      error: "telegram: HTTP 429: Too Many Requests: retry after 35",
      retryAfterSeconds: 35,
    });
  });

  it("waits a minute after a 429 without retry_after, and at most an hour", async () => {
    const answer = (body: object) => vi.fn<typeof fetch>(async () => Response.json(body, { status: 429 }));
    expect(await sendTelegram(config, "x", answer({ ok: false }))).toMatchObject({ retryAfterSeconds: 60 });
    expect(await sendTelegram(config, "x", answer({ ok: false, parameters: { retry_after: 86_400 } }))).toMatchObject({ retryAfterSeconds: 3600 });
    expect(await sendTelegram(config, "x", answer({ ok: false, parameters: { retry_after: 2.5 } }))).toMatchObject({ retryAfterSeconds: 3 });
  });

  it("reports a network failure by its name only: the error's message may quote the URL with the token", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw Object.assign(new TypeError(`fetch failed: ${config.apiBaseUrl}/bot${config.token}/sendMessage`), { cause: { code: "ECONNRESET" } });
    });
    const result = await sendTelegram(config, "x", fetchImpl);
    expect(result).toEqual({ ok: false, error: "telegram: TypeError ECONNRESET" });
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });
});
